import { NextRequest, NextResponse } from "next/server";
import { generateKeywords } from "@/lib/ai/claude";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import {
  fetchCompetitorTitles,
  getExternalSearchSignals,
  NaverSearchDependencyError,
} from "@/lib/naver/searchSignals";
import { buildTitleGenerationPrompt } from "@/lib/prompts/titlePrompt";
import { listSessions } from "@/lib/storage/sessionStore";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { analyzeNetworkDuplicateRisk } from "@/lib/validation/networkDuplicateAnalyzer";
import { validateKeywordOption } from "@/lib/validation/keywordRules";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import type { KeywordOption, KeywordOptionAnalysis } from "@/types";

export const maxDuration = 120;
const EXTERNAL_SIGNAL_TOP_K = 3;

function normalizeTitleForComparison(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenizeTitleForComparison(title: string): string[] {
  const tokens = title.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(tokens.map((token) => token.toLowerCase()))];
}

function calculateTitleSimilarity(a: string, b: string): number {
  const aNorm = normalizeTitleForComparison(a);
  const bNorm = normalizeTitleForComparison(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;

  const aTokens = tokenizeTitleForComparison(aNorm);
  const bTokens = tokenizeTitleForComparison(bNorm);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const bSet = new Set(bTokens);
  const shared = aTokens.filter((token) => bSet.has(token));
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = union === 0 ? 0 : shared.length / union;
  const overlapByShorter = shared.length / Math.max(1, Math.min(aTokens.length, bTokens.length));

  return Math.max(jaccard, overlapByShorter);
}

function isTooSimilarTitle(a: KeywordOption, b: KeywordOption): boolean {
  const similarity = calculateTitleSimilarity(a.title, b.title);
  if (similarity >= 0.72) return true;

  const sameMainKeyword = a.mainKeyword.trim() === b.mainKeyword.trim();
  const sameSubKeyword1 = a.subKeyword1.trim() === b.subKeyword1.trim();
  const sameSubKeyword2 = a.subKeyword2.trim() === b.subKeyword2.trim();

  return sameMainKeyword && sameSubKeyword1 && sameSubKeyword2;
}

const TARGET_RESULT_COUNT = 10;

function pickDiverseKeywordResults<T extends KeywordOption & { _priorityScore: number }>(
  rankedResults: T[]
): T[] {
  const selected: T[] = [];

  for (const candidate of rankedResults) {
    if (selected.length >= TARGET_RESULT_COUNT) break;
    if (selected.every((picked) => !isTooSimilarTitle(candidate, picked))) {
      selected.push(candidate);
    }
  }

  if (selected.length >= TARGET_RESULT_COUNT) {
    return selected;
  }

  for (const candidate of rankedResults) {
    if (selected.includes(candidate)) continue;
    if (selected.length >= TARGET_RESULT_COUNT) break;

    const weakestSimilarity = Math.max(
      ...selected.map((picked) => calculateTitleSimilarity(candidate.title, picked.title))
    );

    if (weakestSimilarity < 0.9) {
      selected.push(candidate);
    }
  }

  if (selected.length === 0) return rankedResults;
  return selected;
}

function inferSearchIntentAxis(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/가격|비용|얼마|후기/.test(source)) return "price";
  if (/리뷰|추천|비교|후기/.test(source)) return "review";
  if (/방법|가이드|정리|체크리스트/.test(source)) return "guide";
  if (/위치|방문|예약|주차|운영/.test(source)) return "visit";
  return "info";
}

async function buildKeywordAnalysis(params: {
  option: KeywordOption;
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
  externalSignals?: KeywordOptionAnalysis["externalSignals"];
}): Promise<KeywordOptionAnalysis> {
  const { option, forbiddenList, referenceList, competitorList, externalSignals } = params;
  const syntheticBody =
    `${option.title}\n${option.mainKeyword}\n${option.subKeyword1}\n${option.subKeyword2}`;
  const keywords = [option.mainKeyword, option.subKeyword1, option.subKeyword2];
  const morphology = analyzeMorphology({
    title: option.title,
    content: syntheticBody,
    keywords,
  });
  const languageRisk = analyzeLanguageRisk(
    `${option.title}\n${option.mainKeyword}\n${option.subKeyword1}\n${option.subKeyword2}`
  );
  const structure = analyzeTitleBodyAlignment({
    title: option.title,
    content: syntheticBody,
    keywords,
  });
  const duplicateRisk = analyzeNetworkDuplicateRisk({
    option,
    forbiddenList,
    referenceList,
    competitorList,
  });
  const issues = [
    ...morphology.issues,
    ...languageRisk.issues,
    ...structure.issues,
    ...duplicateRisk.issues,
  ];

  return {
    morphology,
    languageRisk,
    structure,
    duplicateRisk,
    externalSignals,
    searchIntentAxis: inferSearchIntentAxis(option),
    bodyExpansionFit: {
      isLikelyExpandable:
        structure.missingTitleKeywordCoverage.length === 0 &&
        duplicateRisk.titlePatternOverlap.length === 0,
      reason:
        structure.missingTitleKeywordCoverage.length === 0
          ? "제목과 키워드가 본문 확장에 필요한 기본 구조를 충족합니다."
          : "제목 키워드가 본문 구조에서 충분히 확인되지 않아 확장성이 낮습니다.",
    },
    issues,
  };
}

