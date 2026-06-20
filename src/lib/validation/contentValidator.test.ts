import { describe, it, expect } from "vitest";
import { isProhibitedWordPresent, validateContent } from "./contentValidator";

/**
 * 의료법/광고법 금지어 필터 회귀 테스트.
 *
 * 이 모듈의 오류는 곧 고객(안경원)의 법적 리스크다. 두 방향 모두 고정한다:
 *  - 미탐(false negative): 진짜 금지어를 놓치면 위법 글이 나간다.
 *  - 오탐(false positive): 정상 단어(가장자리 등)를 막으면 멀쩡한 본문이 반려된다.
 * validateContent는 {fast:true}에서 동기·순수(외부 CLI 0)라 무비용으로 검증한다.
 */

describe("isProhibitedWordPresent — 미탐 방지(진짜 금지어 검출)", () => {
  it("의료/시술어를 검출한다", () => {
    expect(isProhibitedWordPresent("성형수술 안내드립니다", "수술")).toBe(true);
    expect(isProhibitedWordPresent("눈 치료를 권합니다", "치료")).toBe(true);
  });
  it("상거래/과장어를 검출한다", () => {
    expect(isProhibitedWordPresent("이번 할인 행사", "할인")).toBe(true);
    expect(isProhibitedWordPresent("100% 만족", "100%")).toBe(true);
  });
});

describe("isProhibitedWordPresent — 오탐 방지(허용 복합어)", () => {
  // ALLOWED_COMPOUNDS의 각 항목이 정상 단어를 막지 않는지 고정
  const allowedCases: Array<[string, string]> = [
    ["렌즈 가장자리가 두껍습니다", "가장"],
    ["예방접종 일정", "예방"],
    ["확실하지 않습니다", "확실"],
    ["정확하지 않은 도수", "정확"],
    ["안전한지 점검", "안전한"],
    ["추천하지 않는 경우", "추천"],
    ["최대한 얇게", "최대"],
    ["전문가적 시야", "전문가"],
    ["질병관리청 자료", "질병"],
    ["의료기기안전 정보", "의료"],
    ["대학병원 자료 인용", "병원"],
    ["치료 권고 기준", "치료"],
    ["의사소통이 중요", "의사"],
  ];
  it.each(allowedCases)("'%s'에서 '%s'는 금지로 잡지 않는다", (content, word) => {
    expect(isProhibitedWordPresent(content, word)).toBe(false);
  });

  it("허용 복합어가 있어도 바깥에 진짜 금지어가 또 있으면 검출한다", () => {
    // "가장자리"는 허용이지만 별도의 "가장"이 또 있으면 잡아야 한다
    expect(isProhibitedWordPresent("가장자리가 가장 두꺼운 부분", "가장")).toBe(true);
  });
});

describe("validateContent — 의료법/광고법 통합(무비용 fast 모드)", () => {
  const keywords = {
    mainKeyword: "안경 렌즈",
    subKeyword1: "렌즈 두께",
    subKeyword2: "렌즈 무게",
  };

  it("위반 본문: 금지어를 prohibitedWords에 담고 revision 필요", async () => {
    const content = "이번 수술 같은 관리와 할인 행사를 소개합니다. 안경 렌즈 두께 무게.";
    const r = await validateContent(content, keywords, { fast: true });
    expect(r.prohibitedWords).toContain("수술");
    expect(r.prohibitedWords).toContain("할인");
    expect(r.needsRevision).toBe(true);
  });

  it("정상 본문: 가장자리는 금지어로 잡히지 않는다(오탐 0)", async () => {
    const content = "렌즈 가장자리가 두꺼울 수 있어요. 안경 렌즈 두께 무게를 함께 봅니다.";
    const r = await validateContent(content, keywords, { fast: true });
    expect(r.prohibitedWords).not.toContain("가장");
    expect(r.prohibitedWords).toHaveLength(0);
  });

  it("주의표현: '치료 효과'를 cautionPhrases에 담는다", async () => {
    const content = "렌즈의 치료 효과를 기대할 수 있습니다. 안경 렌즈 두께 무게.";
    const r = await validateContent(content, keywords, { fast: true });
    expect(r.cautionPhrases).toContain("치료 효과");
  });

  it("키워드 원형 누락을 잡는다", async () => {
    const content = "렌즈 가장자리 이야기. 표가 없는 짧은 글.";
    const r = await validateContent(content, keywords, { fast: true });
    expect(r.missingKeywords).toContain("안경 렌즈");
  });
});
