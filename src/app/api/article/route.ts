import { NextRequest, NextResponse } from "next/server";
import { writeArticle, writeArticleWithCodex, reviseArticle } from "@/lib/ai/claude";
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
import type { KeywordOption, ArticleBrief, ArticleContent } from "@/types";

export const maxDuration = 360;

const MAX_REVISION_ATTEMPTS = 1;
// Multi-round research (1 main search + re-search of all follow-up questions) needs
// a larger budget than the old 12s, which silently dropped research and forced
// Claude to write from generic knowledge (the keyword-misinterpretation regression).
const RESEARCH_TIMEOUT_MS = 40_000;
const COMPETITOR_ANALYSIS_TIMEOUT_MS = 25_000;
const ARTICLE_WRITE_TIMEOUT_MS = 150_000;
const ARTICLE_RETRY_TIMEOUT_MS = 75_000;
const ARTICLE_CODEX_FALLBACK_TIMEOUT_MS = 180_000;
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

function summarizeGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/no stderr|quota|limit|usage|rate|credit|billing|exceeded/i.test(message)) {
    return "Claude CLI 사용량/인증 문제";
  }
  if (/timed out|timeout/i.test(message)) {
    return "Claude CLI 시간 초과";
  }
  if (/not found|ENOENT/i.test(message)) {
    return "Claude CLI 실행 파일 없음";
  }
  return message || "Claude CLI 실패";
}

function buildCodexFallbackArticlePrompt(params: {
  keyword: KeywordOption;
  brief: ArticleBrief;
  glossaryHint?: string;
}): string {
  const { keyword, brief, glossaryHint } = params;
  const commonNouns = brief.competitorMorphology?.commonNouns?.slice(0, 12) ?? [];
  const bodyNouns = brief.competitorMorphology?.bodyNouns?.slice(0, 10) ?? [];
  const highlights = brief.competitorMorphology?.bodyHighlights?.slice(0, 4) ?? [];
  const shopStrengths = brief.shop.serviceStrengths?.slice(0, 4) ?? [];
  const visitChecklist = brief.shop.visitChecklist?.slice(0, 4) ?? [];
  const avoidClaims = brief.shop.avoidClaims?.slice(0, 6) ?? [];

  return `
네이버 블로그 본문만 작성하세요. 제목, JSON, 코드블록, 해설은 출력하지 마세요.

[글 정보]
- 제목: ${keyword.title}
- 메인 키워드: ${keyword.mainKeyword}
- 서브 키워드: ${keyword.subKeyword1}, ${keyword.subKeyword2}
- 전체 주제/논지: ${brief.topic}
- 카테고리: ${brief.category.name}
- 매장: ${brief.shop.name}
- 목표 분량: ${brief.charCount}자 내외
- 말투: ${brief.tone === "friendly" ? "친근하지만 과장 없는 설명체" : brief.tone}

[검색 의도]
- 검색자는 불편한 이유, 선택 기준, 방문 전 확인할 점을 알고 싶어 합니다.
- 첫 문단은 실제 상황으로 시작하고, 바로 해결 기준을 제시하세요.
- 글 전체가 "${brief.topic}" 논지에서 벗어나지 않게 쓰세요.

[본문에 자연스럽게 분산할 보조 형태소]
- 공통 명사: ${commonNouns.join(", ") || "없음"}
- 본문 핵심어: ${bodyNouns.join(", ") || "없음"}
- 반복 논점: ${highlights.join(" / ") || "없음"}

[매장 정보]
- 강점: ${shopStrengths.join(", ") || "과장 없이 검사와 상담 중심으로 표현"}
- 방문 체크: ${visitChecklist.join(", ") || "현재 불편 원인을 확인"}
- 피할 표현: ${avoidClaims.join(", ") || "최고, 완벽, 치료, 보장, 즉시 해결"}
${glossaryHint ? `\n[용어 구분]\n${glossaryHint}` : ""}

[작성 규칙]
- 메인 키워드는 2회 이상, 서브 키워드는 각각 1회 이상 자연스럽게 포함하세요.
- 같은 키워드를 몰아서 반복하지 말고 문단마다 의미를 바꿔 사용하세요.
- 비교나 체크 기준이 필요한 경우에만 간단한 Markdown 표 1개를 쓰세요.
- 쉼표는 남용하지 말고 문장은 짧게 끊으세요.
- 과장 광고, 병원식 치료 표현, "문의해 주세요" 표현은 쓰지 마세요.
- 마지막은 매장 방문을 강요하지 말고 "확인해 보면 좋다" 수준으로 마무리하세요.
`.trim();
}

function needsHardRevision(
  validation: Awaited<ReturnType<typeof validateContent>>,
  charOutOfRange: boolean
): boolean {
  return (
    validation.prohibitedWords.length > 0 ||
    validation.cautionPhrases.length > 0 ||
    validation.overusedWords.length > 0 ||
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

    let rawContent: string | undefined;
    let generationFallbackNote: string | undefined;
    try {
      rawContent = await writeArticle(prompt, ARTICLE_WRITE_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      let retryError: unknown = error;
      if (/timed out|timeout/i.test(message)) {
        try {
          rawContent = await writeArticle(
            `${prompt}\n\n[재시도 지시]\n이전 시도가 시간 초과되었습니다. 위 조건은 유지하되 문단을 더 압축하고 표는 1개만 사용하세요. 본문만 출력하세요.`,
            ARTICLE_RETRY_TIMEOUT_MS
          );
          retryError = undefined;
        } catch (secondError) {
          retryError = secondError;
        }
      }

      if (!rawContent) {
        try {
          rawContent = await writeArticleWithCodex(
            buildCodexFallbackArticlePrompt({
              keyword,
              brief,
              glossaryHint,
            }),
            ARTICLE_CODEX_FALLBACK_TIMEOUT_MS
          );
          generationFallbackNote = `Claude 작성 실패 후 Codex로 대체 생성했습니다: ${summarizeGenerationError(retryError ?? error)}`;
        } catch (fallbackError) {
          throw new Error(
            `본문 생성 모델이 모두 실패했습니다. Claude: ${summarizeGenerationError(
              retryError ?? error
            )} / Codex: ${summarizeGenerationError(fallbackError)}`
          );
        }
      }
    }

    if (!rawContent) {
      throw new Error("본문 생성 결과가 비어 있습니다.");
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
        ? [
            generationFallbackNote,
            `자동 재수정은 건너뛰었습니다: ${revisionError}`,
          ].filter(Boolean).join(" / ")
        : generationFallbackNote,
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
