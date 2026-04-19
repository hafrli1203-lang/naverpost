import { NextRequest, NextResponse } from "next/server";
import { rewriteArticleForGeo } from "@/lib/ai/claude";
import { applyGeoRecommendations, runGeoHarness } from "@/lib/geo/harness";
import { buildGeoRewritePrompt } from "@/lib/prompts/geoRewritePrompt";
import { PROHIBITED_WORDS, CAUTION_PHRASES } from "@/lib/validation/prohibitedWords";
import { findOverusedWords } from "@/lib/validation/repetitionCheck";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import type {
  ArticleContent,
  GeoOptimizationResult,
  GeoRecommendation,
  ValidationResult,
} from "@/types";

type GeoRequestBody =
  | {
      mode: "analyze";
      article: ArticleContent;
    }
  | {
      mode: "apply";
      article: ArticleContent;
      selectedRecommendationIds: GeoRecommendation["id"][];
    }
  | {
      mode: "start-advanced";
      article: ArticleContent;
      selectedRecommendationIds: GeoRecommendation["id"][];
    }
  | {
      mode: "advanced-status";
      jobId: string;
    };

const GEO_TARGET_SCORE = 90;
const ADVANCED_GEO_MIN_AI_BASELINE_SCORE = 60;
const ADVANCED_GEO_MAX_AI_ATTEMPTS = 2;
const ADVANCED_GEO_AI_TIMEOUT_MS = 60000;
const AGGRESSIVE_DEFAULT_IDS: GeoRecommendation["id"][] = [
  "remove-template-blocks",
  "soften-claims",
  "comparison-table",
  "direct-answer-lead",
  "question-heading",
];

type AdvancedGeoJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  article?: ArticleContent;
  optimization?: GeoOptimizationResult;
  error?: string;
};

const advancedGeoJobs = new Map<string, AdvancedGeoJob>();

function buildValidationKeywords(article: ArticleContent) {
  return {
    title: article.title,
    mainKeyword: article.mainKeyword,
    subKeyword1: article.subKeyword1,
    subKeyword2: article.subKeyword2,
  };
}

function buildFastValidation(
  content: string,
  keywords: ReturnType<typeof buildValidationKeywords>
): ValidationResult {
  const prohibitedWords = PROHIBITED_WORDS.filter((word) => content.includes(word));
  const cautionPhrases = CAUTION_PHRASES.filter((phrase) => content.includes(phrase));
  const overusedWords = findOverusedWords(content);
  const hasTable = /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
  const missingKeywords = [
    keywords.mainKeyword,
    keywords.subKeyword1,
    keywords.subKeyword2,
  ].filter((keyword) => keyword && !content.includes(keyword));
  const languageRisk = analyzeLanguageRisk(content);
  const structure = analyzeTitleBodyAlignment({
    title: keywords.title ?? keywords.mainKeyword,
    content,
    keywords: [keywords.mainKeyword, keywords.subKeyword1, keywords.subKeyword2].filter(Boolean),
  });

  const revisionReasons: string[] = [];
  if (prohibitedWords.length > 0) {
    revisionReasons.push(`금지어 포함: ${prohibitedWords.join(", ")}`);
  }
  if (cautionPhrases.length > 0) {
    revisionReasons.push(`주의 표현 포함: ${cautionPhrases.join(", ")}`);
  }
  if (overusedWords.length > 0) {
    revisionReasons.push(
      `반복어 과다: ${overusedWords.map((word) => `${word.word}(${word.count})`).join(", ")}`
    );
  }
  if (!hasTable) {
    revisionReasons.push("표 없음");
  }
  if (missingKeywords.length > 0) {
    revisionReasons.push(`키워드 누락: ${missingKeywords.join(", ")}`);
  }
  if (structure.missingTitleKeywordCoverage.length > 0) {
    revisionReasons.push(
      `제목 키워드 반영 부족: ${structure.missingTitleKeywordCoverage.join(", ")}`
    );
  }

  return {
    needsRevision:
      prohibitedWords.length > 0 ||
      cautionPhrases.length > 0 ||
      overusedWords.length > 0 ||
      !hasTable ||
      missingKeywords.length > 0 ||
      structure.missingTitleKeywordCoverage.length > 0,
    prohibitedWords,
    cautionPhrases,
    overusedWords,
    missingKeywords,
    hasTable,
    revisionReasons,
    languageRisk,
    structure,
    issues: [...languageRisk.issues, ...structure.issues],
  };
}

function normalizeSelectedIds(
  ids: GeoRecommendation["id"][] | undefined
): GeoRecommendation["id"][] {
  const values = ids?.length ? ids : AGGRESSIVE_DEFAULT_IDS;
  return [...new Set(values)];
}

