import { describe, it, expect } from "vitest";
import { tokenizeMeaningfulTitle, analyzeTitleSimilarity } from "./titleSimilarity";

/**
 * 제목 유사도 회귀 테스트(순수 함수, CLI 0).
 * 제목 중복 판정·title-similarity API의 핵심. 동일/유사 제목은 high, 무관 제목은 low.
 */

describe("tokenizeMeaningfulTitle", () => {
  it("불용어(방법/기준 등)를 제거하고 의미 토큰만 남긴다", () => {
    expect(tokenizeMeaningfulTitle("누진렌즈 적응 방법")).toEqual(["누진렌즈", "적응"]);
  });
  it("조사를 떼어 같은 토큰으로 본다", () => {
    expect(tokenizeMeaningfulTitle("적응을 위한 누진렌즈")).toContain("적응");
  });
  it("중복 토큰은 한 번만", () => {
    const tokens = tokenizeMeaningfulTitle("안경 안경 렌즈");
    expect(tokens.filter((t) => t === "안경")).toHaveLength(1);
  });
});

describe("analyzeTitleSimilarity", () => {
  it("비교 대상이 없으면 low/0%", () => {
    const r = analyzeTitleSimilarity("누진렌즈 적응 방법", []);
    expect(r.percent).toBe(0);
    expect(r.risk).toBe("low");
  });

  it("완전히 같은 제목은 100%/high", () => {
    const r = analyzeTitleSimilarity("누진렌즈 적응 방법", ["누진렌즈 적응 방법"]);
    expect(r.percent).toBe(100);
    expect(r.risk).toBe("high");
  });

  it("핵심 토큰이 모두 겹치는 제목은 high", () => {
    const r = analyzeTitleSimilarity("누진렌즈 적응 시야 정리", ["누진렌즈 적응 시야 방법"]);
    expect(r.risk).toBe("high");
    expect(r.sharedTokens).toEqual(expect.arrayContaining(["누진렌즈", "적응", "시야"]));
  });

  it("주제가 완전히 다른 제목은 low", () => {
    const r = analyzeTitleSimilarity("안경테 얼굴형 추천", ["콘택트렌즈 착용 비교"]);
    expect(r.risk).toBe("low");
  });

  it("여러 대상 중 가장 유사한 것을 반환한다", () => {
    const r = analyzeTitleSimilarity("누진렌즈 적응 시야 정리", [
      "안경테 소재 비교",
      "누진렌즈 적응 시야 방법",
    ]);
    expect(r.matchedTitle).toBe("누진렌즈 적응 시야 방법");
    expect(r.risk).toBe("high");
  });
});
