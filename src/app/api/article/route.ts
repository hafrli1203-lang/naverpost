import { NextRequest, NextResponse } from "next/server";
import { writeArticle, reviseArticle } from "@/lib/ai/claude";
import { researchKeyword } from "@/lib/ai/perplexity";
import { buildArticlePrompt } from "@/lib/prompts/articlePrompt";
import { buildPromoPrompt } from "@/lib/prompts/promoPrompt";
import {
  buildRevisionPrompt,
  buildAutocompleteAugmentPrompt,
} from "@/lib/prompts/revisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { buildArticleBrief } from "@/lib/briefs/articleBrief";
import { analyzeCompetitorMorphology } from "@/lib/analysis/competitorMorphology";
import { inferSmartBlockSubKeywords } from "@/lib/analysis/smartBlock";
import { getCategoryDepthDimensions } from "@/lib/keywords/categoryDepth";
import { analyzeAutocompleteIndex } from "@/lib/analysis/autocompleteIndex";
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
// nounExtractor가 Haiku→Sonnet으로 느려져 25초로는 경쟁분석(G1)이 계속 실패했다. 45초로 상향.
const COMPETITOR_ANALYSIS_TIMEOUT_MS = 45_000;
// Opus 본문 작성 예산. maxDuration(360초) 안에서 앞단 병렬(~45초)+재수정(70초)까지
// 들어가도록 220초로 잡는다. 성공경로 45+220+70≈335초, 실패경로 45+220+75≈340초.
const ARTICLE_WRITE_TIMEOUT_MS = 220_000;
const ARTICLE_RETRY_TIMEOUT_MS = 75_000;
// 2000자급 본문 전체 재작성은 60초로 빠듯해 자주 타임아웃됐다. 90초로 상향.
const ARTICLE_REVISION_TIMEOUT_MS = 70_000;
const SMARTBLOCK_TIMEOUT_MS = 12_000;
const AUTOCOMPLETE_TIMEOUT_MS = 12_000;
// G3 자완 보강은 "키워드만 살짝 녹이는" 가벼운 작업이라 본문 재작성보다 짧게 잡는다.
const AUTOCOMPLETE_AUGMENT_TIMEOUT_MS = 50_000;
// maxDuration(360초)에 근접하면 G3 보강은 건너뛴다(전체 응답이 잘리지 않게).
const ARTICLE_MAX_DURATION_MS = maxDuration * 1000;
const G3_MIN_REMAINING_MS = 70_000;

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

// 본문 논지축(thesis)은 사용자가 선택·편집한 후보가 진실의 원천이다. 워크플로우 전체가
// 공유하는 단일 topic은 키워드 생성 시 한 번 정해진 뒤 제목/키워드를 수정해도 갱신되지
// 않으므로, stale topic이 본문을 옛 주제로 끌고 가 "수정해도 기존 값으로 글이 써지는"
// 문제가 있었다. 공유 topic이 후보의 메인 키워드를 (공백 차이 무관) 담고 있을 때만 더
// 풍부한 논지로 채택하고, 그 외에는 편집된 후보 제목을 논지로 사용한다.
function deriveArticleThesis(
  sharedTopic: string | undefined,
  keyword: KeywordOption
): string {
  const title = keyword.title?.trim() ?? "";
  const topic = sharedTopic?.trim() ?? "";
  if (!topic) return title;
  if (!title) return topic;

  const stripSpaces = (value: string) => value.replace(/\s+/g, "");
  const mainCore = stripSpaces(keyword.mainKeyword ?? "");
  if (mainCore && stripSpaces(topic).includes(mainCore)) {
    return topic;
  }
  return title;
}

// Windows는 프로세스 초기화 실패(0xC0000142 STATUS_DLL_INIT_FAILED 등)를 큰 종료코드 +
// 빈 stderr("no stderr")로 던진다. 이는 사용량/인증 문제가 아니라 일시적 spawn 실패이므로
// 별도로 분류해 재시도·진단이 엉키지 않게 한다.
function isProcessCrash(message: string): boolean {
  return /exited with code -?\d+: no stderr/i.test(message);
}

function summarizeGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isProcessCrash(message)) {
    return "Claude CLI 프로세스 비정상 종료(시스템 자원/spawn 일시 오류)";
  }
  if (/quota|limit|usage|rate|credit|billing|exceeded/i.test(message)) {
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
    // 사람화 절대 규칙 위반(강한 AI 상투어·본문 쉼표)은 프롬프트가 어겨도
    // 출구에서 수정 루프로 되돌린다 (설계: docs/designs/body-exit-validation.md).
    (validation.languageRisk?.strongAiCliches?.length ?? 0) > 0 ||
    (validation.languageRisk?.formatViolations?.length ?? 0) > 0 ||
    charOutOfRange
  );
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
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
    const [researchResponse, rssOutcome, competitorMorphology, smartBlockSignal] = await Promise.all([
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
      // 스마트블록 하위키워드 추론(블라이). 실패/타임아웃 시 unavailable로 graceful.
      withTimeout(inferSmartBlockSubKeywords(keyword.mainKeyword), SMARTBLOCK_TIMEOUT_MS, {
        status: "unavailable" as const,
        mainKeyword: keyword.mainKeyword,
        documentVolume: null,
        blockTypeHint: "unknown" as const,
        subKeywordCandidates: [],
        recommendedTitleKeyword: keyword.mainKeyword,
        notes: [],
      }),
    ]);

    const researchData = researchResponse.text;
    const researchStatus = researchResponse.status;
    const { sameStoreHistory, crossBlogTitles } = rssOutcome;

    const smartBlock =
      smartBlockSignal && smartBlockSignal.status === "available"
        ? {
            recommendedTitleKeyword: smartBlockSignal.recommendedTitleKeyword,
            subKeywordCandidates: smartBlockSignal.subKeywordCandidates
              .map((candidate) => candidate.keyword)
              .slice(0, 6),
            blockTypeHint: smartBlockSignal.blockTypeHint,
          }
        : undefined;

    // 선택·편집된 후보를 진실의 원천으로 삼아 본문 논지축을 도출한다(공유 topic이 stale일
    // 때 옛 주제로 본문이 써지는 문제 방지).
    const effectiveThesis = deriveArticleThesis(topic, keyword);

    const brief = buildArticleBrief({
      keyword,
      shop,
      category,
      topic: effectiveThesis,
      articleType,
      charCount,
      tone: tone as "standard" | "friendly" | "casual",
      contentSubtype,
      researchData,
      sameStoreHistory,
      crossBlogTitles,
      competitorMorphology,
      smartBlock,
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
            topic: effectiveThesis,
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
            topic: effectiveThesis,
            researchData,
            charCount,
            tone: tone as "standard" | "friendly" | "casual" | undefined,
            externalReference,
            glossaryHint,
            brief,
            depthDimensions: getCategoryDepthDimensions(category.id),
          });

    let rawContent: string | undefined;
    let generationFallbackNote: string | undefined;
    try {
      rawContent = await writeArticle(prompt, ARTICLE_WRITE_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      let retryError: unknown = error;
      const timedOut = /timed out|timeout/i.test(message);
      const crashed = isProcessCrash(message);
      // 시간 초과는 압축 재시도, 프로세스 비정상 종료(0xC0000142 등)는 잠깐 쉬고 동일
      // 프롬프트로 1회 재시도한다. 크래시는 즉시 실패하므로 예산이 거의 그대로 남아 있다.
      if (timedOut || crashed) {
        if (crashed) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        try {
          rawContent = await writeArticle(
            timedOut
              ? `${prompt}\n\n[재시도 지시]\n이전 시도가 시간 초과되었습니다. 위 조건은 유지하되 문단을 더 압축하고 표는 1개만 사용하세요. 본문만 출력하세요.`
              : prompt,
            timedOut ? ARTICLE_RETRY_TIMEOUT_MS : ARTICLE_WRITE_TIMEOUT_MS
          );
          retryError = undefined;
        } catch (secondError) {
          retryError = secondError;
        }
      }

      if (!rawContent) {
        // Codex 폴백 제거: 본문은 Claude(Opus) 전용. 실패 시 명확히 실패시킨다.
        throw new Error(
          `본문 생성에 실패했습니다(Claude Opus 전용, 외부 모델 폴백 없음): ${summarizeGenerationError(retryError ?? error)}`
        );
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

    // G3: 자완 색인 보강. 검수 통과 후에도 본문에 없는 조합형 자동완성어가 있으면
    // 1회 보강 수정을 시도하고, 검수가 후퇴하지 않을 때만 채택한다(회귀 방지, graceful).
    // maxDuration에 근접하면 보강은 건너뛴다(응답 잘림 방지).
    const g3RemainingMs = ARTICLE_MAX_DURATION_MS - (Date.now() - requestStartedAt);
    if (g3RemainingMs >= G3_MIN_REMAINING_MS) try {
      const autoIndex = await withTimeout(
        analyzeAutocompleteIndex({
          title: keyword.title,
          mainKeyword: keyword.mainKeyword,
          subKeyword1: keyword.subKeyword1,
          subKeyword2: keyword.subKeyword2,
          body: content,
        }),
        AUTOCOMPLETE_TIMEOUT_MS,
        { status: "unavailable" as const, inBody: [], suggestions: [], notes: [] }
      );

      if (autoIndex.status === "available" && autoIndex.suggestions.length > 0) {
        const augmentPrompt = buildAutocompleteAugmentPrompt({
          originalContent: content,
          suggestions: autoIndex.suggestions.map((s) => s.keyword).slice(0, 8),
          mainKeyword: keyword.mainKeyword,
          subKeyword1: keyword.subKeyword1,
          subKeyword2: keyword.subKeyword2,
          charCount,
        });
        const augmented = stripLeadingTitleLine(
          sanitizeArticleContent(
            await reviseArticle(augmentPrompt, AUTOCOMPLETE_AUGMENT_TIMEOUT_MS)
          ),
          keyword.title
        );
        const augmentedValidation = await validateContent(augmented, keywordsForValidation, {
          fast: true,
        });
        if (!needsHardRevision(augmentedValidation, isCharCountOutOfRange(augmented, charCount))) {
          content = augmented;
          validation = augmentedValidation;
        }
      }
    } catch {
      // 자완 색인 보강 실패는 본문 결과에 영향을 주지 않는다.
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
