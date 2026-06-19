/**
 * Regression guard for analyzeMorphology (synchronous, dependency-free heuristic).
 * Pins the current surface-token contract: tokens are runs of [가-힣A-Za-z0-9]{2,}
 * with STOPWORDS/1-char removed; title morphemes are matched against body tokens.
 * No AI / network — analyzeMorphologyAsync (Haiku) is intentionally NOT exercised.
 * (S1 Phase 1 — tests only, no source change.)
 */
import { describe, it, expect } from "vitest";
import { analyzeMorphology } from "./morphologyAnalyzer";

describe("analyzeMorphology", () => {
  it("marks title morphemes present in the body as activated", () => {
    const result = analyzeMorphology({
      title: "안경렌즈 코팅",
      content: "안경렌즈 코팅 이야기입니다 안경렌즈 코팅 관리가 중요합니다",
    });
    expect(result.titleMorphemes).toEqual(
      expect.arrayContaining(["안경렌즈", "코팅"])
    );
    expect(result.titleMorphemesActivatedInBody).toEqual(
      expect.arrayContaining(["안경렌즈", "코팅"])
    );
    expect(result.missingTitleMorphemesInBody).toEqual([]);
  });

  it("classifies title morphemes absent from the body as missing", () => {
    const result = analyzeMorphology({
      title: "누진다초점 적응",
      content: "렌즈 이야기만 한참 풀어봅니다",
    });
    expect(result.missingTitleMorphemesInBody).toEqual(
      expect.arrayContaining(["누진다초점", "적응"])
    );
    expect(result.titleMorphemesActivatedInBody).toEqual([]);
  });

  it("raises a high-severity issue when a target keyword token is not activated in the body", () => {
    const result = analyzeMorphology({
      title: "콘택트렌즈",
      content: "안경 이야기를 길게 풀어봅니다",
      keywords: ["콘택트렌즈 산소"],
    });
    const issue = result.issues.find(
      (i) => i.code === "keyword-token-missing-in-body"
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
  });

  it("excludes stopwords and single-character tokens from morphemes", () => {
    const result = analyzeMorphology({
      title: "그리고 가",
      content: "그리고 정보 그리고 정보",
    });
    // "그리고" is a stopword, "가" is a single char — neither becomes a morpheme.
    expect(result.titleMorphemes).not.toContain("그리고");
    expect(result.titleMorphemes).not.toContain("가");
  });
});
