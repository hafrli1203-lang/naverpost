import { describe, expect, it } from "vitest";
import {
  isRegionWord,
  startsWithRegionWord,
  isValidTwoWordKeyword,
  hasMalformedCompoundAxis,
  isCategoryAppropriateCandidate,
} from "./categoryGate";
import type { KeywordOption } from "@/types";

/** 테스트용 후보 생성(필요한 필드만, 나머지는 기본). */
function opt(p: Partial<KeywordOption>): KeywordOption {
  return {
    title: p.title ?? "안경테 얼굴형 추천",
    mainKeyword: p.mainKeyword ?? "안경테 얼굴형",
    subKeyword1: p.subKeyword1 ?? "안경테 소재",
    subKeyword2: p.subKeyword2 ?? "안경테 무게",
  } as KeywordOption;
}

describe("isRegionWord / startsWithRegionWord", () => {
  it("매장 지역어로 시작하면 true", () => {
    expect(isRegionWord("김해")).toBe(true);
    expect(isRegionWord("충남대점")).toBe(true);
    expect(startsWithRegionWord("장유 안경원 추천")).toBe(true);
  });
  it("일반 단어/뒤쪽 지역어는 false", () => {
    expect(isRegionWord("안경테")).toBe(false);
    expect(startsWithRegionWord("안경 김해")).toBe(false); // 첫 토큰만 본다
  });
});

describe("isValidTwoWordKeyword", () => {
  it("2~3 토큰은 통과", () => {
    expect(isValidTwoWordKeyword("안경테 추천")).toBe(true);
    expect(isValidTwoWordKeyword("누진렌즈 적응 방법")).toBe(true);
  });
  it("1토큰/4토큰은 탈락", () => {
    expect(isValidTwoWordKeyword("안경")).toBe(false);
    expect(isValidTwoWordKeyword("a b c d")).toBe(false);
  });
});

describe("hasMalformedCompoundAxis", () => {
  it("수식어+상품을 한 토큰으로 붙이면 true", () => {
    expect(hasMalformedCompoundAxis("야간운전안경렌즈")).toBe(true);
    expect(hasMalformedCompoundAxis("누진렌즈적응")).toBe(true);
  });
  it("공백으로 분리된 정상 조합은 false", () => {
    expect(hasMalformedCompoundAxis("안경렌즈 코팅")).toBe(false);
    expect(hasMalformedCompoundAxis("누진렌즈 적응")).toBe(false);
  });
});

describe("isCategoryAppropriateCandidate", () => {
  it("정상 frames 후보는 통과", () => {
    expect(isCategoryAppropriateCandidate("frames", opt({}))).toBe(true);
  });

  it("2단어 위반 후보 탈락", () => {
    expect(isCategoryAppropriateCandidate("frames", opt({ mainKeyword: "안경" }))).toBe(false);
  });

  it("합성축 오류 후보 탈락", () => {
    expect(
      isCategoryAppropriateCandidate("lenses", opt({ mainKeyword: "야간운전안경렌즈" }))
    ).toBe(false);
  });

  it("브랜드명/전문수치 후보 탈락", () => {
    expect(isCategoryAppropriateCandidate("contacts", opt({ mainKeyword: "아큐브 오아시스" }))).toBe(false);
    expect(isCategoryAppropriateCandidate("contacts", opt({ subKeyword1: "함수율 비교" }))).toBe(false);
  });

  it("지역어로 시작하는 후보 탈락(생성기에 지역 박힘 방지)", () => {
    expect(
      isCategoryAppropriateCandidate("frames", opt({ title: "안경 정보", mainKeyword: "김해안경 추천" }))
    ).toBe(false);
  });

  it("프롬프트 스캐폴드 누수 탈락", () => {
    expect(
      isCategoryAppropriateCandidate("frames", opt({ subKeyword2: "main_keyword 값" }))
    ).toBe(false);
  });

  describe("카테고리별 도메인 누수 차단", () => {
    it("frames에 콘택트/선글라스/누진 누수 탈락", () => {
      expect(isCategoryAppropriateCandidate("frames", opt({ subKeyword1: "콘택트렌즈 도수" }))).toBe(false);
      expect(isCategoryAppropriateCandidate("frames", opt({ subKeyword1: "선글라스 추천" }))).toBe(false);
    });
    it("lenses에 콘택트렌즈/선글라스 누수 탈락(안경렌즈 상품어는 통과)", () => {
      expect(isCategoryAppropriateCandidate("lenses", opt({ mainKeyword: "콘택트렌즈 도수" }))).toBe(false);
      // 고굴절/변색/블루라이트는 안경렌즈이므로 통과해야 한다
      expect(
        isCategoryAppropriateCandidate(
          "lenses",
          opt({ mainKeyword: "고굴절렌즈 두께", subKeyword1: "고굴절렌즈 무게", subKeyword2: "고굴절렌즈 도수" })
        )
      ).toBe(true);
    });
    it("contacts에 계절/가족 키워드 누수 탈락", () => {
      expect(isCategoryAppropriateCandidate("contacts", opt({ subKeyword1: "자외선 차단" }))).toBe(false);
    });
    it("eye-info에 콘택트 누수 탈락", () => {
      expect(isCategoryAppropriateCandidate("eye-info", opt({ subKeyword1: "원데이 착용" }))).toBe(false);
    });
  });
});
