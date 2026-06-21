import { describe, it, expect } from "vitest";
import { buildPromoPrompt } from "./promoPrompt";
import type { Shop, Category } from "@/types";

/**
 * 프로모션 본문 프롬프트 빌더 회귀 테스트(순수 문자열 조립).
 * 키워드/주제 주입 + 행사 정보 블록 조건부 삽입을 고정한다.
 */

const shop: Shop = { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" } as Shop;
const category: Category = { id: "frames", name: "안경테", subcategories: [] };

function base() {
  return {
    title: "안경테 봄맞이 행사",
    mainKeyword: "안경테 행사",
    subKeyword1: "안경테 할인",
    subKeyword2: "안경테 혜택",
    shop,
    category,
    topic: "봄 프로모션",
    researchData: "행사 안내 자료",
  };
}

describe("buildPromoPrompt", () => {
  it("키워드/제목/매장명을 포함한다", () => {
    const p = buildPromoPrompt(base());
    expect(p).toContain("안경테 행사");
    expect(p).toContain("안경테 봄맞이 행사");
    expect(p).toContain("탑안경");
  });

  it("행사명/기간/혜택이 있으면 행사 정보 블록을 넣는다", () => {
    const p = buildPromoPrompt({
      ...base(),
      eventName: "봄맞이 특가",
      eventPeriod: "3월 한 달",
      benefitContent: "렌즈 교체 혜택",
    });
    expect(p).toContain("행사/프로모션 정보");
    expect(p).toContain("봄맞이 특가");
    expect(p).toContain("렌즈 교체 혜택");
  });

  it("행사 정보가 없으면 [확인 필요] 플레이스홀더를 쓴다", () => {
    // eventName 없이 다른 행사 필드만 → 블록은 생기되 행사명은 확인 필요
    const p = buildPromoPrompt({ ...base(), eventPeriod: "3월" });
    expect(p).toContain("[확인 필요]");
  });

  it("문자열을 반환한다", () => {
    expect(typeof buildPromoPrompt(base())).toBe("string");
    expect(buildPromoPrompt(base()).length).toBeGreaterThan(0);
  });
});
