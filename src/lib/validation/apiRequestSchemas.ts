import { z } from "zod";

/**
 * 이미지 외 API 라우트 입력 경계 검증(zod). 기존 `body as {...}` 무검증 단언을 대체한다.
 * 동작 보존: 기존 필수 필드/메시지를 그대로 유지하고 타입 검증만 추가한다.
 * 공용 헬퍼는 ./parseRequestBody 의 parseRequestBody 사용.
 */

const REQUIRED_SHOP_CATEGORY = "shopId와 categoryId는 필수입니다.";

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
