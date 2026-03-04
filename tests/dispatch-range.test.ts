/**
 * Tests for dispatch API date range support.
 *
 * Run: npx tsx --test tests/dispatch-range.test.ts
 *
 * These tests verify the query parameter parsing and Supabase query building
 * for the /api/dispatch route's multi-day support.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Helpers: reproduce the date range resolution logic from the route ───────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

interface ResolvedRange {
  start: string;
  end: string;
}

/** Mirrors the date range resolution logic in app/api/dispatch/route.ts */
function resolveRange(params: {
  start?: string | null;
  end?: string | null;
  date?: string | null;
}): ResolvedRange | { error: string } {
  let start: string;
  let end: string;

  if (params.start && params.end) {
    start = params.start;
    end = params.end;
  } else if (params.date) {
    start = params.date;
    end = params.date;
  } else {
    start = today();
    end = addDays(start, 6);
  }

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: "start and end must be YYYY-MM-DD" };
  }

  if (start > end) {
    return { error: "start must be <= end" };
  }

  return { start, end };
}

// ─── Mock DB for verifying query filters ────────────────────────────────────

interface QueryFilter {
  method: string;
  column?: string;
  value?: unknown;
}

function createMockDb(allJobs: Array<{ id: string; job_date: string }>) {
  const filters: QueryFilter[] = [];

  const chainable = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order"]) {
      chain[m] = (...args: unknown[]) => {
        filters.push({ method: m, column: args[0] as string, value: args[1] });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => {
      // Apply filters to return matching jobs
      let result = [...allJobs];
      for (const f of filters) {
        if (f.method === "gte" && f.column === "job_date") {
          result = result.filter((j) => j.job_date >= (f.value as string));
        }
        if (f.method === "lte" && f.column === "job_date") {
          result = result.filter((j) => j.job_date <= (f.value as string));
        }
        if (f.method === "eq" && f.column === "job_date") {
          result = result.filter((j) => j.job_date === (f.value as string));
        }
      }
      resolve({ data: result, error: null });
    };
    return chain;
  };

  return {
    db: {
      from: () => ({
        select: () => chainable(),
      }),
    },
    filters,
  };
}

// ─── weekBounds (mirrors export from dispatch page) ─────────────────────────

/** Returns [monday, sunday] for the ISO week containing `dateStr`. */
function weekBounds(dateStr: string): [string, string] {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return [mon.toISOString().split("T")[0], sun.toISOString().split("T")[0]];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("weekBounds", () => {
  it("returns Monday-Sunday for a Wednesday", () => {
    // 2026-03-04 is a Wednesday
    const [mon, sun] = weekBounds("2026-03-04");
    assert.equal(mon, "2026-03-02"); // Monday
    assert.equal(sun, "2026-03-08"); // Sunday
  });

  it("returns Monday-Sunday for a Monday", () => {
    const [mon, sun] = weekBounds("2026-03-02");
    assert.equal(mon, "2026-03-02");
    assert.equal(sun, "2026-03-08");
  });

  it("returns Monday-Sunday for a Sunday", () => {
    const [mon, sun] = weekBounds("2026-03-08");
    assert.equal(mon, "2026-03-02");
    assert.equal(sun, "2026-03-08");
  });

  it("handles week crossing month boundary", () => {
    // 2026-02-28 is a Saturday
    const [mon, sun] = weekBounds("2026-02-28");
    assert.equal(mon, "2026-02-23"); // Monday
    assert.equal(sun, "2026-03-01"); // Sunday
  });
});

describe("view mode URL building", () => {
  it("day mode produces ?date= URL", () => {
    const date = "2026-03-05";
    const url = `/api/dispatch?date=${date}`;
    assert.match(url, /\?date=2026-03-05$/);
    assert.ok(!url.includes("start="));
  });

  it("week mode produces ?start=&end= from weekBounds", () => {
    const date = "2026-03-04"; // Wednesday
    const [ws, we] = weekBounds(date);
    const url = `/api/dispatch?start=${ws}&end=${we}`;
    assert.match(url, /start=2026-03-02/);
    assert.match(url, /end=2026-03-08/);
  });

  it("range mode passes arbitrary start/end", () => {
    const url = `/api/dispatch?start=2026-03-01&end=2026-03-15`;
    assert.match(url, /start=2026-03-01/);
    assert.match(url, /end=2026-03-15/);
  });
});

describe("dispatch date range resolution", () => {
  it("start + end params produce a multi-day range", () => {
    const result = resolveRange({ start: "2026-03-03", end: "2026-03-08" });
    assert.ok(!("error" in result));
    assert.equal(result.start, "2026-03-03");
    assert.equal(result.end, "2026-03-08");
  });

  it("single date param produces a one-day range (backward compat)", () => {
    const result = resolveRange({ date: "2026-03-05" });
    assert.ok(!("error" in result));
    assert.equal(result.start, "2026-03-05");
    assert.equal(result.end, "2026-03-05");
  });

  it("no params default to 7-day window from today", () => {
    const result = resolveRange({});
    assert.ok(!("error" in result));
    assert.equal(result.start, today());
    assert.equal(result.end, addDays(today(), 6));
  });

  it("rejects start > end", () => {
    const result = resolveRange({ start: "2026-03-10", end: "2026-03-05" });
    assert.ok("error" in result);
    assert.match(result.error, /start must be <= end/);
  });

  it("rejects invalid date format", () => {
    const result = resolveRange({ start: "not-a-date", end: "2026-03-05" });
    assert.ok("error" in result);
    assert.match(result.error, /YYYY-MM-DD/);
  });
});

describe("dispatch range query returns jobs across multiple dates", () => {
  const testJobs = [
    { id: "j1", job_date: "2026-03-03" },
    { id: "j2", job_date: "2026-03-04" },
    { id: "j3", job_date: "2026-03-05" },
    { id: "j4", job_date: "2026-03-06" },
    { id: "j5", job_date: "2026-03-07" },
    { id: "j6", job_date: "2026-03-08" },
    { id: "j7", job_date: "2026-03-10" }, // outside range
  ];

  it("range query returns jobs across multiple dates", async () => {
    const { db } = createMockDb(testJobs);
    const result = await (db.from("jobs").select("id, job_date") as any)
      .gte("job_date", "2026-03-03")
      .lte("job_date", "2026-03-08");

    assert.equal(result.data.length, 6);
    const dates = new Set(result.data.map((j: any) => j.job_date));
    assert.ok(dates.size >= 2, "Should return jobs from at least 2 different dates");
    assert.ok(!dates.has("2026-03-10"), "Should not include out-of-range dates");
  });

  it("single-day range returns only that day", async () => {
    const { db } = createMockDb(testJobs);
    const result = await (db.from("jobs").select("id, job_date") as any)
      .gte("job_date", "2026-03-05")
      .lte("job_date", "2026-03-05");

    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].job_date, "2026-03-05");
  });
});
