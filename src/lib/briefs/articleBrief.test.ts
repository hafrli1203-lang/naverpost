import { describe, it, expect } from "vitest";
import { buildArticleBrief } from "./articleBrief";
import type { KeywordOption, Shop, Category } from "@/types";

/**
 * 본문 작성 브리프 조립 회귀 테스트(순수 함수).
 * 키워드/매장/연구 입력이 ArticleBrief로 올바르게 매핑되고, 경쟁 형태소 유무로
 * sources(출처 목록)가 분기되는지 고정한다.
 */

const keyword: KeywordOption = {
  title: "누진렌즈 적응 방법",
  mainKeyword: "누진렌즈 적응",
  subKeyword1: "누진렌즈 울렁임",
  subKeyword2: "누진렌즈 시야",
} as KeywordOption;

const shop: Shop = { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" } as Shop;
const category: Category = { id: "progressive", name: "누진다초점", subcategories: [] };

function base() {
  return {
    keyword,
    shop,
    category,
    topic: "누진렌즈 첫 적응",
    articleType: "info" as const,
    charCount: 2000 as const,
    tone: "standard" as const,
    researchData: "누진렌즈는 적응에 시간이 걸린다.\n[출처] 무시되는 줄\n- 무시되는 불릿",
    sameStoreHistory: ["누진렌즈 적응 후기"],
    crossBlogTitles: ["다른 블로그 제목 1", "제목 2", "제목 3", "제목 4", "제목 5", "제목 6"],
  };
}

describe("buildArticleBrief", () => {
  it("키워드/주제/매장을 브리프에 매핑한다", () => {
    const brief = buildArticleBrief(base());
    expect(brief.title).toBe("누진렌즈 적응 방법");
    expect(brief.mainKeyword).toBe("누진렌즈 적응");
    expect(brief.subKeyword1).toBe("누진렌즈 울렁임");
    expect(brief.topic).toBe("누진렌즈 첫 적응");
    expect(brief.shop.blogId).toBe("top50jn");
  });

  it("연구 요약은 출처 태그/불릿 줄을 제외한다", () => {
    const brief = buildArticleBrief(base());
    expect(brief.researchSummary).toContain("누진렌즈는 적응에 시간이 걸린다.");
    expect(brief.researchSummary).not.toContain("[출처]");
    expect(brief.researchSummary).not.toContain("- 무시되는");
  });

  it("crossBlogStoreAngles는 최대 5개로 제한된다", () => {
    const brief = buildArticleBrief(base());
    expect(brief.networkContext.crossBlogStoreAngles).toHaveLength(5);
    expect(brief.networkContext.currentBlogId).toBe("top50jn");
  });

  it("경쟁 형태소가 없으면 sources에 naver-search가 빠진다", () => {
    const brief = buildArticleBrief(base());
    expect(brief.sources).not.toContain("naver-search");
    expect(brief.sources).toContain("perplexity");
  });

  it("경쟁 형태소가 available이면 sources에 naver-search가 포함된다", () => {
    const brief = buildArticleBrief({
      ...base(),
      competitorMorphology: {
        status: "available",
        sampleSize: 10,
        commonNouns: ["누진렌즈", "적응"],
        titleNouns: ["적응"],
      },
    });
    expect(brief.sources).toContain("naver-search");
    expect(brief.researchSummary).toContain("상위 노출 글 공통 명사");
  });
});
