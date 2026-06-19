/**
 * Pins the FinalConfirm fail-open data contract (no DOM / no packages):
 * buildSeoSignals(null) must be [] — i.e. when posting-audit fails or returns
 * nothing, the export screen surfaces no SEO signals (card hidden) and the
 * copy/download flow is unaffected. Pure function, runs under existing vitest.
 */
import { describe, it, expect } from "vitest";
import type { PostingAuditResult } from "@/lib/analysis/postingAudit.types";
import { buildSeoSignals } from "./finalConfirmSignals";

// Minimal audit factory — only the fields buildSeoSignals reads matter.
function makeAudit(
  q: Partial<PostingAuditResult["queryIntentFocus"]>,
  subKeywordCoverage?: PostingAuditResult["subKeywordCoverage"]
): PostingAuditResult {
  return {
    status: "ok",
    charCount: 0,
    imageCount: 0,
    commaCount: 0,
    queryIntentFocus: {
      titleMorphemes: [],
      activatedInBody: [],
      missingInBody: [],
      coverageRatio: 1,
      ...q,
    },
    subKeywordCoverage,
    topRepeatedMorphemes: [],
    uniqueBodyMorphemeCount: 0,
    overusedWords: [],
    languageFlags: {
      profanity: [],
      abuse: [],
      adult: [],
      commercial: [],
      emphasis: [],
      advertising: [],
    },
    warnings: [],
  };
}

describe("buildSeoSignals (fail-open data contract)", () => {
  it("returns [] for null audit (posting-audit failed or not yet loaded)", () => {
    expect(buildSeoSignals(null)).toEqual([]);
  });

  it("marks all three signals as pass when intro/subheading hit and all sub keywords present", () => {
    const rows = buildSeoSignals(
      makeAudit(
        { mainKeywordInIntro: true, mainKeywordInSubheading: true },
        [
          { keyword: "코팅 관리", present: true },
          { keyword: "렌즈 수명", present: true },
        ]
      )
    );
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["본문 초반 메인키워드", "pass"],
      ["소제목 메인키워드", "pass"],
      ["보조 키워드 반영", "pass"],
    ]);
  });

  it("mixes statuses: intro false → check, subheading true → pass, partial sub coverage → check", () => {
    const rows = buildSeoSignals(
      makeAudit(
        { mainKeywordInIntro: false, mainKeywordInSubheading: true },
        [
          { keyword: "코팅 관리", present: true },
          { keyword: "렌즈 수명", present: false },
        ]
      )
    );
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["본문 초반 메인키워드", "check"],
      ["소제목 메인키워드", "pass"],
      ["보조 키워드 반영", "check"],
    ]);
    expect(rows[2].detail).toBe("보조 키워드 2개 중 1개가 본문에 반영되어 있어요.");
  });

  it("omits intro/subheading rows when those fields are undefined", () => {
    const rows = buildSeoSignals(
      makeAudit({}, [{ keyword: "코팅 관리", present: true }])
    );
    expect(rows.map((r) => r.label)).toEqual(["보조 키워드 반영"]);
  });

  it("omits the sub-keyword row when subKeywordCoverage is undefined or empty", () => {
    expect(
      buildSeoSignals(makeAudit({ mainKeywordInIntro: true }, undefined)).map(
        (r) => r.label
      )
    ).toEqual(["본문 초반 메인키워드"]);
    expect(
      buildSeoSignals(makeAudit({ mainKeywordInIntro: true }, [])).map(
        (r) => r.label
      )
    ).toEqual(["본문 초반 메인키워드"]);
  });
});
