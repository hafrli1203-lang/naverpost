import type {
  AnalysisIssue,
  MorphologyAnalysis,
  MorphemeStat,
} from "@/types";
import { extractContentNouns } from "@/lib/nlp/nounExtractor";

const TOKEN_REGEX = /[가-힣A-Za-z0-9]{2,}/g;
const STOPWORDS = new Set([
  "그리고",
  "하지만",
  "또한",
  "정리",
  "이번",
  "관련",
  "정도",
  "부분",
  "내용",
  "설명",
  "소개",
  "정보",
  "가이드",
  "경우",
  "사용",
  "기준",
  "위해",
  "대한",
  "에서",
  "입니다",
  "있습니다",
  "합니다",
  "되는",
  "하는",
  "으로",
  "까지",
  "이런",
  "저런",
]);

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function extractSurfaceTokens(text: string): string[] {
  const raw = text.match(TOKEN_REGEX) ?? [];
  return raw
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function buildRepeatedStats(tokens: string[], minCount = 2): MorphemeStat[] {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([token, count]) => ({
      token,
      count,
      source: "body" as const,
    }));
}

function buildAvailabilityIssue(): AnalysisIssue {
  return {
    code: "morphology-engine-unavailable",
    label: "형태소 엔진 부재",
    reason:
      "현재 저장소에는 한국어 형태소 분석 엔진이 없어, 문서 기준의 실제 형태소 대신 유의미 표면 토큰 기준으로 분석했습니다.",
    severity: "medium",
    source: "local-content",
  };
}

function buildHaikuFallbackIssue(reason: string): AnalysisIssue {
  return {
    code: "morphology-haiku-fallback",
    label: "형태소 분석 폴백",
    reason: `Haiku 명사 추출 실패로 표면 토큰 분석으로 대체했습니다: ${reason}`,
    severity: "low",
    source: "local-content",
  };
}

export function analyzeMorphology(params: {
  title: string;
  content: string;
  keywords?: string[];
}): MorphologyAnalysis {
  const titleTokens = extractSurfaceTokens(params.title);
  const bodyTokens = extractSurfaceTokens(params.content);
  const repeatedBodyMorphemes = buildRepeatedStats(bodyTokens, 2);
  const bodyTokenSet = new Set(bodyTokens);
  const titleTokenSet = Array.from(new Set(titleTokens));
  const titleMorphemesActivatedInBody = titleTokenSet.filter((token) =>
    bodyTokenSet.has(token)
  );
  const missingTitleMorphemesInBody = titleTokenSet.filter(
    (token) => !bodyTokenSet.has(token)
  );
  const uniqueBodyMorphemeCount = new Set(bodyTokens).size;
  const topicAlignmentNotes: string[] = [];
  const issues: AnalysisIssue[] = [buildAvailabilityIssue()];

  const keywords = (params.keywords ?? [])
    .flatMap((keyword) => extractSurfaceTokens(keyword))
    .filter(Boolean);

  if (keywords.length > 0) {
    const missingKeywordTokens = Array.from(new Set(keywords)).filter(
      (token) => !bodyTokenSet.has(token)
    );
    if (missingKeywordTokens.length > 0) {
      issues.push({
        code: "keyword-token-missing-in-body",
        label: "키워드 토큰 미활성화",
        reason: `본문에서 활성화되지 않은 목표 토큰: ${missingKeywordTokens.join(", ")}`,
        severity: "high",
        source: "local-content",
      });
    } else {
      topicAlignmentNotes.push(
        "제목 및 목표 키워드의 유의미 토큰이 본문에서 모두 확인됩니다."
      );
    }
  }

  if (uniqueBodyMorphemeCount < 30) {
    issues.push({
      code: "low-body-token-variety",
      label: "본문 정보 다양성 부족",
      reason:
        "본문의 유의미 토큰 종류 수가 낮아 문서 기준의 정보량 부족 가능성이 있습니다.",
      severity: "medium",
      source: "local-content",
    });
  }

  if (repeatedBodyMorphemes.length > 0 && repeatedBodyMorphemes[0].count >= 8) {
    issues.push({
      code: "high-token-repetition",
      label: "본문 반복 토큰 과다",
      reason: `반복 수가 높은 토큰이 있습니다: ${repeatedBodyMorphemes[0].token}(${repeatedBodyMorphemes[0].count})`,
      severity: "medium",
      source: "local-content",
    });
  }

  return {
    titleMorphemes: titleTokenSet,
    repeatedBodyMorphemes,
    uniqueBodyMorphemeCount,
    titleMorphemesActivatedInBody,
    missingTitleMorphemesInBody,
    topicAlignmentNotes,
    issues,
  };
}

