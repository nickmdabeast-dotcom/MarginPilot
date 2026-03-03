/**
 * Tests for lib/utils.ts
 *
 * Run: npx tsx --test tests/utils.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "../lib/utils.js";

describe("chunk", () => {
  it("splits an array into chunks of the given size", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when array fits within size", () => {
    assert.deepEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
  });

  it("returns an empty array for empty input", () => {
    assert.deepEqual(chunk([], 3), []);
  });

  it("handles chunk size equal to array length", () => {
    assert.deepEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
  });

  it("handles chunk size of 1", () => {
    assert.deepEqual(chunk(["a", "b", "c"], 1), [["a"], ["b"], ["c"]]);
  });

  it("throws when chunk size is less than 1", () => {
    assert.throws(() => chunk([1], 0), /chunk size must be >= 1/);
    assert.throws(() => chunk([1], -1), /chunk size must be >= 1/);
  });
});