function sanitizeGeoRewrite(text: string, title: string): string {
  let next = text.trim();
  const fencedMatch = next.match(/```(?:markdown)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    next = fencedMatch[1].trim();
  }

  next = next.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
  next = next.replace(/^#\s+/gm, "## ");

  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  next = next.replace(new RegExp(`^##\\s*${escapedTitle}\\s*\\n+`, "i"), "");
  next = next.replace(new RegExp(`^${escapedTitle}\\s*\\n+`, "i"), "");

  return next.trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractMeaningfulTokens(text: string): string[] {
  const stopwords = new Set([
    "안내",
    "방법",
    "관리",
    "원인",
    "기준",
    "선택",
    "비교",
    "정리",
    "가이드",
    "정보",
    "이후",
    "이유",
    "무엇",
    "어디",
    "어떻게",
    "좋을까요",
    "필요",
    "도움",
  ]);

  const matches = text.match(/[가-힣A-Za-z0-9]+/g) ?? [];
  return [...new Set(matches.map((item) => item.trim()).filter((item) => item.length >= 2 && !stopwords.has(item)))];
}

function computeTokenCoverage(required: string[], content: string): number {
  if (required.length === 0) return 1;
  const hitCount = required.filter((token) => content.includes(token)).length;
  return hitCount / required.length;
}

function isTopicAligned(article: ArticleContent, content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized.includes(article.mainKeyword)) return false;

  const subKeywordHits =
    Number(normalized.includes(article.subKeyword1)) +
    Number(normalized.includes(article.subKeyword2));
  if (subKeywordHits === 0) return false;

  const titleTokens = extractMeaningfulTokens(article.title);
  const keywordTokens = extractMeaningfulTokens(
    `${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2}`
  );

  return (
    computeTokenCoverage(titleTokens, normalized) >= 0.6 &&
    computeTokenCoverage(keywordTokens, normalized) >= 0.75
  );
}

async function optimizeGeoWithAi(
  article: ArticleContent,
  selectedIds: GeoRecommendation["id"][]
): Promise<GeoOptimizationResult> {
  const analysisBefore = runGeoHarness(article, "aggressive");
  const baselineResult = applyGeoRecommendations(article, selectedIds, "aggressive");
  let bestContent = baselineResult.optimizedContent;
  let bestAnalysis = baselineResult.analysisAfter;

  const canUseAi = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!canUseAi || bestAnalysis.score < ADVANCED_GEO_MIN_AI_BASELINE_SCORE) {
    return baselineResult;
  }

  for (let attempt = 0; attempt < ADVANCED_GEO_MAX_AI_ATTEMPTS; attempt += 1) {
    if (bestAnalysis.score >= GEO_TARGET_SCORE) break;

    const prompt = buildGeoRewritePrompt({
      article: {
        ...article,
        content: bestContent,
      },
      targetScore: GEO_TARGET_SCORE,
    });

    const rewritten = await withTimeout(
      rewriteArticleForGeo(prompt, ADVANCED_GEO_AI_TIMEOUT_MS),
      ADVANCED_GEO_AI_TIMEOUT_MS + 2000
    );
    if (!rewritten) break;

    const candidateContent = sanitizeGeoRewrite(rewritten, article.title);
    if (!isTopicAligned(article, candidateContent)) continue;

    const candidateValidation = buildFastValidation(
      candidateContent,
      buildValidationKeywords(article)
    );
    if (candidateValidation.missingKeywords.length > 0) continue;

    const candidateAnalysis = runGeoHarness(
      { ...article, content: candidateContent },
      "aggressive"
    );

    if (candidateAnalysis.score > bestAnalysis.score) {
      bestContent = candidateContent;
      bestAnalysis = candidateAnalysis;
    }
  }

  return {
    appliedRecommendationIds: selectedIds,
    optimizedContent: bestContent,
    analysisBefore,
    analysisAfter: bestAnalysis,
  };
}

async function runAdvancedGeoJob(
  jobId: string,
  article: ArticleContent,
  selectedIds: GeoRecommendation["id"][]
) {
  const existing = advancedGeoJobs.get(jobId);
  if (!existing) return;

  advancedGeoJobs.set(jobId, {
    ...existing,
    status: "running",
    updatedAt: new Date().toISOString(),
  });

  try {
    const optimization = await optimizeGeoWithAi(article, selectedIds);
    const validation = buildFastValidation(
      optimization.optimizedContent,
      buildValidationKeywords(article)
    );
    const optimizedArticle: ArticleContent = {
      ...article,
      content: optimization.optimizedContent,
      validation,
      geo: optimization.analysisAfter,
    };

    advancedGeoJobs.set(jobId, {
      id: jobId,
      status: "completed",
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      article: optimizedArticle,
      optimization,
    });
  } catch (error) {
    advancedGeoJobs.set(jobId, {
      id: jobId,
      status: "failed",
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : "고득점 GEO 작업 중 오류가 발생했습니다.",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeoRequestBody;

    if (body.mode === "advanced-status") {
      const job = advancedGeoJobs.get(body.jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: "고득점 GEO 작업을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: job });
    }

    if (!body.article?.content || !body.article?.title) {
      return NextResponse.json(
        { success: false, error: "article.title 또는 article.content가 필요합니다." },
        { status: 400 }
      );
    }

    if (body.mode === "analyze") {
      const analysis = runGeoHarness(body.article, "aggressive");
      return NextResponse.json({ success: true, data: analysis });
    }

    if (body.mode === "apply") {
      const result = applyGeoRecommendations(
        body.article,
        normalizeSelectedIds(body.selectedRecommendationIds),
        "aggressive"
      );

      const validation = buildFastValidation(
        result.optimizedContent,
        buildValidationKeywords(body.article)
      );

      const optimizedArticle: ArticleContent = {
        ...body.article,
        content: result.optimizedContent,
        validation,
        geo: result.analysisAfter,
      };

      return NextResponse.json({
        success: true,
        data: {
          article: optimizedArticle,
          optimization: result,
        },
      });
    }

    if (body.mode === "start-advanced") {
      const jobId = crypto.randomUUID();
      const selectedIds = normalizeSelectedIds(body.selectedRecommendationIds);

      advancedGeoJobs.set(jobId, {
        id: jobId,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setTimeout(() => {
        void runAdvancedGeoJob(jobId, body.article, selectedIds);
      }, 0);

      return NextResponse.json({
        success: true,
        data: {
          jobId,
          status: "pending",
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "지원하지 않는 mode입니다." },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GEO 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
