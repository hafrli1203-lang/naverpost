import { NextRequest, NextResponse } from "next/server";
import { writeArticle, reviseArticle } from "@/lib/ai/claude";
import { researchKeyword } from "@/lib/ai/perplexity";
import {
  extractCitationsFromContent,
  mergeCitations,
} from "@/lib/ai/citationExtractor";
import { buildArticlePrompt } from "@/lib/prompts/articlePrompt";
import { buildPromoPrompt } from "@/lib/prompts/promoPrompt";
import { buildRevisionPrompt } from "@/lib/prompts/revisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { buildArticleBrief } from "@/lib/briefs/articleBrief";
import { analyzeCompetitorMorphology } from "@/lib/analysis/competitorMorphology";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import type { KeywordOption, ArticleContent } from "@/types";

export const maxDuration = 300;

const MAX_REVISION_ATTEMPTS = 2;

function isCharCountOutOfRange(content: string, target: number): boolean {
  const length = content.length;
  const min = Math.floor(target * 0.9);
  const max = Math.ceil(target * 1.1);
  return length < min || length > max;
}

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
    const researchResponse = await researchKeyword(keyword.mainKeyword);
    const researchData = researchResponse.text;
    const researchCitations = researchResponse.result.citations;

    let sameStoreHistory: string[] = [];
    let crossBlogTitles: string[] = [];
    try {
      const rssResult = await fetchBlogTitles(shopId);
      sameStoreHistory = rssResult.forbiddenList.slice(0, 10);
      crossBlogTitles = rssResult.referenceList.slice(0, 20);
    } catch {
      // RSS failure should not block article generation.
    }

    let competitorMorphology:
        | {
          status: "available" | "unavailable";
          sampleSize: number;
          bodySampleSize?: number;
          commonNouns: string[];
          titleNouns: string[];
          bodyNouns?: string[];
          bodyHighlights?: string[];
          titleAngles?: string[];
          contentBlocks?: string[];
          cautionPoints?: string[];
        }
      | undefined;
    try {
      const result = await analyzeCompetitorMorphology(keyword.mainKeyword);
      competitorMorphology = {
        status: result.status,
        sampleSize: result.sampleSize,
        bodySampleSize: result.bodySampleSize,
        commonNouns: result.commonNouns.map((entry) => entry.noun),
        titleNouns: result.titleNouns.map((entry) => entry.noun),
        bodyNouns: result.bodyNouns.map((entry) => entry.noun),
        bodyHighlights: result.bodyHighlights,
        titleAngles: result.titleAngles,
        contentBlocks: result.contentBlocks,
        cautionPoints: result.cautionPoints,
      };
    } catch {
      // Competitor morphology analysis failure should not block article generation.
    }

    const brief = buildArticleBrief({
      keyword,
      shop,
      category,
      topic: topic || keyword.title,
      articleType,
      charCount,
      tone,
      contentSubtype,
      researchData,
      sameStoreHistory,
      crossBlogTitles,
      competitorMorphology,
    });

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
            brief,
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
            brief,
            citations: researchCitations,
          });

    let content = await writeArticle(prompt);
    const keywordsForValidation = {
      title: keyword.title,
      mainKeyword: keyword.mainKeyword,
      subKeyword1: keyword.subKeyword1,
      subKeyword2: keyword.subKeyword2,
      forbiddenList: sameStoreHistory,
      referenceList: crossBlogTitles,
    };
    let validation = await validateContent(content, keywordsForValidation);
    let charOutOfRange = isCharCountOutOfRange(content, charCount);

    let revisionCount = 0;
    while (
      (validation.needsRevision || charOutOfRange) &&
      revisionCount < MAX_REVISION_ATTEMPTS
    ) {
      const extraProblems = charOutOfRange
        ? [
            `- 글자수가 ${charCount}자 ±10% 범위를 벗어났습니다 (현재 ${content.length}자). 의미를 유지하며 분량을 맞추세요.`,
          ]
        : [];

      const revisionPrompt = buildRevisionPrompt({
        originalContent: content,
        validation,
        mainKeyword: keyword.mainKeyword,
        subKeyword1: keyword.subKeyword1,
        subKeyword2: keyword.subKeyword2,
        charCount,
        extraProblems,
      });
      content = await reviseArticle(revisionPrompt);
      validation = await validateContent(content, keywordsForValidation);
      charOutOfRange = isCharCountOutOfRange(content, charCount);
      revisionCount++;
    }

    const bodyCitations = extractCitationsFromContent(content);
    const mergedCitations = mergeCitations(researchCitations, bodyCitations);

    const article: ArticleContent = {
      title: keyword.title,
      content,
      mainKeyword: keyword.mainKeyword,
      subKeyword1: keyword.subKeyword1,
      subKeyword2: keyword.subKeyword2,
      shopName: shop.name,
      category: category.name,
      validation,
      brief,
      citations: mergedCitations,
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
