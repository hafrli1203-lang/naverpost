/**
 * Regression guard for keyword option validation rules (spec rules 1/3/5/6/8/9)
 * plus the exported helpers titleContainsMainKeyword and titleSimilarity.
 * Pure functions, no external calls. Pins the CURRENT contract.
 * (S1 Phase 1 — tests only, no source change.)
 */
import { describe, it, expect } from "vitest";
import type { KeywordOption } from "@/types";
import {
  validateKeywordOption,
  titleContainsMainKeyword,
  titleSimilarity,
} from "./keywordRules";

function makeOption(overrides: Partial<KeywordOption> = {}): KeywordOption {
  return {
    title: "안경렌즈 코팅 오래 쓰는 관리법",
    mainKeyword: "안경렌즈 코팅",
    subKeyword1: "코팅 관리",
    subKeyword2: "렌즈 수명",
    ...overrides,
  };
}

// "안경렌즈 코팅 " is 8 chars; pad with filler to hit an exact title length.
function titleOfLength(length: number): string {
  const prefix = "안경렌즈 코팅 ";
  return prefix + "가".repeat(Math.max(0, length - prefix.length));
}

describe("validateKeywordOption", () => {
  it("accepts a well-formed option", () => {
    const result = validateKeywordOption(makeOption(), [], []);
    expect(result.isValid).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("enforces the 12–32 character title length boundary (rule5)", () => {
    const hasRule5 = (title: string) =>
      validateKeywordOption(makeOption({ title }), [], []).failures.some(
        (f) => f.rule === "rule5"
      );
    expect(titleOfLength(11)).toHaveLength(11);
    expect(titleOfLength(33)).toHaveLength(33);
    expect(hasRule5(titleOfLength(11))).toBe(true); // below min
    expect(hasRule5(titleOfLength(12))).toBe(false); // at min
    expect(hasRule5(titleOfLength(32))).toBe(false); // at max
    expect(hasRule5(titleOfLength(33))).toBe(true); // above max
  });

  it("rejects commas, emoji, and list markers in the title (rule9)", () => {
    const hasRule9 = (title: string) =>
      validateKeywordOption(makeOption({ title }), [], []).failures.some(
        (f) => f.rule === "rule9"
      );
    expect(hasRule9("안경렌즈 코팅, 관리법")).toBe(true);
    expect(hasRule9("안경렌즈 코팅 관리법😀")).toBe(true);
    expect(hasRule9("1) 안경렌즈 코팅 관리")).toBe(true);
  });

  it("rejects prohibited/over-promotional terms in the title (rule8)", () => {
    const result = validateKeywordOption(
      makeOption({ title: "안경렌즈 코팅 추천 관리법" }),
      [],
      []
    );
    expect(result.failures.some((f) => f.rule === "rule8")).toBe(true);
  });

  it("flags keyword exhaustion when the main keyword already has 3+ history entries (rule6)", () => {
    const forbiddenList = [
      "안경렌즈 코팅 김서림 방지",
      "안경렌즈 코팅 관리 방법",
      "안경렌즈 코팅 수명 늘리기",
    ];
    const result = validateKeywordOption(
      makeOption({ title: "안경렌즈 코팅 새로운 이야기" }),
      forbiddenList,
      []
    );
    expect(result.failures.some((f) => f.rule === "rule6")).toBe(true);
  });
});

describe("titleContainsMainKeyword", () => {
  it("matches the main keyword verbatim", () => {
    expect(titleContainsMainKeyword("안경렌즈 코팅 관리", "안경렌즈 코팅")).toBe(true);
  });

  it("matches when a natural particle sits between the two keyword words", () => {
    expect(
      titleContainsMainKeyword("안경렌즈에 얼룩이 생기는 이유", "안경렌즈 얼룩")
    ).toBe(true);
  });

  it("does not match when the keyword words appear out of order", () => {
    expect(titleContainsMainKeyword("코팅 안경렌즈 순서뒤바뀜", "안경렌즈 코팅")).toBe(
      false
    );
  });
});

describe("titleSimilarity", () => {
  it("scores identical titles at the top of the range", () => {
    expect(titleSimilarity("안경렌즈 코팅 관리법", "안경렌즈 코팅 관리법")).toBe(1);
  });

  it("scores unrelated titles below the series threshold", () => {
    expect(
      titleSimilarity("안경렌즈 코팅 관리", "콘택트렌즈 산소 투과율")
    ).toBeLessThan(0.5);
  });
});
