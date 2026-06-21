import { NextRequest, NextResponse } from "next/server";
import { getShopById } from "@/lib/data/shops";
import { discoverSeasonalKeywords } from "@/lib/topics/seasonalDiscovery";
import { fetchGoogleTrendsKR } from "@/lib/trends/googleTrends";
import { seasonalSeriesSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseRequestBody(seasonalSeriesSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.message }, { status: 400 });
    }
    const { shopId, count } = parsed.data;

    const shop = await getShopById(shopId);
    if (!shop) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId입니다." },
        { status: 400 }
      );
    }

    const now = new Date();
    // 기본 대상 월 = 다음 달(1~12 순환).
    const month = parsed.data.month ?? ((now.getMonth() + 1) % 12) + 1;

    // 안경 도메인 발굴 + 전 분야 실시간 트렌드(구글)를 병렬 수집. 트렌드 실패는 빈 배열.
    const [result, trendingNow] = await Promise.all([
      discoverSeasonalKeywords({ shopId, month, count, now }),
      fetchGoogleTrendsKR().catch(() => []),
    ]);

    return NextResponse.json({ success: true, data: { ...result, trendingNow } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시즌 키워드 발굴 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
