import { describe, it, expect } from "vitest";
import { analyzeNetworkDuplicateRisk } from "./networkDuplicateAnalyzer";
import type { KeywordOption } from "@/types";

/**
 * 6매장 네트워크 중복 방지 회귀 테스트(순수 함수, CLI 0).
 * 핵심 제품가치: 같은 매장 재발행 금지(엄격) + 다른 블로그는 관점(서브) 다르면 허용 +
 * 조사/불용어 무시 토큰 매칭. 이 로직이 무너지면 자기잠식 또는 과잉 탈락이 발생한다.
 */

function opt(p: Partial<KeywordOption>): KeywordOption {
  return {
    title: p.title ?? "누진렌즈 적응 방법",
    mainKeyword: p.mainKeyword ?? "누진렌즈 적응",
    subKeyword1: p.subKeyword1 ?? "누진렌즈 울렁임",
    subKeyword2: p.subKeyword2 ?? "누진렌즈 시야",
  } as KeywordOption;
}

const EMPTY = { forbiddenList: [], referenceList: [] };

describe("analyzeNetworkDuplicateRisk", () => {
  it("히스토리가 비면 중복 위험 0", () => {
    const r = analyzeNetworkDuplicateRisk({ option: opt({}), ...EMPTY });
    expect(r.titlePatternOverlap).toHaveLength(0);
    expect(r.keywordCombinationOverlap).toHaveLength(0);
    expect(r.issues).toHaveLength(0);
  });

  it("같은 매장(forbiddenList)에 같은 메인 키워드 조합이 있으면 high로 잡는다", () => {
    const r = analyzeNetworkDuplicateRisk({
      option: opt({}),
      forbiddenList: ["누진렌즈 적응 후기"],
      referenceList: [],
    });
    expect(r.keywordCombinationOverlap.length).toBeGreaterThan(0);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("same-store-keyword-combination-overlap");
    expect(r.issues.some((i) => i.severity === "high")).toBe(true);
  });

  it("주제가 다르면(다른 소재) 중복으로 잡지 않는다", () => {
    const r = analyzeNetworkDuplicateRisk({
      option: opt({}),
      forbiddenList: ["안경테 얼굴형 비교"],
      referenceList: ["콘택트렌즈 착용 시간"],
    });
    expect(r.titlePatternOverlap).toHaveLength(0);
    expect(r.keywordCombinationOverlap).toHaveLength(0);
  });

  it("조사가 붙어도(적응에/적응을) 같은 토큰으로 중복 매칭한다", () => {
    const r = analyzeNetworkDuplicateRisk({
      option: opt({}),
      forbiddenList: ["누진렌즈 적응에 관한 글"],
      referenceList: [],
    });
    expect(r.keywordCombinationOverlap.length).toBeGreaterThan(0);
  });

  it("다른 블로그에서 메인+서브 관점까지 겹치면 키워드 조합 중복으로 잡는다", () => {
    const r = analyzeNetworkDuplicateRisk({
      option: opt({}),
      forbiddenList: [],
      referenceList: ["누진렌즈 적응 시야 정리"],
    });
    // 메인(누진렌즈/적응) + 서브 변별(시야) 모두 겹침
    expect(r.keywordCombinationOverlap.length).toBeGreaterThan(0);
    expect(r.expressionOverlap.length).toBeGreaterThan(0);
  });

  it("같은 제목 패턴(토큰 다수 공유)을 titlePatternOverlap으로 잡는다", () => {
    const r = analyzeNetworkDuplicateRisk({
      option: opt({}),
      forbiddenList: ["누진렌즈 적응 후기"],
      referenceList: [],
    });
    expect(r.titlePatternOverlap.length).toBeGreaterThan(0);
  });
});
