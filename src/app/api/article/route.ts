import { NextRequest, NextResponse } from "next/server";
import { writeArticle, reviseArticle } from "@/lib/ai/claude";
import { researchKeyword } from "@/lib/ai/perplexity";
import { buildArticlePrompt } from "@/lib/prompts/articlePrompt";
import { buildPromoPrompt } from "@/lib/prompts/promoPrompt";
import { buildRevisionPrompt } from "@/lib/prompts/revisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { buildArticleBrief } from "@/lib/briefs/articleBrief";
import { analyzeCompetitorMorphology } from "@/lib/analysis/competitorMorphology";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import { lookupGlossary, buildGlossaryHint } from "@/lib/domain/opticalGlossary";
import type { KeywordOption, ArticleContent } from "@/types";

export const maxDuration = 360;

const MAX_REVISION_ATTEMPTS = 1;
// Multi-round research (1 main search + re-search of all follow-up questions) needs
// a larger budget than the old 12s, which silently dropped research and forced
// Claude to write from generic knowledge (the keyword-misinterpretation regression).
const RESEARCH_TIMEOUT_MS = 40_000;
const COMPETITOR_ANALYSIS_TIMEOUT_MS = 25_000;
const ARTICLE_WRITE_TIMEOUT_MS = 150_000;
const ARTICLE_RETRY_TIMEOUT_MS = 75_000;
const ARTICLE_REVISION_TIMEOUT_MS = 60_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timeout));
  });
}

function isCharCountOutOfRange(content: string, target: number): boolean {
  const length = content.length;
  const min = Math.floor(target * 0.9);
  const max = Math.ceil(target * 1.1);
  return length < min || length > max;
}

function sanitizeArticleContent(content: string): string {
  return content
    .replace(/문의해 주세요/g, "확인해 주세요")
    .replace(/문의해주세요/g, "확인해 주세요")
    .replace(/문의해주시/g, "확인해 주시")
    .replace(/문의/g, "확인");
}

function stripLeadingTitleLine(content: string, title: string): string {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningfulIndex === -1) return content.trim();

  const firstLine = lines[firstMeaningfulIndex].trim().replace(/^#+\s*/, "");
  if (firstLine === title.trim()) {
    lines.splice(firstMeaningfulIndex, 1);
    return lines.join("\n").replace(/^\s+/, "").trim();
  }

  return content.trim();
}