export async function analyzeMorphologyAsync(params: {
  title: string;
  content: string;
  keywords?: string[];
}): Promise<MorphologyAnalysis> {
  let titleNouns: string[];
  let bodyNounEntries: Array<{ noun: string; count: number }>;
  let keywordNouns: string[];

  try {
    const [titleResult, bodyResult, keywordResult] = await Promise.all([
      extractContentNouns(params.title),
      extractContentNouns(params.content),
      params.keywords && params.keywords.length > 0
        ? extractContentNouns(params.keywords.join(" "))
        : Promise.resolve([]),
    ]);
    titleNouns = titleResult.map((entry) => entry.noun);
    bodyNounEntries = bodyResult;
    keywordNouns = keywordResult.map((entry) => entry.noun);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    const fallback = analyzeMorphology(params);
    return {
      ...fallback,
      issues: [...fallback.issues, buildHaikuFallbackIssue(reason)],
    };
  }

  const bodyNounSet = new Set(bodyNounEntries.map((entry) => entry.noun));
  const titleNounSet = Array.from(new Set(titleNouns));
  const titleMorphemesActivatedInBody = titleNounSet.filter((noun) =>
    bodyNounSet.has(noun)
  );
  const missingTitleMorphemesInBody = titleNounSet.filter(
    (noun) => !bodyNounSet.has(noun)
  );
  const uniqueBodyMorphemeCount = bodyNounSet.size;
  const repeatedBodyMorphemes: MorphemeStat[] = bodyNounEntries
    .filter((entry) => entry.count >= 2)
    .map((entry) => ({
      token: entry.noun,
      count: entry.count,
      source: "body" as const,
    }));

  const topicAlignmentNotes: string[] = [];
  const issues: AnalysisIssue[] = [];

  if (keywordNouns.length > 0) {
    const missingKeywordNouns = Array.from(new Set(keywordNouns)).filter(
      (noun) => !bodyNounSet.has(noun)
    );
    if (missingKeywordNouns.length > 0) {
      issues.push({
        code: "keyword-token-missing-in-body",
        label: "키워드 명사 미활성화",
        reason: `본문에서 활성화되지 않은 목표 명사: ${missingKeywordNouns.join(", ")}`,
        severity: "high",
        source: "local-content",
      });
    } else {
      topicAlignmentNotes.push(
        "제목 및 목표 키워드의 명사가 본문에서 모두 확인됩니다."
      );
    }
  }

  if (uniqueBodyMorphemeCount < 30) {
    issues.push({
      code: "low-body-token-variety",
      label: "본문 정보 다양성 부족",
      reason:
        "본문의 명사 종류 수가 낮아 정보량 부족 가능성이 있습니다.",
      severity: "medium",
      source: "local-content",
    });
  }

  if (repeatedBodyMorphemes.length > 0 && repeatedBodyMorphemes[0].count >= 8) {
    issues.push({
      code: "high-token-repetition",
      label: "본문 반복 명사 과다",
      reason: `반복 수가 높은 명사가 있습니다: ${repeatedBodyMorphemes[0].token}(${repeatedBodyMorphemes[0].count})`,
      severity: "medium",
      source: "local-content",
    });
  }

  return {
    titleMorphemes: titleNounSet,
    repeatedBodyMorphemes,
    uniqueBodyMorphemeCount,
    titleMorphemesActivatedInBody,
    missingTitleMorphemesInBody,
    topicAlignmentNotes,
    issues,
  };
}
