import { describe, expect, it } from "vitest";
import {
  articleValidateSchema,
  blogopsShopSchema,
  topicsSuggestSchema,
  topicsSeriesSchema,
  titleSimilaritySchema,
  keywordsSchema,
  articleSchema,
  articleChatSchema,
  articleWashSchema,
} from "./apiRequestSchemas";
import { parseRequestBody } from "./parseRequestBody";

const validKeyword = {
  title: "안경테 추천",
  mainKeyword: "안경테",
  subKeyword1: "뿔테",
  subKeyword2: "메탈테",
};
const validArticle = {
  content: "본문입니다",
  mainKeyword: "안경테",
  subKeyword1: "뿔테",
  subKeyword2: "메탈테",
  title: "제목",
};

describe("articleValidateSchema", () => {
  it("accepts content with optional tone", () => {
    const r = parseRequestBody(articleValidateSchema, { content: "본문", tone: "friendly" });
    expect(r.ok).toBe(true);
  });
  it("rejects missing/empty content with the Korean message", () => {
    const r = parseRequestBody(articleValidateSchema, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("content는 필수입니다.");
  });
});

describe("blogopsShopSchema", () => {
  it("accepts empty object (shopId optional → all shops)", () => {
    expect(parseRequestBody(blogopsShopSchema, {}).ok).toBe(true);
  });
  it("accepts a shopId string", () => {
    expect(parseRequestBody(blogopsShopSchema, { shopId: "top50jn" }).ok).toBe(true);
  });
  it("rejects a non-string shopId", () => {
    expect(parseRequestBody(blogopsShopSchema, { shopId: 123 }).ok).toBe(false);
  });
});

describe("topicsSuggestSchema", () => {
  it("accepts valid shopId+categoryId", () => {
    expect(
      parseRequestBody(topicsSuggestSchema, { shopId: "top50jn", categoryId: "frames" }).ok
    ).toBe(true);
  });
  it("rejects missing categoryId with the Korean message", () => {
    const r = parseRequestBody(topicsSuggestSchema, { shopId: "top50jn" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("shopId와 categoryId는 필수입니다.");
  });
});

describe("topicsSeriesSchema", () => {
  it("accepts required + optional headKeyword/count", () => {
    const r = parseRequestBody(topicsSeriesSchema, {
      shopId: "top50jn",
      categoryId: "frames",
      headKeyword: "안경테",
      count: 5,
    });
    expect(r.ok).toBe(true);
  });
  it("rejects a non-numeric count", () => {
    const r = parseRequestBody(topicsSeriesSchema, {
      shopId: "top50jn",
      categoryId: "frames",
      count: "5",
    });
    expect(r.ok).toBe(false);
  });
});

describe("titleSimilaritySchema", () => {
  it("accepts typed comparisonTitles array", () => {
    const r = parseRequestBody(titleSimilaritySchema, {
      title: "t",
      comparisonTitles: ["a", "b"],
    });
    expect(r.ok).toBe(true);
  });
  it("rejects comparisonTitles that is not a string array", () => {
    const r = parseRequestBody(titleSimilaritySchema, {
      title: "t",
      comparisonTitles: [1, 2],
    });
    expect(r.ok).toBe(false);
  });
});

describe("keywordsSchema", () => {
  it("accepts valid shopId+categoryId with optional topic/refresh", () => {
    expect(
      parseRequestBody(keywordsSchema, {
        shopId: "top50jn",
        categoryId: "frames",
        refresh: true,
      }).ok
    ).toBe(true);
  });
  it("rejects missing shopId with the Korean message", () => {
    const r = parseRequestBody(keywordsSchema, { categoryId: "frames" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("shopId와 categoryId가 필요합니다.");
  });
  it("accepts a 100-char topic (matches UI maxLength) but rejects 101", () => {
    const base = { shopId: "top50jn", categoryId: "frames" };
    expect(parseRequestBody(keywordsSchema, { ...base, topic: "가".repeat(100) }).ok).toBe(true);
    const tooLong = parseRequestBody(keywordsSchema, { ...base, topic: "가".repeat(101) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.message).toBe("주제가 너무 깁니다.");
  });
});

describe("articleSchema", () => {
  it("accepts valid keyword and applies defaults", () => {
    const r = parseRequestBody(articleSchema, {
      keyword: validKeyword,
      shopId: "top50jn",
      categoryId: "frames",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.charCount).toBe(2000);
      expect(r.data.articleType).toBe("info");
      expect(r.data.tone).toBe("standard");
      expect(r.data.contentSubtype).toBe("blog");
    }
  });
  it("rejects a keyword missing required subfields", () => {
    const r = parseRequestBody(articleSchema, {
      keyword: { mainKeyword: "안경테" },
      shopId: "top50jn",
      categoryId: "frames",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("keyword, shopId, categoryId는 필수입니다.");
  });
  it("rejects an out-of-range charCount", () => {
    const r = parseRequestBody(articleSchema, {
      keyword: validKeyword,
      shopId: "top50jn",
      categoryId: "frames",
      charCount: 1800,
    });
    expect(r.ok).toBe(false);
  });
});

describe("articleChatSchema", () => {
  it("accepts an article with content+mainKeyword", () => {
    const r = parseRequestBody(articleChatSchema, {
      article: validArticle,
      messages: [{ role: "user", content: "더 짧게" }],
    });
    expect(r.ok).toBe(true);
  });
  it("rejects a missing/empty article with the Korean message", () => {
    const r = parseRequestBody(articleChatSchema, { article: { mainKeyword: "안경테" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("수정할 본문과 키워드 정보가 필요합니다.");
  });
});

describe("articleWashSchema", () => {
  it("accepts an article with all four required fields", () => {
    expect(parseRequestBody(articleWashSchema, { article: validArticle }).ok).toBe(true);
  });
  it("rejects an article missing subKeyword2", () => {
    const r = parseRequestBody(articleWashSchema, {
      article: { content: "c", mainKeyword: "k", subKeyword1: "s1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("워싱할 본문과 키워드 정보가 필요합니다.");
  });
});
