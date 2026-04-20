import { NextRequest, NextResponse } from "next/server";
import { rewriteArticleForGeo } from "@/lib/ai/claude";
import {
  analyzeHeadingSignals,
  applyGeoRecommendations,
  detectPostType,
  hasTable,
  hasTemplateArtifacts,
  removeTemplateBlocks,
  runGeoHarness,
  softenClaims,
} from "@/lib/geo/harness";
import { buildGeoRewritePrompt } from "@/lib/prompts/geoRewritePrompt";
import {
  extractCitationsFromContent,
  mergeCitations,
} from "@/lib/ai/citationExtractor";
import { getCuratedCitations } from "@/lib/ai/curatedCitations";
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
      mode: "plan";
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
const ADVANCED_GEO_MAX_AI_ATTEMPTS = 3;
const ADVANCED_GEO_AI_TIMEOUT_MS = 60000;
const SAFE_GEO_REWRITE_TIMEOUT_MS = 45000;

const AI_REWRITE_IDS: ReadonlySet<GeoRecommendation["id"]> = new Set([
  "question-heading",
  "direct-answer-lead",
  "comparison-table",
  "add-source-citation",
  "add-expert-quote",
  "remove-cliches",
]);

const PROTECTED_POST_TYPES: ReadonlySet<ReturnType<typeof detectPostType>> = new Set([
  "price-list",
  "product-intro",
]);

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

type RewriteIntegrityCheck = {
  ok: boolean;
  reasons: string[];
};

type GeoPlanStep = {
  pass: number;
  recommendation: GeoRecommendation;
  projectedScore: number;
};

type GeoPlanData = {
  analysis: ReturnType<typeof runGeoHarness>;
  projectedScore: number;
  steps: GeoPlanStep[];
};

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

function filterSelectedIdsForPostType(
  article: ArticleContent,
  selectedIds: GeoRecommendation["id"][]
): GeoRecommendation["id"][] {
  const postType = detectPostType(article);
  if (!PROTECTED_POST_TYPES.has(postType)) return selectedIds;
  return selectedIds.filter((id) => !AI_REWRITE_IDS.has(id));
}

function mergeServerRecommendations(
  article: ArticleContent,
  clientSelectedIds: GeoRecommendation["id"][] | undefined
): GeoRecommendation["id"][] {
  const analysis = runGeoHarness(article, "safe");
  const defaultIds = analysis.recommendations
    .filter((item) => item.selectedByDefault)
    .map((item) => item.id);

  const clientIds = clientSelectedIds ?? [];
  const merged = [...new Set<GeoRecommendation["id"]>([...clientIds, ...defaultIds])];
  return filterSelectedIdsForPostType(article, merged);
}

