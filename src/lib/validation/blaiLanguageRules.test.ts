import { describe, it, expect } from "vitest";
import {
  findProfanityWords,
  findAbuseWords,
  findAdultWords,
  findCommercialWords,
  findEmphasisWords,
  findAdvertisingWords,
} from "./blaiLanguageRules";

/**
 * 블로그 언어 규칙(BLAI) 회귀 테스트(순수 함수, CLI 0).
 * 비속어/비하/민감/상업어/강조어/광고어 탐지 + 가장자리 오탐 방지(법적).
 */

describe("findProfanityWords / findAbuseWords / findAdultWords", () => {
  it("비속어를 검출한다", () => {
    expect(findProfanityWords("시발 정말")).toContain("시발");
  });
  it("비하/혐오 표현을 검출한다", () => {
    expect(findAbuseWords("혐오 표현 포함")).toContain("혐오");
  });
  it("민감(성인) 표현을 검출한다", () => {
    expect(findAdultWords("음란 콘텐츠")).toContain("음란");
  });
  it("정상 문장은 빈 배열", () => {
    expect(findProfanityWords("안경을 새로 맞췄어요")).toHaveLength(0);
    expect(findAbuseWords("편안한 착용감")).toHaveLength(0);
  });
});

describe("findCommercialWords / findEmphasisWords / findAdvertisingWords", () => {
  it("상업어를 검출한다", () => {
    expect(findCommercialWords("이번 할인 이벤트")).toEqual(
      expect.arrayContaining(["할인", "이벤트"])
    );
  });
  it("강조어를 검출한다", () => {
    expect(findEmphasisWords("가장 완벽한 렌즈")).toEqual(
      expect.arrayContaining(["가장", "완벽"])
    );
  });
  it("광고어를 검출한다", () => {
    expect(findAdvertisingWords("협찬 받아 작성")).toContain("협찬");
  });
  it("중복은 한 번만 반환한다", () => {
    expect(findCommercialWords("할인 할인 할인")).toEqual(["할인"]);
  });
});

describe("가장자리 오탐 방지(법적)", () => {
  it("'가장자리'만 있으면 강조어 '가장'으로 잡지 않는다", () => {
    expect(findEmphasisWords("렌즈 가장자리가 두껍습니다")).not.toContain("가장");
  });
  it("'가장자리'가 있어도 별도 '가장'이 있으면 검출한다", () => {
    expect(findEmphasisWords("가장자리가 가장 두껍다")).toContain("가장");
  });
});
