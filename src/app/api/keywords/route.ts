import { NextRequest, NextResponse } from "next/server";
import { generateKeywords } from "@/lib/ai/claude";
import { buildTitleGenerationPrompt } from "@/lib/prompts/titlePrompt";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { getExternalSearchSignals } from "@/lib/naver/searchSignals";
import { validateKeywordOption } from "@/lib/validation/keywordRules";
import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import { analyzeNetworkDuplicateRisk } from "@/lib/validation/networkDuplicateAnalyzer";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import type { KeywordOption, KeywordOptionAnalysis } from "@/types";

export const maxDuration = 120;

function inferSearchIntentAxis(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/가격|비용|가성비|혜택|할인/.test(source)) return "price";
  if (/후기|리뷰|경험|추천/.test(source)) return "review";
  if (/방법|정리|가이드|팁|비교/.test(source)) return "guide";
  if (/위치|주차|영업|예약|방문/.test(source)) return "visit";
  return "info";
}

async function buildKeywordAnalysis(params: {
  option: KeywordOption;
  forbiddenList: string[];
  referenceList: string[];
}): Promise<KeywordOptionAnalysis> {
  const { option, forbiddenList, referenceList } = params;
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
  });
  const externalSignals = await getExternalSearchSignals({
    title: option.title,
    mainKeyword: option.mainKeyword,
    subKeyword1: option.subKeyword1,
    subKeyword2: option.subKeyword2,
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
          ? "제목과 키워드 요소를 본문에 자연스럽게 활성화할 기본 구성이 확보되어 있습니다."
          : "제목 요소 일부가 본문으로 확장되기 어려운 조합입니다.",
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
  score -= analysis.duplicateRisk?.titlePatternOverlap.length ?? 0 * 10;
  score -= analysis.duplicateRisk?.keywordCombinationOverlap.length ?? 0 * 8;
  score -= analysis.languageRisk?.commercial.length ?? 0 * 5;
  score -= analysis.languageRisk?.emphasis.length ?? 0 * 5;
  score -= analysis.structure?.missingTitleKeywordCoverage.length ?? 0 * 8;

  if (analysis.bodyExpansionFit?.isLikelyExpandable) score += 12;
  if (analysis.searchIntentAxis === "guide" || analysis.searchIntentAxis === "info") {
    score += 6;
  }

  return score;
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

    if (!Array.isArray(options) || options.length === 0) {
      return NextResponse.json(
        { success: false, error: "키워드 생성 결과가 비어 있습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    // 키워드 7대 규칙 검증 결과 첨부
    const analyzedResults = await Promise.all(
      options.map(async (option) => {
        const validation = validateKeywordOption(
          option,
          forbiddenList,
          referenceList
        );
        const analysis = await buildKeywordAnalysis({
          option,
          forbiddenList,
          referenceList,
        });

        return {
          ...option,
          analysis,
          validation,
          _priorityScore: getKeywordPriorityScore({ validation, analysis }),
        };
      })
    );

    const results = analyzedResults
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .map((item) => {
        const { _priorityScore, ...rest } = item;
        void _priorityScore;
        return rest;
      });

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
