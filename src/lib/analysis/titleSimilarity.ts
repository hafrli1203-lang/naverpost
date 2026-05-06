export type TitleSimilarityRisk = "low" | "medium" | "high";

export interface TitleSimilarityMatch {
  percent: number;
  risk: TitleSimilarityRisk;
  matchedTitle?: string;
  sharedTokens: string[];
  structureOverlap: boolean;
  endingOverlap: boolean;
  reason: string;
}

const TITLE_STOPWORDS = new Set([
  "기준",
  "확인",
  "방법",
  "이유",
  "차이",
  "선택",
  "관리",
  "정리",
  "보기",
  "부분",
  "때",
  "전",
  "후",
  "중",
  "부터",
  "까지",
  "좋은",
  "중요한",
]);

const ENDING_PATTERNS = [
  "걱정될 때",
  "불편할 때",
  "달라지는 이유",
  "달라지는 점",
  "봐야 하는 이유",
  "보는 기준",
  "보는 이유",
  "확인할 부분",
  "확인해야 할 때",
  "놓치기 쉬운 때",
  "중요한 이유",
  "줄이는 습관",
  "심해지는 이유",
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripParticle(token: string): string {
  return token
    .replace(/(으로부터|으로서|으로써|에게서|에서의|이라고|이라는|으로|에서|에게|에도|에만|까지|부터|처럼|보다)$/g, "")
    .replace(/(과|와|을|를|은|는|이|가|의|도|만|에)$/g, "");
}

export function tokenizeMeaningfulTitle(text: string): string[] {
  const tokens = text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawToken of tokens) {
    const token = stripParticle(rawToken.toLowerCase());
    if (token.length < 2 || TITLE_STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }

  return result;
}

function detectEndingPattern(title: string): string | null {
  return ENDING_PATTERNS.find((pattern) => title.endsWith(pattern)) ?? null;
}

function detectStructure(title: string): string {
  if (/전 .+(걱정|불편|문제)/.test(title)) return "before-concern";
  if (/(원인|증상|흐림|피로|건조|통증).+(이유|때)/.test(title)) return "symptom-reason";
  if (/(선택|고를|구입).+(차이|기준|비교)/.test(title)) return "selection-comparison";
  if (/(관리|세척|보관|교체).+(습관|손상|흠집|얼룩)/.test(title)) return "care-result";
  if (/(검사|시력|도수).+(근시|변화|진행|시기)/.test(title)) return "inspection-change";
  if (/(운전|야간|실내|업무|장시간).+(불편|답답|흐림|눈부심)/.test(title)) return "situation-problem";
  return "general";
}

function orderedOverlapRatio(sourceTokens: string[], targetTokens: string[]): number {
  const targetPositions = new Map(targetTokens.map((token, index) => [token, index]));
  const positions = sourceTokens
    .map((token) => targetPositions.get(token))
    .filter((position): position is number => typeof position === "number");
  if (positions.length < 2) return 0;

  let orderedPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      totalPairs += 1;
      if (positions[i] < positions[j]) orderedPairs += 1;
    }
  }

  return totalPairs === 0 ? 0 : orderedPairs / totalPairs;
}

function scoreTitlePair(source: string, target: string): TitleSimilarityMatch {
  const sourceNorm = normalize(source);
  const targetNorm = normalize(target);
  const sourceTokens = tokenizeMeaningfulTitle(sourceNorm);
  const targetTokens = tokenizeMeaningfulTitle(targetNorm);
  const targetSet = new Set(targetTokens);
  const sharedTokens = sourceTokens.filter((token) => targetSet.has(token));
  const unionSize = new Set([...sourceTokens, ...targetTokens]).size;
  const jaccard = unionSize === 0 ? 0 : sharedTokens.length / unionSize;
  const containment = sharedTokens.length / Math.max(1, Math.min(sourceTokens.length, targetTokens.length));
  const order = orderedOverlapRatio(sourceTokens, targetTokens);

  const sourceStructure = detectStructure(sourceNorm);
  const targetStructure = detectStructure(targetNorm);
  const structureOverlap = sourceStructure !== "general" && sourceStructure === targetStructure;
  const endingOverlap = Boolean(
    detectEndingPattern(sourceNorm) && detectEndingPattern(sourceNorm) === detectEndingPattern(targetNorm)
  );

  let score =
    jaccard * 42 +
    containment * 33 +
    order * 10 +
    (structureOverlap ? 10 : 0) +
    (endingOverlap ? 5 : 0);

  if (sourceNorm === targetNorm) score = 100;
  score = Math.min(100, Math.round(score));

  const risk: TitleSimilarityRisk = score >= 65 ? "high" : score >= 42 ? "medium" : "low";
  const reason =
    risk === "high"
      ? "핵심 단어와 제목 구조가 함께 겹칩니다."
      : risk === "medium"
      ? "핵심 단어 일부 또는 제목 구조가 겹칩니다."
      : "상위 제목과 강한 중복 신호는 낮습니다.";

  return {
    percent: score,
    risk,
    matchedTitle: target,
    sharedTokens,
    structureOverlap,
    endingOverlap,
    reason,
  };
}

export function analyzeTitleSimilarity(
  title: string,
  targets: string[]
): TitleSimilarityMatch {
  if (targets.length === 0) {
    return {
      percent: 0,
      risk: "low",
      sharedTokens: [],
      structureOverlap: false,
      endingOverlap: false,
      reason: "비교할 상위 제목이 없습니다.",
    };
  }

  return targets
    .map((target) => scoreTitlePair(title, target))
    .sort((a, b) => b.percent - a.percent)[0];
}
