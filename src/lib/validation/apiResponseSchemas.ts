/**
 * 클라이언트가 받는 API 응답 경계 검증(zod). `json.data as T` 무검증 단언을 대체한다.
 * 서버가 형식을 깨거나 라우트가 바뀌어도 클라이언트가 조용히 깨지지 않고 빈손/오류로 폴백한다.
 */

import { z } from "zod";
import type { Shop } from "@/types";

const shopSchema = z.object({
  id: z.string(),
  name: z.string(),
  blogId: z.string(),
  rssUrl: z.string(),
  address: z.string().optional(),
  naverPlaceUrl: z.string().optional(),
  homepageUrl: z.string().optional(),
  brandBannerText: z.string().optional(),
  parkingInfo: z.string().optional(),
  businessHours: z.string().optional(),
  mainProducts: z.array(z.string()).optional(),
  serviceStrengths: z.array(z.string()).optional(),
  visitChecklist: z.array(z.string()).optional(),
  avoidClaims: z.array(z.string()).optional(),
});

/** /api/shops 응답의 data(매장 배열). 형식이 깨지면 빈 배열. */
export function parseShopList(data: unknown): Shop[] {
  const parsed = z.array(shopSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

const rankedKeywordSchema = z.object({
  keyword: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  seasonScore: z.number(),
  monthlyVolume: z.number().nullable(),
  peakMonth: z.number().nullable(),
  isPeakMonth: z.boolean(),
  estimatedMonthlyDemand: z.number().nullable(),
  seasonalLift: z.number().nullable(),
});

const trendingKeywordSchema = z.object({
  keyword: z.string(),
  trafficLabel: z.string().nullable(),
});

/** /api/topics/seasonal-series 응답의 data. */
export const seasonalDiscoveryResultSchema = z.object({
  shopId: z.string(),
  month: z.number(),
  volumeTop: z.array(rankedKeywordSchema),
  issueTop: z.array(rankedKeywordSchema),
  trendingNow: z.array(trendingKeywordSchema).optional(),
  notes: z.array(z.string()),
});

const seriesPlanItemSchema = z.object({
  order: z.number(),
  axis: z.string(),
  topic: z.string(),
  thesis: z.string(),
  titleAngle: z.string(),
  modifiers: z.array(z.string()),
});

/** /api/topics/series 응답의 data. */
export const seriesPlanSchema = z.object({
  shopName: z.string(),
  categoryName: z.string(),
  headKeyword: z.string(),
  items: z.array(seriesPlanItemSchema),
  excludedByCannibalization: z.array(z.string()),
  notes: z.array(z.string()),
});