function needsHardRevision(
  validation: Awaited<ReturnType<typeof validateContent>>,
  charOutOfRange: boolean
): boolean {
  return (
    validation.prohibitedWords.length > 0 ||
    validation.cautionPhrases.length > 0 ||
    validation.overusedWords.length > 0 ||
    !validation.hasTable ||
    validation.missingKeywords.length > 0 ||
    (validation.structure?.missingTitleKeywordCoverage.length ?? 0) > 0 ||
    charOutOfRange
  );
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

    // Disambiguate ambiguous shop-floor terms (e.g. 멀티포컬 = contact lens) before
    // research and writing so both stages interpret the keyword correctly.
    const glossaryEntries = await lookupGlossary([
      keyword.mainKeyword,
      keyword.subKeyword1,
      keyword.subKeyword2,
      keyword.title,
    ]);
    const glossaryHint = buildGlossaryHint(glossaryEntries);

    type CompetitorMorphology = {
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
    };

    // Research, RSS history, and competitor morphology are independent inputs to the
    // brief, so run them concurrently. Serial execution previously stacked their
    // timeouts (research + competitor alone could exceed the route budget).
    const [researchResponse, rssOutcome, competitorMorphology] = await Promise.all([
      // Research keyword via Perplexity using main + both sub keywords + category +
      // glossary context together, then re-search all follow-up questions.
      withTimeout(
        researchKeyword({
          mainKeyword: keyword.mainKeyword,
          subKeyword1: keyword.subKeyword1,
          subKeyword2: keyword.subKeyword2,
          categoryName: category.name,
          glossaryHint,
        }),
        RESEARCH_TIMEOUT_MS,
        {
          text: "",
          result: { summary: "", questions: [], citations: [], followUps: [] },
          status: "empty" as const,
        }
      ),
      // RSS failure should not block article generation.
      fetchBlogTitles(shopId)
        .then((rssResult) => ({
          sameStoreHistory: rssResult.forbiddenList.slice(0, 10),
          crossBlogTitles: rssResult.referenceList.slice(0, 20),
        }))
        .catch(() => ({ sameStoreHistory: [] as string[], crossBlogTitles: [] as string[] })),
      // Competitor morphology analysis failure should not block article generation.
      withTimeout(
        analyzeCompetitorMorphology(keyword.mainKeyword),
        COMPETITOR_ANALYSIS_TIMEOUT_MS,
        {
          status: "unavailable" as const,
          reason: "Competitor analysis timed out.",
          sampleSize: 0,
          bodySampleSize: 0,
          commonNouns: [],
          titleNouns: [],
          bodyNouns: [],
          bodyHighlights: [],
          titleAngles: [],
          contentBlocks: [],
          cautionPoints: [],
        }
      )
        .then(
          (result): CompetitorMorphology => ({
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
          })
        )
        .catch((): CompetitorMorphology | undefined => undefined),
    ]);

    const researchData = researchResponse.text;
    const researchStatus = researchResponse.status;
    const { sameStoreHistory, crossBlogTitles } = rssOutcome;

    const brief = buildArticleBrief({
      keyword,
      shop,
      category,
      topic: topic || keyword.title,
      articleType,
      charCount,
      tone: tone as "standard" | "friendly" | "casual",
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
            glossaryHint,
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
            glossaryHint,
            brief,
          });

    let rawContent: string;
    try {
      rawContent = await writeArticle(prompt, ARTICLE_WRITE_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/timed out|timeout/i.test(message)) throw error;
      rawContent = await writeArticle(
        `${prompt}\n\n[재시도 지시]\n이전 시도가 시간 초과되었습니다. 위 조건은 유지하되 문단을 더 압축하고 표는 1개만 사용하세요. 본문만 출력하세요.`,
        ARTICLE_RETRY_TIMEOUT_MS
      );
    }

    let content = stripLeadingTitleLine(
      sanitizeArticleContent(rawContent),
      keyword.title
    );
    const keywordsForValidation = {
      title: keyword.title,
      mainKeyword: keyword.mainKeyword,
      subKeyword1: keyword.subKeyword1,
      subKeyword2: keyword.subKeyword2,
      forbiddenList: sameStoreHistory,
      referenceList: crossBlogTitles,
    };
    let validation = await validateContent(content, keywordsForValidation, {
      fast: true,
    });
    let charOutOfRange = isCharCountOutOfRange(content, charCount);

    let revisionCount = 0;
    let revisionError: string | undefined;
    while (
      needsHardRevision(validation, charOutOfRange) &&
      revisionCount < MAX_REVISION_ATTEMPTS
    ) {
      const revisionPrompt = buildRevisionPrompt({
        originalContent: content,
        validation,
        mainKeyword: keyword.mainKeyword,
        subKeyword1: keyword.subKeyword1,
        subKeyword2: keyword.subKeyword2,
        charCount,
      });
      try {
        content = stripLeadingTitleLine(
          sanitizeArticleContent(await reviseArticle(revisionPrompt, ARTICLE_REVISION_TIMEOUT_MS)),
          keyword.title
        );
        validation = await validateContent(content, keywordsForValidation, {
          fast: true,
        });
        charOutOfRange = isCharCountOutOfRange(content, charCount);
      } catch (error) {
        revisionError =
          error instanceof Error
            ? error.message
            : "자동 재수정 중 오류가 발생했습니다.";
        console.warn("[api/article] revision skipped", {
          revisionError,
          revisionReasons: validation.revisionReasons,
        });
        break;
      }
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
      researchStatus,
      brief,
      washingTone: tone,
      generationNote: revisionError
        ? `자동 재수정은 건너뛰었습니다: ${revisionError}`
        : undefined,
    };

    return NextResponse.json({ success: true, data: article });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "본문 작성 중 오류가 발생했습니다.";
    console.error("[api/article] failed", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
