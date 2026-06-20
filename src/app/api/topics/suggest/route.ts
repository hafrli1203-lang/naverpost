import { NextRequest, NextResponse } from "next/server";
import { getShopById } from "@/lib/data/shops";
import { CATEGORIES } from "@/lib/constants";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { planBlogTopics, planMonthlyCategorySlots } from "@/lib/topics/topicPlanner";
import { topicsSuggestSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseRequestBody(topicsSuggestSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 }
      );
    }
    const { shopId, categoryId } = parsed.data;

    const shop = await getShopById(shopId);
    const category = CATEGORIES.find((c) => c.id === categoryId);

    if (!shop || !category) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId 또는 categoryId입니다." },
        { status: 400 }
      );
    }

    // RSS에서 기존 글 제목 수집
    let existingTitles: string[] = [];
    try {
      const rss = await fetchBlogTitles(shopId);
      existingTitles = rss.forbiddenList;
    } catch {
      // RSS 실패해도 추천은 계속
    }

    const topicPlans = planBlogTopics({
      shop,
      category,
      existingTitles,
      maxCount: 5,
    });
    const monthlyCategorySlots = planMonthlyCategorySlots({
      shop,
      categories: CATEGORIES,
      existingTitles,
      slotCount: 10,
    });

    return NextResponse.json({
      success: true,
      data: topicPlans.map((plan) => plan.topic),
      meta: { topicPlans, monthlyCategorySlots },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "주제 추천 실패" },
      { status: 500 }
    );
  }
}
