import { describe, it, expect } from "vitest";
import { getToneGuide, buildArticlePrompt } from "./articlePrompt";
import type { Shop, Category } from "@/types";

/**
 * 본문 프롬프트 빌더 회귀 테스트(순수 문자열 조립).
 * 톤별 분기, charCount→섹션 수, 키워드/주제 주입, 조건부 섹션(외부참고·용어집)을 고정한다.
 */

const shop: Shop = { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" } as Shop;
const category: Category = { id: "progressive", name: "누진다초점", subcategories: [] };

function base() {
  return {
    title: "누진렌즈 적응 방법",
    mainKeyword: "누진렌즈 적응",
    subKeyword1: "누진렌즈 울렁임",
    subKeyword2: "누진렌즈 시야",
    shop,
    category,
    topic: "누진렌즈 첫 적응",
    researchData: "누진렌즈는 적응에 시간이 걸린다.",
  };
}

describe("getToneGuide", () => {
  it("톤별로 다른 가이드를 반환한다", () => {
    expect(getToneGuide("friendly")).toContain("다정한 구어체");
    expect(getToneGuide("casual")).toContain("대화체");
    expect(getToneGuide("standard")).toContain("안경사의 톤");
  });
  it("미지정/알 수 없는 톤은 standard로 폴백한다", () => {
    expect(getToneGuide(undefined)).toBe(getToneGuide("standard"));
    expect(getToneGuide("nonsense")).toBe(getToneGuide("standard"));
  });
});

describe("buildArticlePrompt", () => {
  it("키워드/제목/주제를 프롬프트에 포함한다", () => {
    const p = buildArticlePrompt(base());
    expect(p).toContain("누진렌즈 적응");
    expect(p).toContain("누진렌즈 적응 방법");
    expect(p).toContain("누진렌즈 첫 적응");
  });

  it("charCount에 따라 섹션 수가 달라진다(1000=2, 2500=5)", () => {
    const short = buildArticlePrompt({ ...base(), charCount: 1000 });
    const long = buildArticlePrompt({ ...base(), charCount: 2500 });
    const count = (s: string) => (s.match(/## \(소주제/g) ?? []).length;
    expect(count(short)).toBe(2);
    expect(count(long)).toBe(5);
  });

  it("externalReference가 있으면 외부 참고 섹션을 넣는다", () => {
    const withRef = buildArticlePrompt({ ...base(), externalReference: "참고 문서 본문" });
    expect(withRef).toContain("외부 참고 자료");
    expect(withRef).toContain("참고 문서 본문");
    // 없으면 섹션이 없다
    expect(buildArticlePrompt(base())).not.toContain("외부 참고 자료");
  });

  it("glossaryHint가 있으면 용어 정의 섹션을 넣는다", () => {
    const p = buildArticlePrompt({ ...base(), glossaryHint: "멀티포컬 = 콘택트렌즈" });
    expect(p).toContain("키워드 정확한 의미");
    expect(p).toContain("멀티포컬 = 콘택트렌즈");
  });

  it("문자열을 반환한다(비어있지 않음)", () => {
    expect(typeof buildArticlePrompt(base())).toBe("string");
    expect(buildArticlePrompt(base()).length).toBeGreaterThan(0);
  });
});
