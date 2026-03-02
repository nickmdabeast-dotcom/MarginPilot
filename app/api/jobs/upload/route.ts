import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseCSV } from "@/lib/csv";
import { validateJobRow, insertJobs } from "@/services/jobs";
import { findOrCreateTechnician } from "@/services/technicians";

// ─── POST /api/jobs/upload ────────────────────────────────────────────────────
// Body: multipart/form-data
//   file       — CSV file (required)
//   company_id — UUID string (required)
//
// Returns:
//   { success: true,  inserted: number, failed: RowError[], warnings: string[] }
//   { success: false, error: string }

export async function POST(req: NextRequest) {
  // 1. Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const companyId = formData.get("company_id");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { success: false, error: "file is required (multipart field)" },
      { status: 400 }
    );
  }

  if (!companyId || typeof companyId !== "string" || !companyId.trim()) {
    return NextResponse.json(
      { success: false, error: "company_id is required" },
      { status: 400 }
    );
  }

  // 2. Read CSV text
  let csvText: string;
  try {
    csvText = await (file as File).text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not read file contents" },
      { status: 400 }
    );
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { success: false, error: "Uploaded file is empty" },
      { status: 400 }
    );
  }

  // 3. Parse CSV
  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "CSV has no data rows (only header or empty)" },
      { status: 400 }
    );
  }

  // 4. Validate each row
  const validRows = [];
  const parseErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateJobRow(rows[i], i + 2); // +2: header is row 1
    if (result.ok) {
      validRows.push(result.data);
    } else {
      parseErrors.push(result.error);
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No valid rows found in CSV",
        failed: parseErrors,
      },
      { status: 422 }
    );
  }

  // 5. Connect to Supabase
  let db: ReturnType<typeof createServerClient>;
  try {
    db = createServerClient();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Database configuration error",
      },
      { status: 500 }
    );
  }

  // 6. Insert jobs (technician upsert handled per-row)
  const techCache = new Map<string, string>();

  const result = await insertJobs({
    rows: validRows,
    companyId: companyId.trim(),
    db,
    getTechnicianId: async (name) => {
      const { id } = await findOrCreateTechnician(name, companyId.trim(), db, techCache);
      return id;
    },
  });

  // Merge parse errors + insert errors
  const allFailed = [...parseErrors, ...result.failed];

  return NextResponse.json(
    {
      success: true,
      inserted: result.inserted,
      failed: allFailed,
      warnings: allFailed.length > 0
        ? [`${allFailed.length} row(s) skipped — see "failed" for details`]
        : [],
    },
    { status: 200 }
  );
}
