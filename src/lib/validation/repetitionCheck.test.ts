/**
 * Regression guard for findOverusedWords — pins the current contract:
 * Korean words (2+ chars) occurring >= 20 times are returned, sorted by count desc.
 * Pure function, no external calls. (S1 Phase 1 — tests only, no source change.)
 */
import { describe, it, expect } from "vitest";
import { findOverusedWords } from "./repetitionCheck";

describe("findOverusedWords", () => {
  it("returns nothing when a word appears fewer than 20 times", () => {
    const text = "사과 ".repeat(19).trim();
    expect(findOverusedWords(text)).toEqual([]);
  });

  it("returns words with >= 20 occurrences, sorted by count descending", () => {
    const text = `${"사과 ".repeat(20)}${"바나나 ".repeat(25)}`.trim();
    const result = findOverusedWords(text);
    expect(result).toEqual([
      { word: "바나나", count: 25 },
      { word: "사과", count: 20 },
    ]);
  });

  it("includes a word at exactly the 20-occurrence threshold", () => {
    const text = "사과 ".repeat(20).trim();
    expect(findOverusedWords(text)).toEqual([{ word: "사과", count: 20 }]);
  });

  it("returns an empty array for empty input", () => {
    expect(findOverusedWords("")).toEqual([]);
  });
});
