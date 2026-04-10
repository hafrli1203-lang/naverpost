import { NextRequest, NextResponse } from "next/server";
import { generateTopicSuggestions } from "@/lib/ai/gemini";
import { getShopById } from "@/lib/data/shops";
import { CATEGORIES } from "@/lib/constants";
import { fetchBlogTitles } from "@/lib/naver/rssParser";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId } = body as { shopId: string; categoryId: string };

    if (!shopId || !categoryId) {
      return NextResponse.json(
        { success: false, error: "shopId와 categoryId는 필수입니다." },
        { status: 400 }
      );
    }

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

    const existingStr = existingTitles.length > 0
      ? `\n\n이미 작성된 글 제목 (중복 금지):\n${existingTitles.slice(0, 20).join("\n")}`
      : "";

    const prompt = `당신은 안경원 블로그 주제 추천 전문가입니다.

매장: ${shop.name}
카테고리: ${category.name}
카테고리 세부 주제: ${category.subcategories.join(", ")}
${existingStr}

위 정보를 바탕으로, 이 매장 블로그에 작성하면 좋을 주제/소재를 3개 추천해 주세요.

조건:
- 기존에 작성된 글과 중복되지 않을 것
- 네이버 검색에서 유입이 가능한 구체적 주제
- 각 주제는 10~25자 이내의 자연스러운 한국어

출력 형식 (번호 없이 한 줄씩):
(주제1)
(주제2)
(주제3)`;

    // generateImagePrompts는 범용 Claude 호출이므로 재사용
    const raw = await generateTopicSuggestions(prompt);
    const topics = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length <= 50)
      .slice(0, 3);

    return NextResponse.json({ success: true, data: topics });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "주제 추천 실패" },
      { status: 500 }
    );
  }
}
