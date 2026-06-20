import { z } from "zod";
import type { ArticleContent, KeywordOption } from "@/types";

/**
 * 이미지 외 API 라우트 입력 경계 검증(zod). 기존 `body as {...}` 무검증 단언을 대체한다.
 * 동작 보존: 기존 필수 필드/메시지를 그대로 유지하고 타입 검증만 추가한다.
 * 공용 헬퍼는 ./parseRequestBody 의 parseRequestBody 사용.
 */

const REQUIRED_SHOP_CATEGORY = "shopId와 categoryId는 필수입니다.";

/** 객체 v가 주어진 필드를 모두 "비어있지 않은 문자열"로 가지는가(기존 falsy 체크와 동일). */
function hasNonEmptyStrings(v: unknown, fields: readonly string[]): boolean {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return fields.every((f) => typeof o[f] === "string" && o[f] !== "");
}

/** POST /api/article/validate */
export const articleValidateSchema = z.object({
  content: z.string("content는 필수입니다.").min(1, "content는 필수입니다."),
  tone: z.string().optional(),
});

/** POST /api/blogops/backfill, /api/blogops/exposure (shopId 선택, 누락 시 전체 매장) */
export const blogopsShopSchema = z.object({
  shopId: z.string().optional(),
});

/** POST /api/topics/suggest */
export const topicsSuggestSchema = z.object({
  shopId: z.string(REQUIRED_SHOP_CATEGORY).min(1, REQUIRED_SHOP_CATEGORY),
  categoryId: z.string(REQUIRED_SHOP_CATEGORY).min(1, REQUIRED_SHOP_CATEGORY),
});

/** POST /api/topics/series */
export const topicsSeriesSchema = z.object({
  shopId: z.string(REQUIRED_SHOP_CATEGORY).min(1, REQUIRED_SHOP_CATEGORY),
  categoryId: z.string(REQUIRED_SHOP_CATEGORY).min(1, REQUIRED_SHOP_CATEGORY),
  headKeyword: z.string().optional(),
  count: z.number().int().optional(),
});

/** POST /api/title-similarity (title 필수 여부는 라우트가 trim 후 판정 — 여기선 타입만) */
export const titleSimilaritySchema = z.object({
  title: z.string().optional(),
  keyword: z.string().optional(),
  comparisonTitles: z.array(z.string()).optional(),
});

export type ArticleValidateInput = z.infer<typeof articleValidateSchema>;
export type BlogopsShopInput = z.infer<typeof blogopsShopSchema>;
export type TopicsSuggestInput = z.infer<typeof topicsSuggestSchema>;
export type TopicsSeriesInput = z.infer<typeof topicsSeriesSchema>;
export type TitleSimilarityInput = z.infer<typeof titleSimilaritySchema>;

/** POST /api/keywords (거대 파일이지만 입력은 단순) */
export const keywordsSchema = z.object({
  shopId: z.string("shopId와 categoryId가 필요합니다.").min(1, "shopId와 categoryId가 필요합니다."),
  categoryId: z.string("shopId와 categoryId가 필요합니다.").min(1, "shopId와 categoryId가 필요합니다."),
  topic: z.string().optional(),
  refresh: z.boolean().optional(),
});

const REQUIRED_ARTICLE = "keyword, shopId, categoryId는 필수입니다.";

/** POST /api/article — 본문 작성. keyword는 KeywordOption(필수 하위필드 검증). */
export const articleSchema = z.object({
  keyword: z.custom<KeywordOption>(
    (v) => hasNonEmptyStrings(v, ["title", "mainKeyword", "subKeyword1", "subKeyword2"]),
    REQUIRED_ARTICLE
  ),
  shopId: z.string(REQUIRED_ARTICLE).min(1, REQUIRED_ARTICLE),
  categoryId: z.string(REQUIRED_ARTICLE).min(1, REQUIRED_ARTICLE),
  topic: z.string().optional(),
  articleType: z.enum(["info", "promo"]).default("info"),
  charCount: z
    .union([z.literal(1000), z.literal(1500), z.literal(2000), z.literal(2500)])
    .default(2000),
  tone: z
    .enum(["standard", "friendly", "casual", "business", "expert"])
    .default("standard"),
  contentSubtype: z.enum(["blog", "event", "season", "short"]).default("blog"),
  eventName: z.string().optional(),
  eventPeriod: z.string().optional(),
  benefitContent: z.string().optional(),
  externalReference: z.string().optional(),
});

/** POST /api/article/chat — 멀티턴 수정. article는 content+mainKeyword 필수. */
export const articleChatSchema = z.object({
  article: z.custom<ArticleContent>(
    (v) => hasNonEmptyStrings(v, ["content", "mainKeyword"]),
    "수정할 본문과 키워드 정보가 필요합니다."
  ),
  messages: z.unknown().optional(),
  charCount: z.number().optional(),
});

/** POST /api/article/wash — 워싱. article는 content+mainKeyword+sub1+sub2 필수. */
export const articleWashSchema = z.object({
  article: z.custom<ArticleContent>(
    (v) => hasNonEmptyStrings(v, ["content", "mainKeyword", "subKeyword1", "subKeyword2"]),
    "워싱할 본문과 키워드 정보가 필요합니다."
  ),
  charCount: z.number().optional(),
});

export type KeywordsInput = z.infer<typeof keywordsSchema>;
export type ArticleInput = z.infer<typeof articleSchema>;
export type ArticleChatInput = z.infer<typeof articleChatSchema>;
export type ArticleWashInput = z.infer<typeof articleWashSchema>;