function buildGeoPlan(article: ArticleContent): GeoPlanData {
  const analysis = runGeoHarness(article, "safe");
  const steps: GeoPlanStep[] = analysis.recommendations.map((recommendation, index) => ({
    pass: 1,
    recommendation,
    projectedScore: Math.min(100, analysis.score + (index + 1) * 6),
  }));
  const projectedScore = steps.length
    ? steps[steps.length - 1].projectedScore
    : analysis.score;
  return { analysis, projectedScore, steps };
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

function postProcessGeoRewrite(content: string, article: ArticleContent): string {
  let next = removeTemplateBlocks(content, article);
  next = softenClaims(next);
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

function countParagraphs(content: string): number {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;
}

function countBullets(content: string): number {
  return (content.match(/^\s*[-*]\s+/gm) ?? []).length;
}

function countHeadings(content: string): number {
  return (content.match(/^##\s+/gm) ?? []).length;
}

function countSentences(content: string): number {
  return (
    content
      .split(/[.!?]\s+|[。！？]\s*|\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 8).length || 1
  );
}

function hasAwkwardFormatting(content: string): boolean {
  return /^---/m.test(content) || /(?:^|\n)---(?:\n|$)/.test(content);
}

function checkRewriteIntegrity(
  article: ArticleContent,
  originalContent: string,
  candidateContent: string
): RewriteIntegrityCheck {
  const reasons: string[] = [];
  const normalizedOriginal = originalContent.replace(/\s+/g, " ").trim();
  const normalizedCandidate = candidateContent.replace(/\s+/g, " ").trim();

  if (hasAwkwardFormatting(candidateContent)) {
    reasons.push("구분선 같은 인위적 서식이 추가됨");
  }

  if (hasTemplateArtifacts(candidateContent)) {
    reasons.push("AI가 FAQ/핵심 답변 리터럴을 다시 삽입함");
  }

  const originalParagraphs = countParagraphs(originalContent);
  const candidateParagraphs = countParagraphs(candidateContent);
  if (candidateParagraphs < Math.max(3, Math.floor(originalParagraphs * 0.6))) {
    reasons.push("문단 수가 지나치게 줄어 의미가 축약될 위험이 있음");
  }

  const originalSentences = countSentences(originalContent);
  const candidateSentences = countSentences(candidateContent);
  if (candidateSentences < Math.max(4, Math.floor(originalSentences * 0.6))) {
    reasons.push("설명 문장 수가 지나치게 줄어듦");
  }

  const originalBullets = countBullets(originalContent);
  const candidateBullets = countBullets(candidateContent);
  if (candidateBullets > Math.max(originalBullets + 3, 5)) {
    reasons.push("목록형 문장이 과도하게 늘어 자연스러움이 떨어질 수 있음");
  }

  const candidateHeadings = countHeadings(candidateContent);
  if (candidateHeadings < 3 || candidateHeadings > 6) {
    reasons.push("소제목 구조가 과하거나 부족함");
  }

  const originalTokens = extractMeaningfulTokens(
    `${article.title} ${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2} ${normalizedOriginal}`
  );
  if (computeTokenCoverage(originalTokens.slice(0, 24), normalizedCandidate) < 0.55) {
    reasons.push("원문 핵심 의미 보존 비율이 낮음");
  }

  if (normalizedOriginal.includes(article.shopName) && !normalizedCandidate.includes(article.shopName)) {
    reasons.push("매장 정보가 누락됨");
  }

  if (normalizedOriginal.includes(article.category) && !normalizedCandidate.includes(article.category)) {
    reasons.push("업종 맥락이 누락됨");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
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

function buildRetryFeedback(params: {
  selectedIds: GeoRecommendation["id"][];
  cleanedContent: string;
  attempt: number;
}): string | undefined {
  const { selectedIds, cleanedContent, attempt } = params;
  const signals = analyzeHeadingSignals(cleanedContent);
  const items: string[] = [];

  if (selectedIds.includes("question-heading") && signals.questionRatio < 0.5) {
    items.push(
      `소제목 ${signals.meaningful}개 중 ${signals.questionCount}개만 질문형이었습니다. 반드시 3개 이상을 "~인가요?"/"~하나요?" 형태 질문형으로 바꿔 주세요. 본문 문단은 그대로 두고 소제목만 바꾸면 됩니다.`
    );
  }

  if (selectedIds.includes("direct-answer-lead") && signals.directAnswerRatio < 0.5) {
    items.push(
      `섹션 ${signals.meaningful}개 중 ${signals.directAnswerCount}개만 첫 줄에 40~80자 직답이 있었습니다. 남은 섹션 첫 줄에도 40~80자 요약 문장을 넣어 주세요. 요약은 해당 섹션 본문이 이미 설명하는 내용을 그대로 압축한 것이어야 합니다.`
    );
  }

  if (selectedIds.includes("comparison-table") && !hasTable(cleanedContent)) {
    items.push(
      "비교 테이블이 본문에 없습니다. 본문 중간에 3~4열 markdown 표를 하나 추가하세요. 표의 수치·기준은 본문에 이미 있는 것만 정리하세요."
    );
  }

  if (items.length === 0) return undefined;
  return `[${attempt}차 시도 점검]\n- ${items.join("\n- ")}`;
}

async function runAiRewrite(
  article: ArticleContent,
  selectedIds: GeoRecommendation["id"][],
  options: { timeoutMs: number; maxAttempts: number; targetScore: number }
): Promise<{ content: string; appliedIds: GeoRecommendation["id"][] } | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;

  const baselineAnalysis = runGeoHarness(article, "aggressive");
  let bestContent: string | null = null;
  let bestScore = baselineAnalysis.score;
  let retryFeedback: string | undefined;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const prompt = buildGeoRewritePrompt({
      article,
      selectedIds,
      targetScore: options.targetScore,
      retryFeedback,
    });
    const rewritten = await withTimeout(
      rewriteArticleForGeo(prompt, options.timeoutMs),
      options.timeoutMs + 2000
    );
    if (!rewritten) {
      retryFeedback = "이전 시도가 시간 내 응답하지 못했습니다. 더 간결한 변경만 적용하세요.";
      continue;
    }

    const sanitized = sanitizeGeoRewrite(rewritten, article.title);
    const cleaned = postProcessGeoRewrite(sanitized, article);
    if (!cleaned) {
      retryFeedback = "이전 응답이 비어 있었습니다. 본문 markdown만 출력하세요.";
      continue;
    }
    if (!isTopicAligned(article, cleaned)) {
      retryFeedback =
        "이전 시도에서 메인/서브 키워드 또는 제목 관련 핵심 단어가 본문에 충분히 유지되지 않았습니다. 원문의 모든 핵심 키워드를 자연스럽게 유지해 주세요.";
      continue;
    }

    const integrity = checkRewriteIntegrity(article, article.content, cleaned);
    if (!integrity.ok) {
      retryFeedback = `이전 시도는 다음 이유로 폐기되었습니다: ${integrity.reasons.join("; ")}. 이번에는 원문 구조와 의미를 더 엄격히 보존하세요.`;
      continue;
    }

    const candidateValidation = buildFastValidation(cleaned, buildValidationKeywords(article));
    if (candidateValidation.missingKeywords.length > 0) {
      retryFeedback = `이전 시도에서 누락된 키워드: ${candidateValidation.missingKeywords.join(", ")}. 반드시 본문에 포함시키세요.`;
      continue;
    }

    const candidateAnalysis = runGeoHarness(
      { ...article, content: cleaned, validation: candidateValidation },
      "aggressive"
    );

    if (candidateAnalysis.score >= bestScore - 2) {
      bestContent = cleaned;
      bestScore = Math.max(bestScore, candidateAnalysis.score);
    }

    const nextFeedback = buildRetryFeedback({
      selectedIds,
      cleanedContent: cleaned,
      attempt: attempt + 1,
    });

    if (candidateAnalysis.score >= options.targetScore && !nextFeedback) break;
    retryFeedback = nextFeedback;
    if (!retryFeedback) break;
  }

  if (!bestContent) return null;
  return {
    content: bestContent,
    appliedIds: selectedIds.filter((id) => AI_REWRITE_IDS.has(id)),
  };
}

async function optimizeArticleForGeo(
  article: ArticleContent,
  selectedIds: GeoRecommendation["id"][],
  options: { timeoutMs: number; maxAttempts: number; targetScore: number }
): Promise<GeoOptimizationResult> {
  const analysisBefore = runGeoHarness(article, "safe");
  const postType = detectPostType(article);
  const effectiveIds = filterSelectedIdsForPostType(article, selectedIds);

  const existingCitations = article.citations ?? [];
  const bodyCitations = extractCitationsFromContent(article.content);
  const existingInstitutions = new Set(
    [...existingCitations, ...bodyCitations].map((c) => c.institution.trim())
  );
  const curatedCitations = getCuratedCitations({
    categoryName: article.category,
    keywords: [
      article.mainKeyword,
      article.subKeyword1,
      article.subKeyword2,
    ],
    excludeInstitutions: Array.from(existingInstitutions),
    max: 4,
  });
  const hydratedCitations = mergeCitations(
    mergeCitations(existingCitations, bodyCitations),
    curatedCitations
  );

  let workingArticle: ArticleContent = {
    ...article,
    citations: hydratedCitations,
  };
  const appliedIds: GeoRecommendation["id"][] = [];

  const aiRewriteIds = effectiveIds.filter((id) => AI_REWRITE_IDS.has(id));
  const canUseAiRewrite = aiRewriteIds.length > 0 && postType === "general";

  if (canUseAiRewrite) {
    const rewriteResult = await runAiRewrite(workingArticle, effectiveIds, options);
    if (rewriteResult) {
      workingArticle = {
        ...workingArticle,
        content: rewriteResult.content,
      };
      appliedIds.push(...rewriteResult.appliedIds);
    }
  }

  const deterministicIds = effectiveIds.filter(
    (id) => id === "remove-template-blocks" || id === "soften-claims" || id === "comparison-table"
  );
  if (deterministicIds.length > 0) {
    const deterministicResult = applyGeoRecommendations(workingArticle, deterministicIds, "safe");
    if (deterministicResult.appliedRecommendationIds.length > 0) {
      workingArticle = {
        ...workingArticle,
        content: deterministicResult.optimizedContent,
      };
      deterministicResult.appliedRecommendationIds.forEach((id) => {
        if (!appliedIds.includes(id)) appliedIds.push(id);
      });
    }
  }

  const finalAnalysis = runGeoHarness(workingArticle, "safe");

  if (finalAnalysis.score < analysisBefore.score - 2) {
    return {
      appliedRecommendationIds: [],
      optimizedContent: article.content,
      analysisBefore,
      analysisAfter: analysisBefore,
    };
  }

  return {
    appliedRecommendationIds: appliedIds,
    optimizedContent: workingArticle.content,
    analysisBefore,
    analysisAfter: finalAnalysis,
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
    const optimization = await optimizeArticleForGeo(article, selectedIds, {
      timeoutMs: ADVANCED_GEO_AI_TIMEOUT_MS,
      maxAttempts: ADVANCED_GEO_MAX_AI_ATTEMPTS,
      targetScore: GEO_TARGET_SCORE,
    });
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
      const analysis = runGeoHarness(body.article, "safe");
      return NextResponse.json({ success: true, data: analysis });
    }

    if (body.mode === "plan") {
      const plan = buildGeoPlan(body.article);
      return NextResponse.json({ success: true, data: plan });
    }

    if (body.mode === "apply") {
      const serverSelectedIds = mergeServerRecommendations(
        body.article,
        body.selectedRecommendationIds
      );

      const result = await optimizeArticleForGeo(body.article, serverSelectedIds, {
        timeoutMs: SAFE_GEO_REWRITE_TIMEOUT_MS,
        maxAttempts: 1,
        targetScore: GEO_TARGET_SCORE,
      });

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
      const selectedIds = mergeServerRecommendations(
        body.article,
        body.selectedRecommendationIds
      );

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
