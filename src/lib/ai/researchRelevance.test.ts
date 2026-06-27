import { describe, it, expect } from "vitest";
import {
  extractDistinctiveTokens,
  isResearchOnTopic,
} from "./researchRelevance";

describe("extractDistinctiveTokens", () => {
  it("도메인 일반어(안경·렌즈 등)는 제외하고 변별 토큰만 남긴다", () => {
    const tokens = extractDistinctiveTokens("안경 가격 차이", "저렴한 안경");
    expect(tokens).toContain("가격");
    expect(tokens).toContain("차이");
    expect(tokens).toContain("저렴한");
    expect(tokens).not.toContain("안경");
  });

  it("2자 미만·중복은 제거된다", () => {
    const tokens = extractDistinctiveTokens("누진 누진 a 적응");
    expect(tokens).toEqual(expect.arrayContaining(["누진", "적응"]));
    expect(tokens).not.toContain("a");
    expect(tokens.filter((t) => t === "누진")).toHaveLength(1);
  });
});

describe("isResearchOnTopic", () => {
  const priceKeywords = {
    title: "싼 안경과 비싼 안경 진짜 차이",
    mainKeyword: "안경 가격 차이",
    subKeyword1: "저렴한 안경",
    subKeyword2: "안경 맞춤",
  };

  it("가격 주제인데 세척 자료가 오면 off-topic으로 판정한다(실제 드리프트 케이스)", () => {
    const cleaningResearch =
      "안경 렌즈에 기름막이 자꾸 생기는 현상은 얼굴 기름, 손자국, 화장품, 먼지가 원인이며 " +
      "중성세제로 닦고 코팅 손상을 막아야 합니다. 안경닦이는 주기적으로 세탁하세요.";
    expect(isResearchOnTopic(cleaningResearch, priceKeywords)).toBe(false);
  });

  it("자료에 변별 토큰이 들어 있으면 on-topic으로 본다", () => {
    const onTopic =
      "안경 가격 차이는 렌즈 등급과 코팅, 검안과 맞춤 과정의 정밀도에서 갈립니다. " +
      "저렴한 안경과 제대로 맞춘 안경의 착용감 차이를 설명합니다.";
    expect(isResearchOnTopic(onTopic, priceKeywords)).toBe(true);
  });

  it("자료가 비었거나 너무 짧으면 판단 보류(true)", () => {
    expect(isResearchOnTopic("", priceKeywords)).toBe(true);
    expect(isResearchOnTopic("짧은 메모", priceKeywords)).toBe(true);
  });

  it("변별 토큰이 없으면(전부 일반어) 과잉 폐기하지 않는다(true)", () => {
    const allGeneric = { mainKeyword: "안경 렌즈", subKeyword1: "눈" };
    const anyData =
      "안경 렌즈 표면의 빛 투과와 코팅에 대한 일반적인 설명을 담은 충분히 긴 자료입니다.";
    expect(isResearchOnTopic(anyData, allGeneric)).toBe(true);
  });

  it("정상 현상 주제는 on-topic으로 통과한다", () => {
    const progressive = {
      title: "누진렌즈 울렁임 적응 방법",
      mainKeyword: "누진렌즈 울렁임",
      subKeyword1: "누진렌즈 적응",
    };
    const research =
      "누진렌즈 울렁임은 시선 이동 시 도수 구간이 바뀌며 생기고 적응 기간이 필요합니다.";
    expect(isResearchOnTopic(research, progressive)).toBe(true);
  });
});
