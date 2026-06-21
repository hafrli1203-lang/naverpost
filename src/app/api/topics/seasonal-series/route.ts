import { NextRequest, NextResponse } from "next/server";
import { getShopById } from "@/lib/data/shops";
import { CATEGORIES } from "@/lib/constants";
import { fetchMonthlySeasonality } from "@/lib/naver/searchSignals";
import { fetchKeywordDemandSignals } from "@/lib/naver/searchSignals";
import { getTopExposedKeywordKeys } from "@/lib/blogops/insights";
import {
  planSeasonalSeries,
  type SeasonalCandidate,
} from "@/lib/topics/seasonalSeriesPlanner";
import { seasonalSeriesSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export const maxDuration = 60;

function normalizeKey(keyword: string): string {
  return keyword.replace(/\s+/g, "").trim().toLowerCase();
}

/** 대상 월의 1일을 ISO(yyyy-mm-dd)로. month는 1~12, 연도는 올해(과거면 내년). */
function startDateForMonth(month: number, now: Date): string {
  const thisYear = now.getFullYear();
  const year = month - 1 < now.getMonth() ? thisYear + 1 : thisYear;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseRequestBody(seasonalSeriesSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.message }, { status: 400 });
    }
    const { shopId, categoryId, headKeywords, count } = parsed.data;

    const shop = await getShopById(shopId);
    const category = CATEGORIES.find((c) => c.id === categoryId);
    if (!shop || !category) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId 또는 categoryId입니다." },
        { status: 400 }
      );
    }

    const now = new Date();
    // 기본 대상 월 = 다음 달(1~12 순환).
    const month = parsed.data.month ?? ((now.getMonth() + 1) % 12) + 1;

    // 3종 데이터 병렬 수집. 외부가 죽어도 빈 결과로 폴백(엔진이 graceful 처리).
    const [seasonality, demand, exposedKeys] = await Promise.all([
      fetchMonthlySeasonality(headKeywords).catch(() => []),
      fetchKeywordDemandSignals(headKeywords).catch(() => []),
      getTopExposedKeywordKeys(shopId).catch(() => new Set<string>()),
    ]);

    const seasonalityByKey = new Map(seasonality.map((s) => [normalizeKey(s.keyword), s]));
    const demandByKey = new Map(demand.map((d) => [normalizeKey(d.keyword), d]));

    const candidates: SeasonalCandidate[] = headKeywords.map((headKeyword) => {
      const key = normalizeKey(headKeyword);
      return {
        headKeyword,
        monthlyRatios: seasonalityByKey.get(key)?.monthlyRatios ?? [],
        monthlyVolume: demandByKey.get(key)?.monthlyTotalSearches ?? null,
      };
    });

    const plan = planSeasonalSeries({
      shopId,
      month,
      candidates,
      count,
      startDateIso: startDateForMonth(month, now),
      excludedKeys: Array.from(exposedKeys),
    });

    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시즌 시리즈 편성 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
