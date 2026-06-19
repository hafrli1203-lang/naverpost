/**
 * Regression guard for auditPosting (블라이 발행 전 포스팅 통합 점검).
 * Pure local analysis — no Naver credentials, no AI, no network.
 * Tests pin the CURRENT contract, including the always-on "no image" warning
 * (a plain body without an image marker is always flagged → status "review").
 * (S1 Phase 1 — tests only, no source change.)
 */
import { describe, it, expect } from "vitest";
import { auditPosting } from "./postingAudit";

// A clean body that carries an image marker so the always-on image warning
// does not fire, and avoids every flagged term (note: "노출" is an ADULT flag).
const cleanBody = [
  "안경렌즈 코팅 관리 이야기를 풀어봅니다",
  "(이미지: 매장 외관)",
  "코팅 표면을 부드럽게 닦으면 오래 쓸 수 있습니다",
  "관리 습관이 안경렌즈 수명을 늘립니다",
].join("\n");

describe("auditPosting", () => {
  it("computes full query-intent coverage when all title morphemes appear in the body", () => {
    const result = auditPosting({ title: "안경렌즈 코팅 관리", body: cleanBody });
    expect(result.queryIntentFocus.coverageRatio).toBe(1);
    expect(result.queryIntentFocus.missingInBody).toEqual([]);
  });

  it("returns status ok with no warnings for a clean body that includes an image marker", () => {
    const result = auditPosting({ title: "안경렌즈 코팅 관리", body: cleanBody });
    expect(result.warnings).toEqual([]);
    expect(result.status).toBe("ok");
    expect(result.imageCount).toBe(1);
  });

  it("flags commas and switches status to review", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      body: "안경렌즈 코팅, 관리 이야기입니다 (이미지: 외관)",
    });
    expect(result.commaCount).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.includes("쉼표"))).toBe(true);
    expect(result.status).toBe("review");
  });

  it("reflects prohibited/caution terms in languageFlags and warnings", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      body: "안경렌즈 코팅 할인 관리 이야기입니다 (이미지: 외관)",
    });
    expect(result.languageFlags.commercial).toContain("할인");
    expect(result.warnings.some((w) => w.includes("주의 표현"))).toBe(true);
    expect(result.status).toBe("review");
  });

  it("warns when title-morpheme coverage in the body is low", () => {
    const result = auditPosting({
      title: "누진다초점 적응 안경",
      body: "콘택트렌즈 산소 이야기를 풀어봅니다 (이미지: 외관)",
    });
    expect(result.queryIntentFocus.coverageRatio).toBeLessThan(0.6);
    expect(result.warnings.some((w) => w.includes("활성화율"))).toBe(true);
  });

  it("always warns when the body has no image marker (current contract)", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      body: "안경렌즈 코팅 관리 이야기를 풀어봅니다 코팅 관리 안경렌즈 수명",
    });
    expect(result.imageCount).toBe(0);
    expect(result.warnings.some((w) => w.includes("이미지가 없습니다"))).toBe(true);
    expect(result.status).toBe("review");
  });
});

// ---- Phase 2: additive heuristic signals (non-blocking, opt-in fields) ----

describe("auditPosting — main keyword placement signals (Phase 2)", () => {
  it("reports mainKeywordInIntro true when the main keyword sits in the first 200 chars", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      body: "안경렌즈 코팅 관리 이야기를 시작합니다 (이미지: 외관) 이어서 자세히 설명합니다",
    });
    expect(result.queryIntentFocus.mainKeywordInIntro).toBe(true);
  });

  it("reports mainKeywordInIntro false when the main keyword only appears after the intro window", () => {
    const filler = "관리 습관에 대한 이야기를 길게 풀어봅니다 ".repeat(12); // > 200 chars
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      body: `${filler}\n안경렌즈 코팅 이야기는 마지막에 나옵니다`,
    });
    expect(result.queryIntentFocus.mainKeywordInIntro).toBe(false);
  });

  it("reports mainKeywordInSubheading true when a markdown heading contains the main keyword", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      body: "## 안경렌즈 코팅 관리법\n표면을 부드럽게 닦습니다 (이미지: 외관)",
    });
    expect(result.queryIntentFocus.mainKeywordInSubheading).toBe(true);
  });

  it("reports mainKeywordInSubheading false for a plain body with no subheadings", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      body: "안경렌즈 코팅 관리 이야기를 평문으로만 적습니다 (이미지: 외관)",
    });
    expect(result.queryIntentFocus.mainKeywordInSubheading).toBe(false);
  });

  it("leaves placement signals undefined when no main keyword is provided", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      body: "안경렌즈 코팅 관리 이야기입니다 (이미지: 외관)",
    });
    expect(result.queryIntentFocus.mainKeywordInIntro).toBeUndefined();
    expect(result.queryIntentFocus.mainKeywordInSubheading).toBeUndefined();
  });
});

describe("auditPosting — sub keyword coverage signals (Phase 2)", () => {
  it("marks both sub keywords present when each appears in the body", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      subKeyword1: "코팅 관리",
      subKeyword2: "렌즈 수명",
      body: "안경렌즈 코팅 관리 습관이 렌즈 수명을 늘립니다 (이미지: 외관)",
    });
    expect(result.subKeywordCoverage).toEqual([
      { keyword: "코팅 관리", present: true },
      { keyword: "렌즈 수명", present: true },
    ]);
  });

  it("marks only the present sub keyword when one is missing", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      subKeyword1: "코팅 관리",
      subKeyword2: "렌즈 수명",
      body: "안경렌즈 코팅 관리 습관 이야기입니다 (이미지: 외관)",
    });
    expect(result.subKeywordCoverage).toEqual([
      { keyword: "코팅 관리", present: true },
      { keyword: "렌즈 수명", present: false },
    ]);
  });

  it("marks both sub keywords absent when neither appears", () => {
    const result = auditPosting({
      title: "안경렌즈 코팅 관리",
      mainKeyword: "안경렌즈 코팅",
      subKeyword1: "코팅 관리",
      subKeyword2: "렌즈 수명",
      body: "전혀 다른 주제의 본문입니다 (이미지: 외관)",
    });
    expect(result.subKeywordCoverage).toEqual([
      { keyword: "코팅 관리", present: false },
      { keyword: "렌즈 수명", present: false },
    ]);
  });
});
