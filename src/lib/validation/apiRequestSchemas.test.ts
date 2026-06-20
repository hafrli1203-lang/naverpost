import { describe, expect, it } from "vitest";
import {
  articleValidateSchema,
  blogopsShopSchema,
  topicsSuggestSchema,
  topicsSeriesSchema,
  titleSimilaritySchema,
} from "./apiRequestSchemas";
import { parseRequestBody } from "./parseRequestBody";

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
