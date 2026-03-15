import { NextRequest, NextResponse } from "next/server";
import { writeArticle, reviseArticle } from "@/lib/ai/claude";
import { researchKeyword } from "@/lib/ai/perplexity";
import { buildArticlePrompt } from "@/lib/prompts/articlePrompt";
import { buildPromoPrompt } from "@/lib/prompts/promoPrompt";
import { buildRevisionPrompt } from "@/lib/prompts/revisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import type { KeywordOption, ArticleContent } from "@/types";

const MAX_REVISION_ATTEMPTS = 2;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      keyword,
      shopId,
      categoryId,
      topic,
      articleType = "info",
      charCount = 2000,
      tone = "standard",
      contentSubtype = "blog",
      eventName,
      eventPeriod,
      benefitContent,
      externalReference,
    } = body as {
      keyword: KeywordOption;
      shopId: string;
      categoryId: string;
      topic: string;
      articleType?: "info" | "promo";
      charCount?: 1000 | 1500 | 2000 | 2500;
      tone?: "standard" | "friendly" | "casual" | "business" | "expert";
      contentSubtype?: "blog" | "event" | "season" | "short";
      eventName?: string;
      eventPeriod?: string;
      benefitContent?: string;
      externalReference?: string;
    };

    if (!keyword || !shopId || !categoryId) {
      return NextResponse.json(
        { success: false, error: "keyword, shopId, categoryId는 필수입니다." },
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

    // Research keyword via Perplexity
    const researchData = await researchKeyword(keyword.mainKeyword);

    // Build article prompt and generate via Claude
    const prompt =
      articleType === "promo"
        ? buildPromoPrompt({
            title: keyword.title,
            mainKeyword: keyword.mainKeyword,
            subKeyword1: keyword.subKeyword1,
            subKeyword2: keyword.subKeyword2,
            shop,
            category,
            topic: topic || keyword.title,
            researchData,
            charCount,
            tone: tone as "business" | "friendly" | "expert" | undefined,
            externalReference,
            contentSubtype,
            eventName,
            eventPeriod,
            benefitContent,
          })
        : buildArticlePrompt({
            title: keyword.title,
            mainKeyword: keyword.mainKeyword,
            subKeyword1: keyword.subKeyword1,
            subKeyword2: keyword.subKeyword2,
            shop,
            category,
            topic: topic || keyword.title,
            researchData,
            charCount,
            tone: tone as "standard" | "friendly" | "casual" | undefined,
            externalReference,
          });

    let content = await writeArticle(prompt);
    // 본문에서 마크다운 볼드(**) 제거
    content = content.replace(/\*\*([^*]+)\*\*/g, "$1");
    const keywordsForValidation = {
      mainKeyword: keyword.mainKeyword,
      subKeyword1: keyword.subKeyword1,
      subKeyword2: keyword.subKeyword2,
    };
    let validation = validateContent(content, keywordsForValidation);

    // 검증 실패 시 자동 수정 (최대 2회)
    let revisionCount = 0;
    while (validation.needsRevision && revisionCount < MAX_REVISION_ATTEMPTS) {
      const revisionPrompt = buildRevisionPrompt({
        originalContent: content,
        validation,
        mainKeyword: keyword.mainKeyword,
        subKeyword1: keyword.subKeyword1,
        subKeyword2: keyword.subKeyword2,
        charCount,
      });
      content = await reviseArticle(revisionPrompt);
      // 수정본에서도 볼드(**) 제거
      content = content.replace(/\*\*([^*]+)\*\*/g, "$1");
      validation = validateContent(content, keywordsForValidation);
      revisionCount++;
    }

    const article: ArticleContent = {
      title: keyword.title,
      content,
      mainKeyword: keyword.mainKeyword,
      subKeyword1: keyword.subKeyword1,
      subKeyword2: keyword.subKeyword2,
      shopName: shop.name,
      category: category.name,
      validation,
    };

    return NextResponse.json({ success: true, data: article });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "본문 작성 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
