import { NextRequest, NextResponse } from "next/server";
import { generateKeywords } from "@/lib/ai/claude";
import { buildTitleGenerationPrompt } from "@/lib/prompts/titlePrompt";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { validateKeywordOption } from "@/lib/validation/keywordRules";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId, topic } = body as {
      shopId: string;
      categoryId: string;
      topic: string;
    };

    if (!shopId || !categoryId) {
      return NextResponse.json(
        { success: false, error: "shopId, categoryId는 필수입니다." },
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

    // RSS에서 기존 글 제목 수집 (중복 방지)
    let forbiddenList: string[] = [];
    let referenceList: string[] = [];
    try {
      const rssResult = await fetchBlogTitles(shopId);
      forbiddenList = rssResult.forbiddenList;
      referenceList = rssResult.referenceList;
    } catch {
      // RSS 실패 시 빈 목록으로 진행 (키워드 생성은 계속)
    }

    const prompt = buildTitleGenerationPrompt({
      targetStore: shop.name,
      category: category.name,
      categorySubtopics: category.subcategories,
      forbiddenList,
      referenceList,
    });

    const options = await generateKeywords(prompt);

    // 키워드 7대 규칙 검증 결과 첨부
    const results = options.map((option) => ({
      ...option,
      validation: validateKeywordOption(option, forbiddenList, referenceList),
    }));

    return NextResponse.json({
      success: true,
      data: { results },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "키워드 생성 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