function getKeywordPriorityScore(params: {
  validation: ReturnType<typeof validateKeywordOption>;
  analysis: KeywordOptionAnalysis;
}): number {
  const { validation, analysis } = params;
  let score = 0;

  if (validation.isValid) score += 100;
  score -= validation.failures.length * 15;
  score -= analysis.issues.length * 8;
  score -= (analysis.duplicateRisk?.titlePatternOverlap.length ?? 0) * 40;
  score -= (analysis.duplicateRisk?.keywordCombinationOverlap.length ?? 0) * 20;
  score -= (analysis.languageRisk?.commercial.length ?? 0) * 5;
  score -= (analysis.languageRisk?.emphasis.length ?? 0) * 5;
  score -= (analysis.structure?.missingTitleKeywordCoverage.length ?? 0) * 8;

  if (analysis.bodyExpansionFit?.isLikelyExpandable) score += 12;
  if (analysis.searchIntentAxis === "guide" || analysis.searchIntentAxis === "info") {
    score += 6;
  }

  return score;
}

type AnalyzedKeyword = KeywordOption & {
  analysis: KeywordOptionAnalysis;
  validation: ReturnType<typeof validateKeywordOption>;
  _priorityScore: number;
};

function isCleanCandidate(option: AnalyzedKeyword): boolean {
  const issues = option.analysis.duplicateRisk?.issues ?? [];
  const competitorHit = issues.some(
    (issue) =>
      issue.code === "competitor-top-title-overlap" ||
      issue.code === "competitor-keyword-combination-overlap"
  );
  const sameStoreHit = issues.some(
    (issue) => issue.code === "same-store-title-overlap"
  );
  const crossBlogHit = issues.some(
    (issue) =>
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
  return !competitorHit && !sameStoreHit && !crossBlogHit;
}

async function analyzeOptions(params: {
  rawOptions: KeywordOption[];
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
}): Promise<AnalyzedKeyword[]> {
  const { rawOptions, forbiddenList, referenceList, competitorList } = params;

  return Promise.all(
    rawOptions.map(async (option) => {
      const validation = validateKeywordOption(option, forbiddenList, referenceList);
      const analysis = await buildKeywordAnalysis({
        option,
        forbiddenList,
        referenceList,
        competitorList,
      });
      return {
        ...option,
        analysis,
        validation,
        _priorityScore: getKeywordPriorityScore({ validation, analysis }),
      };
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId } = body as {
      shopId: string;
      categoryId: string;
      topic: string;
    };

    if (!shopId || !categoryId) {
      return NextResponse.json(
        { success: false, error: "shopId와 categoryId가 필요합니다." },
        { status: 400 }
      );
    }

    const shop = await getShopById(shopId);
    const category = CATEGORIES.find((item) => item.id === categoryId);

    if (!shop || !category) {
      return NextResponse.json(
        { success: false, error: "유효한 상점 또는 카테고리를 찾지 못했습니다." },
        { status: 400 }
      );
    }

    let forbiddenList: string[] = [];
    let referenceList: string[] = [];
    try {
      const rssResult = await fetchBlogTitles(shopId);
      forbiddenList = rssResult.forbiddenList;
      referenceList = rssResult.referenceList;
    } catch {
      // RSS 이력은 보조 신호이므로 실패해도 키워드 분석은 계속 진행한다.
    }

    // 임시저장만 수행하는 워크플로우 특성상 RSS 에는 시스템 생성물이 반영되지 않는다.
    // 세션 저장소에 쌓인 최근 생성 이력을 타깃=forbidden / 나머지=reference 로 합쳐
    // 스펙의 6개 매장 중복 방지 지침이 실데이터 기반으로 동작하도록 보정한다.
    try {
      const sessions = await listSessions();
      const forbiddenSet = new Set(forbiddenList);
      const referenceSet = new Set(referenceList);
      for (const session of sessions.slice(0, 30)) {
        const title = (session.title ?? "").trim();
        if (!title) continue;
        if (session.shopName === shop.name) {
          forbiddenSet.add(title);
        } else {
          referenceSet.add(title);
        }
      }
      forbiddenList = Array.from(forbiddenSet);
      referenceList = Array.from(referenceSet);
    } catch {
      // 세션 저장소 장애는 키워드 생성을 막지 않는다.
    }

    const competitorSeeds = [
      category.name,
      ...category.subcategories.slice(0, 3),
    ].filter(Boolean);

    let competitorList: string[] = [];
    try {
      competitorList = await fetchCompetitorTitles(competitorSeeds);
    } catch {
      // 네이버 검색 실패 시 경쟁 제목 없이 진행
    }

    const firstPrompt = buildTitleGenerationPrompt({
      targetStore: shop.name,
      category: category.name,
      categorySubtopics: category.subcategories,
      forbiddenList,
      referenceList,
      competitorList,
    });

    const firstBatch = await generateKeywords(firstPrompt);

    if (!Array.isArray(firstBatch) || firstBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: "키워드 후보를 생성하지 못했습니다. 입력 조건을 다시 확인해주세요." },
        { status: 500 }
      );
    }

    let analyzed = await analyzeOptions({
      rawOptions: firstBatch,
      forbiddenList,
      referenceList,
      competitorList,
    });

    let cleanCandidates = analyzed.filter(isCleanCandidate);

    if (cleanCandidates.length < 4) {
      const overlapTitles = Array.from(
        new Set(
          analyzed
            .filter((item) => !isCleanCandidate(item))
            .map((item) => item.title.trim())
            .filter(Boolean)
        )
      );

      const strengthenedCompetitorList = Array.from(
        new Set([...competitorList, ...overlapTitles])
      );

      try {
        const retryPrompt = buildTitleGenerationPrompt({
          targetStore: shop.name,
          category: category.name,
          categorySubtopics: category.subcategories,
          forbiddenList,
          referenceList,
          competitorList: strengthenedCompetitorList,
        });
        const retryBatch = await generateKeywords(retryPrompt);
        if (Array.isArray(retryBatch) && retryBatch.length > 0) {
          const retryAnalyzed = await analyzeOptions({
            rawOptions: retryBatch,
            forbiddenList,
            referenceList,
            competitorList,
          });
          const titleSeen = new Set(analyzed.map((item) => item.title.trim()));
          for (const candidate of retryAnalyzed) {
            if (!titleSeen.has(candidate.title.trim())) {
              analyzed.push(candidate);
              titleSeen.add(candidate.title.trim());
            }
          }
          cleanCandidates = analyzed.filter(isCleanCandidate);
        }
      } catch {
        // 재생성 실패는 1차 결과 사용
      }
    }

    // 스펙 line 161-162 "forbidden_list 같은 소재 절대 금지 / reference_list 같은 관점 금지"
    // 최우선 지침에 따라 중복으로 감지된 후보는 결과에 포함하지 않는다.
    // 결과 개수가 TARGET_RESULT_COUNT 미만이어도 risky backfill 은 하지 않는다.
    const rankedResults: AnalyzedKeyword[] = [...cleanCandidates]
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .slice(0, TARGET_RESULT_COUNT);

    const diverseRankedResults = pickDiverseKeywordResults(rankedResults);
    const topForExternalSignals = diverseRankedResults.slice(0, EXTERNAL_SIGNAL_TOP_K);

    const externalSignalEntries = await Promise.all(
      topForExternalSignals.map(async (item) => {
        try {
          const externalSignals = await getExternalSearchSignals({
            title: item.title,
            mainKeyword: item.mainKeyword,
            subKeyword1: item.subKeyword1,
            subKeyword2: item.subKeyword2,
          });
          return [item.title, externalSignals] as const;
        } catch {
          return [item.title, undefined] as const;
        }
      })
    );

    const externalSignalMap = new Map(externalSignalEntries);

    const results = diverseRankedResults.map((item) => {
      const { _priorityScore, analysis, ...rest } = item;
      void _priorityScore;
      return {
        ...rest,
        analysis: {
          ...analysis,
          externalSignals: externalSignalMap.get(item.title),
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: { results },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "키워드 분석 중 알 수 없는 오류가 발생했습니다.";
    const status = error instanceof NaverSearchDependencyError ? 503 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
