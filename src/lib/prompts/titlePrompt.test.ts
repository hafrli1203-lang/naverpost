import { describe, it, expect } from "vitest";
import { buildTitleGenerationPrompt, TITLE_PATTERN_GUIDE } from "./titlePrompt";

/**
 * 제목 생성 프롬프트 빌더 회귀 테스트(순수 문자열 조립).
 * 매장/카테고리/금지·참조 목록 주입과 빈 목록 "(없음)" 폴백을 고정한다.
 */

function base() {
  return {
    targetStore: "탑안경",
    category: "누진다초점",
    categorySubtopics: ["누진렌즈", "노안안경"],
    forbiddenList: ["누진렌즈 적응 후기"],
    referenceList: ["다른 블로그 제목"],
  };
}

describe("TITLE_PATTERN_GUIDE", () => {
  it("제목 원칙 가이드 문자열이 존재한다", () => {
    expect(typeof TITLE_PATTERN_GUIDE).toBe("string");
    expect(TITLE_PATTERN_GUIDE.length).toBeGreaterThan(0);
  });
});

describe("buildTitleGenerationPrompt", () => {
  it("매장/카테고리/하위주제를 포함한다", () => {
    const p = buildTitleGenerationPrompt(base());
    expect(p).toContain("탑안경");
    expect(p).toContain("누진다초점");
    expect(p).toContain("누진렌즈");
  });

  it("금지/참조 목록을 프롬프트에 주입한다", () => {
    const p = buildTitleGenerationPrompt(base());
    expect(p).toContain("누진렌즈 적응 후기");
    expect(p).toContain("다른 블로그 제목");
  });

  it("빈 목록은 '(없음)'으로 표기한다", () => {
    const p = buildTitleGenerationPrompt({
      ...base(),
      forbiddenList: [],
      referenceList: [],
    });
    expect(p).toContain("(없음)");
  });

  it("문자열을 반환한다", () => {
    expect(typeof buildTitleGenerationPrompt(base())).toBe("string");
    expect(buildTitleGenerationPrompt(base()).length).toBeGreaterThan(0);
  });
});
