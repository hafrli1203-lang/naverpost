import { NextRequest, NextResponse } from "next/server";
import { planKeywordSeries } from "@/lib/topics/seriesPlanner";
import { getShopById } from "@/lib/data/shops";
import { CATEGORIES } from "@/lib/constants";
import { fetchBlogTitles } from "@/lib/naver/rssParser";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      shopId?: string;
      categoryId?: string;
      headKeyword?: string;
      count?: number;
    };

    if (!body.shopId || !body.categoryId) {
      return NextResponse.json(
        { success: false, error: "shopId와 categoryId는 필수입니다." },
        { status: 400 }
      );
    }

    const shop = await getShopById(body.shopId);
    const category = CATEGORIES.find((c) => c.id === body.categoryId);
    if (!shop || !category) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId 또는 categoryId입니다." },
        { status: 400 }
      );
    }

    // 기존 발행 제목으로 중복 회피(best-effort, 실패해도 진행).
    const existingTitles = await fetchBlogTitles(body.shopId)
      .then((rss) => rss.forbiddenList.slice(0, 20))
      .catch(() => [] as string[]);

    const data = await planKeywordSeries({
      shop,
      category,
      headKeyword: body.headKeyword,
      count: body.count,
      existingTitles,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시리즈 계획 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
