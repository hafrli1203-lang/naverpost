import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { generateKeywords } from "@/lib/ai/claude";
import { generateKeywordCandidatesWithGpt } from "@/lib/ai/openaiKeywords";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import {
  fetchCompetitorTitles,
  fetchKeywordDemandSignals,
  fetchKeywordOpportunitySignals,
  getExternalSearchSignals,
  NaverSearchDependencyError,
} from "@/lib/naver/searchSignals";
import {
  buildKeywordDiscoverySeeds,
  buildKeywordStrategyGuide,
  inferShopRegion,
} from "@/lib/keywords/seasonalStrategy";
import { inferSmartBlockSubKeywords } from "@/lib/analysis/smartBlock";
import { analyzeTitleSimilarity } from "@/lib/analysis/titleSimilarity";
import { combineKeywords } from "@/lib/keywords/keywordCombiner";
import {
  buildKeywordMeshOptions,
  buildKeywordMeshSeeds,
} from "@/lib/keywords/keywordMesh";
import {
  buildProductKeywordOptions,
  getProductModifiers,
  getProductModifiersByHead,
  getShopProductHeads,
} from "@/lib/keywords/productKeywordCatalog";
import { applyVolumeGate, type VolumeGateFields } from "@/lib/keywords/volumeGate";
import {
  MECHANICAL_TITLE_PATTERNS,
  NAVER_TITLE_SKILL_RULES,
} from "@/lib/keywords/naverTitleSkill";
import { buildTitleGenerationPrompt } from "@/lib/prompts/titlePrompt";
import { listSessions } from "@/lib/storage/sessionStore";
import { planBlogTopic } from "@/lib/topics/topicPlanner";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { analyzeNetworkDuplicateRisk } from "@/lib/validation/networkDuplicateAnalyzer";
import { validateKeywordOption } from "@/lib/validation/keywordRules";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import type { KeywordOption, KeywordOptionAnalysis, SearchVolumeSignal } from "@/types";

export const maxDuration = 360;
const TARGET_RESULT_COUNT = 10;
const KEYWORD_FAST_MODE = process.env.KEYWORD_FAST_MODE !== "0";
const KEYWORD_AI_EXPANSION_ENABLED =
  process.env.KEYWORD_AI_EXPANSION === "1" || !KEYWORD_FAST_MODE;
const EXTERNAL_SIGNAL_TOP_K = Math.max(
  0,
  Number(
    process.env.KEYWORD_EXTERNAL_SIGNAL_TOP_K ??
      (KEYWORD_FAST_MODE ? "3" : String(TARGET_RESULT_COUNT))
  ) || (KEYWORD_FAST_MODE ? 3 : TARGET_RESULT_COUNT)
);
const SMART_BLOCK_TOP_K = Math.max(
  0,
  Number(
    process.env.KEYWORD_SMART_BLOCK_TOP_K ??
      (KEYWORD_FAST_MODE ? "3" : String(TARGET_RESULT_COUNT))
  ) || (KEYWORD_FAST_MODE ? 3 : TARGET_RESULT_COUNT)
);
const KEYWORD_FIRST_EDIT_TIMEOUT_MS = 70_000;
const KEYWORD_REPAIR_TIMEOUT_MS = 90_000;
const KEYWORD_RETRY_TIMEOUT_MS = 90_000;
const KEYWORD_RESULT_CACHE_ENABLED = process.env.KEYWORD_RESULT_CACHE !== "0";
const KEYWORD_RESULT_CACHE_VERSION = 6;
const KEYWORD_RESULT_CACHE_FILE = path.join(process.cwd(), "data", "keyword-result-cache.json");

type KeywordResultResponseData = {
  results: unknown[];
  notes: string[];
  topic: string;
  topicLabel: string;
  topicPlan: unknown;
};

type KeywordResultCacheEntry = {
  checkedAt: string;
  data: KeywordResultResponseData;
};

type KeywordResultCacheFile = {
  version: number;
  months: Record<string, Record<string, KeywordResultCacheEntry>>;
};

let keywordResultCache: KeywordResultCacheFile | null = null;

function getKeywordResultCacheMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function emptyKeywordResultCache(): KeywordResultCacheFile {
  return {
    version: KEYWORD_RESULT_CACHE_VERSION,
    months: {},
  };
}

function normalizeKeywordResultCachePart(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function buildKeywordResultCacheKey(params: {
  shopId: string;
  categoryId: string;
  topic?: string;
}): string {
  return [
    `shop=${normalizeKeywordResultCachePart(params.shopId)}`,
    `category=${normalizeKeywordResultCachePart(params.categoryId)}`,
    `topic=${normalizeKeywordResultCachePart(params.topic)}`,
    `fast=${KEYWORD_FAST_MODE ? "1" : "0"}`,
    `external=${EXTERNAL_SIGNAL_TOP_K}`,
    `smart=${SMART_BLOCK_TOP_K}`,
  ].join("|");
}

async function readKeywordResultCache(): Promise<KeywordResultCacheFile> {
  if (keywordResultCache) return keywordResultCache;

  try {
    const raw = await fs.readFile(KEYWORD_RESULT_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as KeywordResultCacheFile;
    keywordResultCache =
      parsed && parsed.version === KEYWORD_RESULT_CACHE_VERSION && parsed.months
        ? parsed
        : emptyKeywordResultCache();
  } catch {
    keywordResultCache = emptyKeywordResultCache();
  }

  return keywordResultCache;
}

async function getCachedKeywordResultData(
  key: string,
  month = getKeywordResultCacheMonth()
): Promise<KeywordResultCacheEntry | null> {
  if (!KEYWORD_RESULT_CACHE_ENABLED) return null;
  const cache = await readKeywordResultCache();
  return cache.months[month]?.[key] ?? null;
}

async function saveKeywordResultData(
  key: string,
  data: KeywordResultResponseData,
  month = getKeywordResultCacheMonth()
): Promise<void> {
  if (!KEYWORD_RESULT_CACHE_ENABLED) return;
  const cache = await readKeywordResultCache();
  const monthCache = cache.months[month] ?? {};
  monthCache[key] = {
    checkedAt: new Date().toISOString(),
    data,
  };
  cache.months[month] = monthCache;

  try {
    await fs.mkdir(path.dirname(KEYWORD_RESULT_CACHE_FILE), { recursive: true });
    await fs.writeFile(KEYWORD_RESULT_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    keywordResultCache = cache;
  } catch {
    // Cache writes must never block keyword generation.
  }
}

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


const MATERIAL_GROUPS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "price", patterns: [/가격/, /비용/, /얼마/, /등급/, /차이/] },
  { label: "first-fit", patterns: [/처음/, /맞추기/, /상담 전/, /체크/, /확인/] },
  { label: "adaptation", patterns: [/적응/, /적용/, /울렁/, /어지러/, /불편/, /실패/] },
  { label: "comparison", patterns: [/비교/, /돋보기/, /무엇/, /선택/] },
  { label: "target", patterns: [/40대/, /50대/, /부모님/, /중년/, /노안/, /시력검사 전/, /시야 확인/] },
  { label: "driving", patterns: [/운전/, /야간/, /시야/] },
  { label: "office", patterns: [/업무/, /독서/, /사무/, /실내/, /컴퓨터/] },
  { label: "care", patterns: [/관리/, /보관/, /세척/, /착용/] },
];

type IntentBucket =
  | "regional"
  | "seasonal"
  | "problem"
  | "selection"
  | "situation"
  | "inspection"
  | "general";

const INTENT_BUCKET_QUOTAS: Array<{ bucket: IntentBucket; min: number }> = [
  { bucket: "seasonal", min: 1 },
  { bucket: "problem", min: 2 },
  { bucket: "selection", min: 2 },
  { bucket: "situation", min: 2 },
  { bucket: "inspection", min: 1 },
];

const INTENT_DISPLAY_ORDER: IntentBucket[] = [
  "problem",
  "selection",
  "situation",
  "inspection",
  "seasonal",
  "regional",
  "general",
];

function inferMaterialGroup(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const matched = MATERIAL_GROUPS.find((group) =>
    group.patterns.some((pattern) => pattern.test(source))
  );
  if (matched) return matched.label;

  const keywordTail = option.mainKeyword.trim().split(/\s+/)[1];
  if (keywordTail) return keywordTail;

  return tokenizeTitleForComparison(option.title).slice(0, 2).join("-");
}

function inferSpecificMaterialGroup(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/가벼운안경|무게|경량/.test(source)) return "lightweight-frame";
  if (/얼굴형|얼굴폭|사이즈|브릿지/.test(source)) return "frame-sizing";
  if (/티타늄|베타티타늄/.test(source)) return "titanium-frame";
  if (/울템/.test(source)) return "ultem-frame";
  if (/뿔테/.test(source)) return "plastic-frame";
  if (/하금테/.test(source)) return "browline-frame";
  if (/금속테|메탈/.test(source)) return "metal-frame";
  if (/무테|반무테/.test(source)) return "rimless-frame";
  if (/안경닦이|닦이|수건/.test(source)) return "lens-cloth";
  if (/힌지|경첩/.test(source)) return "hinge";
  if (/고무팁|귀팁|팁 교체/.test(source)) return "temple-tip";
  if (/물자국|물기/.test(source)) return "water-mark";
  if (/뒤틀림|틀어짐/.test(source)) return "alignment";
  if (/나사|조임|풀림/.test(source)) return "screw";
  if (/안경수리|말기기|파손/.test(source)) return "repair";
  if (/코받침|코패드|자국/.test(source)) return "nose-pad";
  if (/안경보관|보관|케이스/.test(source)) return "storage";
  if (/안경렌즈 코팅|코팅/.test(source)) return "coating";
  if (/안경세척|렌즈세척|얼룩/.test(source)) return "cleaning";
  if (/착용감|귀통증|눌림/.test(source)) return "comfort";
  if (/안경흘러내림|흘러내림|피팅|조정|균형/.test(source)) return "fitting";
  if (/안경김서림|김서림|습기|마스크/.test(source)) return "fogging";
  if (/스크래치|흠집/.test(source)) return "scratch";
  if (/안경테|테 변형|소재/.test(source)) return "frame-care";

  return inferMaterialGroup(option);
}

function inferContentThemeFromText(source: string): string {
  if (/렌즈건조|건조감|건조|장시간렌즈/.test(source)) return "contact-lens-dryness";
  if (/렌즈충혈|눈충혈|충혈|이물감/.test(source)) return "contact-lens-irritation";
  if (/렌즈검사|콘택트렌즈 검사|난시렌즈 검사|시력|도수|검사/.test(source)) {
    return "contact-lens-exam";
  }
  if (/난시렌즈|난시/.test(source)) return "contact-lens-astigmatism";
  if (/멀티포컬렌즈|멀티포컬|다초점/.test(source)) return "contact-lens-multifocal";
  if (/컬러렌즈|컬러/.test(source)) return "contact-lens-color";
  if (/원데이렌즈|원데이|교체 주기|렌즈교체/.test(source)) return "contact-lens-replacement";
  if (/렌즈세척|렌즈보관|렌즈관리|렌즈케이스|하드렌즈 관리|하드렌즈 보관|하드렌즈 세척|위생|세척|보관|케이스/.test(source)) {
    return "contact-lens-care";
  }
  if (/소프트렌즈|하드렌즈|착용시간|렌즈착용|착용/.test(source)) return "contact-lens-wearing";
  if (/렌즈/.test(source)) return "contact-lens-general";

  if (/안경김서림|김서림/.test(source)) return "glasses-fogging";
  if (/안경세척|안경관리|안경보관|안경닦이|스크래치|흠집|얼룩/.test(source)) {
    return "glasses-care";
  }
  if (/안경피팅|흘러내림|코패드|코받침|귀통증|착용감/.test(source)) {
    return "glasses-fitting";
  }
  if (/티타늄|울템|뿔테|메탈|하금테|무테|반무테|소재|얼굴형/.test(source)) {
    return "frame-selection";
  }
  if (/누진|다초점|노안|돋보기/.test(source)) return "progressive-lens";
  if (/블루라이트|변색|자외선|압축|고굴절|코팅/.test(source)) return "lens-selection";
  if (/눈피로|안구건조|눈초점|시력저하|야간시력/.test(source)) return "eye-symptom";

  return inferMaterialGroup({
    title: source,
    mainKeyword: source,
    subKeyword1: "",
    subKeyword2: "",
  });
}

function inferContentTheme(option: KeywordOption): string {
  const primaryTheme = inferContentThemeFromText(`${option.title} ${option.mainKeyword}`);
  if (!/general$/.test(primaryTheme)) return primaryTheme;
  return inferContentThemeFromText(
    `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`
  );
}

function countHistoryThemeOverlap(option: KeywordOption, history: string[]): number {
  const theme = inferContentTheme(option);
  if (!theme) return 0;
  return history.filter((title) => inferContentThemeFromText(title) === theme).length;
}

function inferIntentBucket(option: KeywordOption): IntentBucket {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/가정의달|가정의 달|부모님|어버이|새학기|개학|봄|여름|가을|겨울|자외선|변색|김서림|환절기|연말/.test(source)) {
    return "seasonal";
  }
  if (/안경점|안경원|지역|방문/.test(source)) {
    return "regional";
  }
  if (/울렁|어지러|불편|실패|건조|충혈|흘러내림|초점|김서림|통증|흐림/.test(source)) {
    return "problem";
  }
  if (/선택|차이|비교|등급|고를|맞춤|소재|두께|압축|코팅/.test(source)) {
    return "selection";
  }
  if (/운전|야간|업무|실내|사무|독서|컴퓨터|장시간|착용|생활/.test(source)) {
    return "situation";
  }
  if (/검사|도수|시력|관리|세척|보관|교체|확인|기준/.test(source)) {
    return "inspection";
  }
  return "general";
}

function hasSameMaterial(a: KeywordOption, b: KeywordOption): boolean {
  const aMaterial = inferMaterialGroup(a);
  const bMaterial = inferMaterialGroup(b);
  return aMaterial.length > 0 && aMaterial === bMaterial;
}

function hasSameKeywordCombination(a: KeywordOption, b: KeywordOption): boolean {
  if (a.mainKeyword !== b.mainKeyword) return false;
  const aSubs = [a.subKeyword1, a.subKeyword2].sort().join("|");
  const bSubs = [b.subKeyword1, b.subKeyword2].sort().join("|");
  return aSubs === bSubs;
}

function inferMainKeywordAxis(option: KeywordOption): string {
  const main = splitKeyword(option.mainKeyword);
  if (!main) return option.mainKeyword.trim();

  const [head, core] = main;
  if (isRegionWord(head)) {
    return core;
  }
  return head;
}

function isRegionWord(word: string): boolean {
  return /^(장림|장림시장|공주|신관|장유|김해|충남대|궁동|심곡|진해|서면|둔산|유성|부산|대전|서울|인천|대구|광주|울산|수원|창원)/.test(word);
}

function startsWithRegionWord(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return isRegionWord(first);
}

function isTooSimilarTitle(a: KeywordOption, b: KeywordOption): boolean {
  const similarity = calculateTitleSimilarity(a.title, b.title);
  if (similarity >= 0.72) return true;
  if (similarity >= 0.48 && hasSameMaterial(a, b)) return true;

  const sameMainKeyword = a.mainKeyword.trim() === b.mainKeyword.trim();
  const sameSubKeyword1 = a.subKeyword1.trim() === b.subKeyword1.trim();
  const sameSubKeyword2 = a.subKeyword2.trim() === b.subKeyword2.trim();

  const aSource = `${a.title} ${a.mainKeyword} ${a.subKeyword1} ${a.subKeyword2}`;
  const bSource = `${b.title} ${b.mainKeyword} ${b.subKeyword1} ${b.subKeyword2}`;
  const bothRegionalParentPresbyopia =
    /장유|김해|충남대|공주|장림|진해|심곡/.test(aSource) &&
    /장유|김해|충남대|공주|장림|진해|심곡/.test(bSource) &&
    /부모님|노안안경|노안렌즈/.test(aSource) &&
    /부모님|노안안경|노안렌즈/.test(bSource);
  if (bothRegionalParentPresbyopia) return true;

  return sameMainKeyword && sameSubKeyword1 && sameSubKeyword2;
}

const COMMON_TITLE_WORDS = new Set([
  "기준",
  "부분",
  "확인",
  "확인할",
  "살펴볼",
  "알아볼",
  "보기",
  "전에",
  "먼저",
  "때",
  "경우",
  "이유",
  "차이",
  "차이로",
  "과정",
  "선택",
  "고를",
  "보는",
  "것",
  "점",
  "방법",
  "다른",
  "대신",
  "정도",
  "걱정",
  "불편",
  "반복",
  "줄지",
  "않을",
  "남는",
  "심할",
  "심한",
  "불편할",
  "줄이려",
  "줄이는",
  "보는",
  "봐야",
  "살펴볼",
  "중심",
  "파악",
  "파악하기",
  "필요한",
  "달라지는",
]);

const DEFAULT_CORES_BY_HEAD: Record<string, string[]> = {
  누진렌즈: ["울렁임", "적응", "시야", "원인", "운전", "도수"],
  누진다초점: ["적응", "시야", "울렁임", "도수", "검사", "렌즈"],
  다초점렌즈: ["적응", "시야", "울렁임", "운전", "도수", "검사"],
  노안안경: ["돋보기", "시야", "도수", "착용감", "검사", "선택"],
  안경렌즈: ["두께", "압축", "코팅", "도수", "교체", "시야"],
  렌즈교체: ["시기", "코팅", "도수", "두께", "검사", "상태"],
  블루라이트렌즈: ["코팅", "눈피로", "차단", "도수", "착용감", "선택"],
  근시억제렌즈: ["어린이", "검사", "도수", "착용감", "관리", "시기"],
  근시완화렌즈: ["어린이", "검사", "도수", "착용감", "관리", "시기"],
  안경테: ["소재", "무게", "피팅", "착용감", "디자인", "관리"],
  안경피팅: ["코패드", "착용감", "흘러내림", "귀통증", "조정", "균형"],
  가벼운안경: ["소재", "착용감", "무게", "코패드", "피팅", "테"],
  콘택트렌즈: ["건조", "착용", "충혈", "관리", "난시", "검사"],
  원데이렌즈: ["착용", "건조", "난시", "관리", "검사", "시야"],
  렌즈건조: ["착용", "관리", "충혈", "눈피로", "시간", "원인"],
  안구건조: ["증상", "관리", "눈피로", "렌즈", "검사", "습관"],
  눈초점: ["흐림", "피로", "검사", "시야", "도수", "원인"],
  시력검사: ["도수", "시기", "어린이", "노안", "난시", "근시"],
  어린이시력: ["검사", "근시", "관리", "도수", "습관", "렌즈"],
  안경김서림: ["렌즈", "관리", "마스크", "코팅", "습기", "세척"],
  안경세척: ["렌즈", "코팅", "방법", "관리", "얼룩", "습관"],
  안경수리: ["나사", "테", "코받침", "파손", "흘러내림", "착용감"],
};

function getCompetitionScore(label?: string): number {
  if (!label) return 0;
  if (/낮|low/i.test(label)) return 18;
  if (/중|medium/i.test(label)) return 8;
  if (/높|high/i.test(label)) return -18;
  return 0;
}

function getMonthlyDemandScore(total?: number | null): number {
  if (!total || total <= 0) return 0;
  if (total <= 10) return 2;
  if (total <= 100) return 18;
  if (total <= 1000) return 25;
  if (total <= 3000) return 22;
  if (total <= 10000) return 10;
  return -8;
}

function getDemandSignalScore(signal: SearchVolumeSignal): number {
  const opportunityScore =
    typeof signal.opportunityScore === "number"
      ? Math.round(signal.opportunityScore / 2)
      : 0;
  const seasonalScore =
    signal.seasonalFit === "high" ? 10 : signal.seasonalFit === "medium" ? 4 : 0;
  const blogCompetitionPenalty =
    typeof signal.competitionRatio === "number" && signal.competitionRatio > 30
      ? -18
      : 0;
  return (
    getMonthlyDemandScore(signal.monthlyTotalSearches) +
    getCompetitionScore(signal.competitionLabel) +
    opportunityScore +
    seasonalScore +
    blogCompetitionPenalty
  );
}

function splitKeyword(keyword: string): [string, string] | null {
  const parts = keyword.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

function inferRegionFromShopName(shopName: string): string {
  return (
    shopName
      .replace(/으뜸50안경|지니스안경|안경원|안경|점/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")[0] || shopName
  );
}

function extractTitleCoreWords(title: string): string[] {
  const words = title.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  return words
    .map((word) => stripKoreanParticle(word.trim()))
    .filter((word) => word.length >= 2 && isUsableKeywordCore(word));
}

function stripKoreanParticle(word: string): string {
  if (word === "어린이") return word;
  if (word === "차이로") return "차이";
  return word
    .replace(/(으로|부터|까지|처럼|보다|에서)$/g, "")
    .replace(/(과|와|을|를|은|는|이|가|의)$/g, "");
}

function getFallbackCores(head: string, source: string): string[] {
  const direct = DEFAULT_CORES_BY_HEAD[head] ?? [];
  if (/안경점|안경$/.test(source)) {
    return [...direct, "안경렌즈", "안경테", "시력검사", "피팅", "착용감"];
  }
  return direct;
}

function uniqueCores(cores: string[], mainCore: string): string[] {
  const seen = new Set<string>([mainCore]);
  return cores
    .map((core) =>
      normalizeKeywordCore(stripKoreanParticle(core.replace(/[^\uAC00-\uD7A3A-Za-z0-9]/g, "").trim()))
    )
    .filter((core) => core.length >= 2 && isUsableKeywordCore(core))
    .filter((core) => {
      if (seen.has(core)) return false;
      seen.add(core);
      return true;
    });
}

function normalizeKeywordCore(core: string): string {
  return core
    .replace(/^안경(?=소재|무게|착용감|코패드|피팅|나사|렌즈|테|관리|보관|세척|수리)/, "")
    .trim();
}

function isUsableKeywordCore(core: string): boolean {
  if (COMMON_TITLE_WORDS.has(core)) return false;
  if (/산소투$|자외$|시력검$/.test(core)) return false;
  return !/(할|하려|하려고|줄이려|줄이는|남을|남는|심할|심한|되는|될)$/.test(core);
}

function pickKeywordCores(option: KeywordOption): [string, string] {
  const main = splitKeyword(option.mainKeyword);
  const head = main?.[0] ?? option.mainKeyword.trim().split(/\s+/)[0] ?? "";
  const mainCore = main?.[1] ?? "";
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const subCores = [splitKeyword(option.subKeyword1)?.[1], splitKeyword(option.subKeyword2)?.[1]]
    .map((core) => (core ? normalizeKeywordCore(core) : core))
    .filter((core): core is string => {
      if (!core) return false;
      if (
        core === "원인" &&
        !/원인|증상|흐림|건조|충혈|피로|불편|흘러내림|통증/.test(mainCore)
      ) {
        return false;
      }
      return true;
    });
  const titleCores = extractTitleCoreWords(option.title).filter(
    (word) =>
      word !== head &&
      word !== mainCore &&
      !head.includes(word) &&
      !option.mainKeyword.includes(word)
  );
  const cores = uniqueCores(
    [...subCores, ...titleCores, ...getFallbackCores(head, source), "원인", "기준", "관리"],
    mainCore
  );

  return [cores[0] ?? "원인", cores[1] ?? "관리"];
}

function hasFinalConsonant(word: string): boolean {
  const char = word.charCodeAt(word.length - 1);
  if (char < 0xac00 || char > 0xd7a3) return false;
  return (char - 0xac00) % 28 !== 0;
}

function joinCores(core1: string, core2: string): string {
  const particle = hasFinalConsonant(core1) ? "과" : "와";
  return `${core1}${particle} ${core2}`;
}

function makeSubjectPhrase(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "이" : "가"}`;
}

function pickConcernCore(core1: string, core2: string): string {
  const concernPattern = /눈피로|눈부심|흐림|건조|충혈|야간|자외선|통증|흘러내림|울렁임|어지러움/;
  if (concernPattern.test(core1)) return core1;
  if (concernPattern.test(core2)) return core2;
  return core1;
}

function getTitleContext(mainCore: string): string {
  if (/착용|적응|운전|사용/.test(mainCore)) return "중";
  if (/선택|교체|구입|검사|수리/.test(mainCore)) return "전";
  if (/관리|세척|보관|조정|피팅|방법/.test(mainCore)) return "에서";
  if (/원인|증상|흐림|건조|충혈|피로|불편/.test(mainCore)) return "때";
  return "";
}

function joinMainWithContext(mainKeyword: string, context: string): string {
  if (context === "에서") {
    if (/방법$/.test(mainKeyword)) return mainKeyword;
    return `${mainKeyword}할 때`;
  }
  if (context === "때") return mainKeyword;
  return `${mainKeyword} ${context}`;
}

function composeRegionalTitle(mainKeyword: string, core1: string, core2: string): string | null {
  void mainKeyword;
  void core1;
  void core2;
  return null;
}

/**
 * @deprecated 더 이상 호출되지 않는다. 과거에는 LLM 제목을 템플릿 문자열로 덮어쓰는
 * 용도였으나, 이 기계적 조립이 부자연스러운 제목의 원인이었다. 이제 LLM 제목을
 * 그대로 신뢰하고 normalizeGeneratedOptions에서 드롭만 한다. 안전하게 삭제 가능.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function composeAlignedTitle(params: {
  mainKeyword: string;
  core1: string;
  core2: string;
  index: number;
}): string {
  const { mainKeyword, core1, core2, index } = params;
  const mainCore = splitKeyword(mainKeyword)?.[1] ?? "";
  const source = `${mainKeyword} ${core1} ${core2}`;
  const regionalTitle = composeRegionalTitle(mainKeyword, core1, core2);
  if (
    regionalTitle &&
    regionalTitle.includes(core1) &&
    regionalTitle.includes(core2)
  ) {
    return regionalTitle;
  }

  const situationalTemplates = /적응|착용|운전|사용/.test(mainCore)
    ? [
        `${mainKeyword} 중 ${makeSubjectPhrase(core1)} 불편할 때`,
        `${mainKeyword} 중 ${core1} 때문에 어려울 때`,
      ]
    : [];
  const problemTemplates = /원인|증상|흐림|건조|충혈|피로|불편/.test(mainCore)
    ? [
        `${mainKeyword} ${core1}부터 봐야 하는 이유`,
        `${mainKeyword} ${makeSubjectPhrase(core1)} 반복되는 이유`,
        `${mainKeyword} ${core2}까지 살펴봐야 할 때`,
      ]
    : [];
  const selectionTemplates = /선택|고르|구입/.test(mainCore)
    ? [
        /눈피로|눈부심|흐림|건조|충혈|야간|자외선/.test(source)
          ? `${mainKeyword} 전 ${makeSubjectPhrase(pickConcernCore(core1, core2))} 걱정될 때`
          : `${mainKeyword} 전 ${core1} 차이`,
        `${mainKeyword}할 때 ${core1}부터 볼 부분`,
      ]
    : [];
  const inspectionTemplates = /검사|시력|도수/.test(mainCore)
    ? [
        /도수/.test(source)
          ? `${mainKeyword} 전 도수 변화가 걱정될 때`
          : /어린이|근시|청소년/.test(source)
          ? `${mainKeyword} 근시가 걱정될 때`
          : `${mainKeyword} 전에 ${core1}부터 볼 때`,
        `${mainKeyword} 후 ${core1} 변화가 남을 때`,
      ]
    : [];
  const careTemplates = /관리|세척|보관|교체|수리/.test(mainCore)
    ? [
        `${mainKeyword}할 때 ${core1}부터 볼 부분`,
        `${mainKeyword} 전 ${core1}이 달라질 때`,
      ]
    : [];
  const context = getTitleContext(mainCore);
  const contextBase = context ? joinMainWithContext(mainKeyword, context) : "";
  const contextualTemplates = context
    ? [
        `${contextBase} ${joinCores(core1, core2)}`,
        `${contextBase} ${core1}부터 볼 부분`,
      ]
    : [];
  const fallbackTemplates = [
    `${mainKeyword} ${joinCores(core1, core2)}를 구분할 때`,
    `${mainKeyword} ${makeSubjectPhrase(core1)} 중요한 이유`,
    `${mainKeyword} ${core2} 때문에 불편할 때`,
    `${mainKeyword} ${joinCores(core1, core2)}를 나눠 볼 때`,
    `${mainKeyword} ${core1} 신호가 보일 때`,
    `${mainKeyword} ${core2}를 확인해야 할 때`,
    `${mainKeyword} 불편이 오래 남을 때`,
    `${mainKeyword} 관리에서 놓치기 쉬운 부분`,
    `${mainKeyword} 생활에서 불편한 이유`,
    ...situationalTemplates,
  ];
  const rotatedFallbacks = fallbackTemplates
    .slice(index % fallbackTemplates.length)
    .concat(fallbackTemplates);
  const preferred = [
    ...problemTemplates,
    ...selectionTemplates,
    ...inspectionTemplates,
    ...careTemplates,
    ...contextualTemplates,
    ...rotatedFallbacks,
  ];
  return (
    preferred.find(
      (title) =>
        title.length >= 15 &&
        title.length <= 30 &&
        (title.includes(core1) || title.includes(core2))
    ) ??
    `${mainKeyword} ${core1} ${core2}`.slice(0, 30)
  );
}

function getSeasonalFallbackOptions(params: {
  categoryId: string;
  region: string;
  month: number;
}): KeywordOption[] {
  const { categoryId, month } = params;
  const options: KeywordOption[] = [];

  if ((month === 3 || month === 9) && (categoryId === "eye-info" || categoryId === "lenses")) {
    options.push(
      {
        title: `어린이시력 검사 새학기 근시 흐름`,
        mainKeyword: `어린이시력 검사`,
        subKeyword1: `어린이시력 근시`,
        subKeyword2: `어린이시력 관리`,
      },
      {
        title: `어린이시력 관리 개학 후 근시 확인`,
        mainKeyword: "어린이시력 관리",
        subKeyword1: "어린이시력 검사",
        subKeyword2: "어린이시력 근시",
      }
    );
  }

  if ((month === 4 || month === 5) && (categoryId === "eye-info" || categoryId === "lenses")) {
    options.push(
      {
        title: `어린이시력 검사 근시가 걱정될 때`,
        mainKeyword: `어린이시력 검사`,
        subKeyword1: `어린이시력 근시`,
        subKeyword2: `어린이시력 관리`,
      },
      {
        title: `안구건조 증상 봄철 알레르기와 차이`,
        mainKeyword: "안구건조 증상",
        subKeyword1: "안구건조 원인",
        subKeyword2: "안구건조 관리",
      }
    );
  }

  if ((month === 4 || month === 5) && categoryId === "progressive") {
    options.push({
      title: `노안안경 부모님 시야가 불편할 때`,
      mainKeyword: `노안안경 부모님`,
      subKeyword1: `노안안경 시야`,
      subKeyword2: `노안안경 검사`,
    });
  }

  if (month >= 6 && month <= 8) {
    if (categoryId === "contacts") {
      options.push(
        {
          title: `렌즈건조 여름 착용 시간이 길 때`,
          mainKeyword: `렌즈건조 여름`,
          subKeyword1: `렌즈건조 착용`,
          subKeyword2: `렌즈건조 관리`,
        },
        {
          title: `원데이렌즈 착용시간 여름 건조 기준`,
          mainKeyword: "원데이렌즈 착용시간",
          subKeyword1: "원데이렌즈 건조",
          subKeyword2: "원데이렌즈 관리",
        }
      );
    }
    if (categoryId === "lenses") {
      options.push({
        title: `변색렌즈 자외선 많은 날 쓰기 좋은 경우`,
        mainKeyword: `변색렌즈 자외선`,
        subKeyword1: `변색렌즈 야외`,
        subKeyword2: `변색렌즈 안경`,
      });
    }
  }

  if (month >= 10 || month <= 2) {
    if (categoryId === "glasses-story") {
      options.push({
        title: `안경김서림 겨울에 심해지는 이유`,
        mainKeyword: `안경김서림 겨울`,
        subKeyword1: `안경김서림 관리`,
        subKeyword2: `안경김서림 세척`,
      });
    }
    if (categoryId === "eye-info" || categoryId === "contacts") {
      options.push({
        title: `안구건조 증상 겨울 실내에서 심할 때`,
        mainKeyword: "안구건조 증상",
        subKeyword1: "안구건조 원인",
        subKeyword2: "안구건조 관리",
      });
    }
  }

  return options;
}

// 진짜 "기계적/스팸" 제목만 걸러낸다.
// (과거에는 자연스러운 제목까지 광범위하게 막아서, LLM이 좋은 제목을 줘도
//  후보 풀에서 탈락시키고 하드코딩 폴백으로 떨어지게 만들었다.)
// 키워드 나열형("A와 B 확인/기준"), 같은 토큰 반복, 의미 없는 나열 어미만 차단한다.
function isAwkwardGeneratedTitle(title: string): boolean {
  return (
    MECHANICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title)) ||
    // 같은 단어가 두 번 들어간 스팸성 제목
    /(확인 확인|기준 기준|선택 선택|관리 관리|검사 검사|차이 차이|원인 원인)/.test(title) ||
    // "A와 B 확인/기준/점검" 식 키워드 나열
    /\S+\s*(와|과)\s+\S+\s+(확인|기준|점검)$/.test(title) ||
    // 정보 기대감 없는 나열형 어미
    /살펴보기$|점검 항목$|확인할 것$|살펴야 할 것$|챙겨야 할 것$/.test(title) ||
    // 반복 생성된 빈 템플릿 어미
    /관리 습관이 흔들릴 때$|사용감이 달라질 때$|사용감이 달라지는 이유$|방문 전 살펴볼 기준$|착용 후 달라지는 부분$|달라지는 부분$/.test(title) ||
    // 슬래시 나열
    /\S\s*\/\s*\S/.test(title)
  );
}

const FALLBACK_KEYWORD_SETS: Record<
  string,
  Array<{ main: string; sub1: string; sub2: string; title: string }>
> = {
  progressive: [
    { main: "누진렌즈 적응", sub1: "누진렌즈 울렁임", sub2: "누진렌즈 시야", title: "누진렌즈 적응 울렁임이 오래 갈 때" },
    { main: "누진다초점 렌즈", sub1: "누진다초점 적응", sub2: "누진다초점 시야", title: "누진다초점 렌즈 처음 쓸 때 어색한 이유" },
    { main: "노안안경 선택", sub1: "노안안경 돋보기", sub2: "노안안경 시야", title: "노안안경 선택 돋보기와 다른 착용감" },
    { main: "다초점렌즈 적응", sub1: "다초점렌즈 울렁임", sub2: "다초점렌즈 운전", title: "다초점렌즈 적응 중 불편한 이유" },
    { main: "돋보기 불편", sub1: "돋보기 시야", sub2: "돋보기 노안", title: "돋보기 불편 가까운 글씨가 흔들릴 때" },
    { main: "누진렌즈 운전", sub1: "누진렌즈 야간", sub2: "누진렌즈 시야", title: "누진렌즈 운전 야간 시야가 답답할 때" },
    { main: "누진렌즈 도수", sub1: "누진렌즈 검사", sub2: "누진렌즈 시야", title: "누진렌즈 도수 바뀐 뒤 시야가 낯설 때" },
    { main: "누진다초점 안경", sub1: "누진다초점 적응", sub2: "누진다초점 시야", title: "누진다초점 안경 시야가 좁게 느껴질 때" },
    { main: "노안안경 도수", sub1: "노안안경 검사", sub2: "노안안경 시야", title: "노안안경 도수 가까운 글씨가 흐릴 때" },
    { main: "노안안경 착용감", sub1: "노안안경 돋보기", sub2: "노안안경 시야", title: "노안안경 착용감 어지러움이 생길 때" },
    { main: "중근용렌즈 선택", sub1: "중근용렌즈 실내", sub2: "중근용렌즈 업무", title: "중근용렌즈 선택 실내 사용감이 다를 때" },
    { main: "사무용렌즈 선택", sub1: "사무용렌즈 컴퓨터", sub2: "사무용렌즈 시야", title: "사무용렌즈 선택 모니터가 흐려 보일 때" },
    { main: "실내용누진 선택", sub1: "실내용누진 업무", sub2: "실내용누진 시야", title: "실내용누진 선택 업무 중 시야가 답답할 때" },
    { main: "누진렌즈 울렁임", sub1: "누진렌즈 적응", sub2: "누진렌즈 시야", title: "누진렌즈 울렁임 적응이 오래 걸릴 때" },
    { main: "다초점렌즈 운전", sub1: "다초점렌즈 적응", sub2: "다초점렌즈 시야", title: "다초점렌즈 운전 시야가 흔들릴 때" },
    { main: "중근용렌즈 업무", sub1: "중근용렌즈 실내", sub2: "중근용렌즈 시야", title: "중근용렌즈 업무 중 초점이 흐릴 때" },
    { main: "실내용누진 시야", sub1: "실내용누진 업무", sub2: "실내용누진 적응", title: "실내용누진 시야 책상 거리에서 답답할 때" },
    { main: "노안렌즈 선택", sub1: "노안렌즈 시야", sub2: "노안렌즈 검사", title: "노안렌즈 선택 가까운 글씨가 흐릴 때" },
    { main: "노안렌즈 적응", sub1: "노안렌즈 울렁임", sub2: "노안렌즈 시야", title: "노안렌즈 적응 시야가 낯설게 느껴질 때" },
  ],
  lenses: [
    { main: "렌즈교체 기준", sub1: "렌즈교체 시기", sub2: "렌즈교체 코팅", title: "렌즈교체 기준을 봐야 하는 경우" },
    { main: "안경렌즈 압축", sub1: "안경렌즈 두께", sub2: "안경렌즈 무게", title: "안경렌즈 압축 도수가 높을 때 두께 기준" },
    { main: "블루라이트렌즈 선택", sub1: "블루라이트렌즈 눈피로", sub2: "블루라이트렌즈 코팅", title: "블루라이트렌즈 선택 전 눈피로가 걱정될 때" },
    { main: "근시억제렌즈 검사", sub1: "근시억제렌즈 어린이", sub2: "근시억제렌즈 도수", title: "근시억제렌즈 검사 어린이 근시가 걱정될 때" },
    { main: "근시완화렌즈 검사", sub1: "근시완화렌즈 어린이", sub2: "근시완화렌즈 도수", title: "근시완화렌즈 검사 전 알아둘 부분" },
    { main: "안경렌즈 코팅", sub1: "안경렌즈 흠집", sub2: "안경렌즈 관리", title: "안경렌즈 코팅 흠집이 자주 생길 때" },
    { main: "안경렌즈 두께", sub1: "안경렌즈 압축", sub2: "안경렌즈 도수", title: "안경렌즈 두께 도수에 따라 달라지는 이유" },
    { main: "변색렌즈 선택", sub1: "변색렌즈 자외선", sub2: "변색렌즈 실내", title: "변색렌즈 선택 야외 활동이 많을 때" },
    { main: "누진렌즈 시야", sub1: "누진렌즈 적응", sub2: "누진렌즈 운전", title: "누진렌즈 시야 운전할 때 불편한 이유" },
    { main: "렌즈코팅 손상", sub1: "렌즈코팅 얼룩", sub2: "렌즈코팅 관리", title: "렌즈코팅 손상 얼룩이 잘 남는 이유" },
    { main: "안경렌즈 교체", sub1: "안경렌즈 코팅", sub2: "안경렌즈 흠집", title: "안경렌즈 교체 코팅이 벗겨졌을 때" },
    { main: "자외선렌즈 선택", sub1: "자외선렌즈 야외", sub2: "자외선렌즈 눈부심", title: "자외선렌즈 선택 눈부심이 심할 때" },
    { main: "운전렌즈 선택", sub1: "운전렌즈 야간", sub2: "운전렌즈 눈부심", title: "운전렌즈 선택 야간 눈부심이 불편할 때" },
    { main: "사무용렌즈 선택", sub1: "사무용렌즈 컴퓨터", sub2: "사무용렌즈 눈피로", title: "사무용렌즈 선택 컴퓨터를 오래 볼 때" },
    { main: "고굴절렌즈 선택", sub1: "고굴절렌즈 두께", sub2: "고굴절렌즈 도수", title: "고굴절렌즈 선택 두께가 고민될 때" },
    { main: "렌즈압축 선택", sub1: "렌즈압축 두께", sub2: "렌즈압축 무게", title: "렌즈압축 선택 두께가 부담될 때" },
    { main: "안경렌즈 선택", sub1: "안경렌즈 도수", sub2: "안경렌즈 두께", title: "안경렌즈 선택 도수에 따라 두께가 달라질 때" },
    { main: "안경렌즈 관리", sub1: "안경렌즈 코팅", sub2: "안경렌즈 얼룩", title: "안경렌즈 관리 코팅 얼룩이 반복될 때" },
    { main: "렌즈두께 선택", sub1: "렌즈두께 도수", sub2: "렌즈두께 압축", title: "렌즈두께 선택 도수가 높아졌을 때" },
    { main: "기능렌즈 선택", sub1: "기능렌즈 눈부심", sub2: "기능렌즈 야외", title: "기능렌즈 선택 눈부심이 오래 남을 때" },
  ],
  frames: [
    { main: "안경피팅 착용감", sub1: "안경피팅 코패드", sub2: "안경피팅 균형", title: "안경피팅 착용감이 달라지는 이유" },
    { main: "안경흘러내림 원인", sub1: "안경흘러내림 코패드", sub2: "안경흘러내림 피팅", title: "안경흘러내림 원인 코패드부터 볼 때" },
    { main: "가벼운안경 선택", sub1: "가벼운안경 소재", sub2: "가벼운안경 착용감", title: "가벼운안경 선택할 때 착용감 차이" },
    { main: "티타늄안경 선택", sub1: "티타늄안경 무게", sub2: "티타늄안경 착용감", title: "티타늄안경 선택 전 무게감 차이" },
    { main: "울템안경 특징", sub1: "울템안경 무게", sub2: "울템안경 탄성", title: "울템안경 특징 탄성이 편한 이유" },
    { main: "뿔테안경 얼굴형", sub1: "뿔테안경 인상", sub2: "뿔테안경 사이즈", title: "뿔테안경 얼굴형 따라 인상이 다른 이유" },
    { main: "금속테안경 착용감", sub1: "금속테안경 코패드", sub2: "금속테안경 무게", title: "금속테안경 착용감 코패드가 중요한 이유" },
    { main: "안경테 얼굴형", sub1: "안경테 사이즈", sub2: "안경테 브릿지", title: "안경테 얼굴형에 맞게 고를 때" },
    { main: "안경테 소재", sub1: "안경테 무게", sub2: "안경테 관리", title: "안경테 소재별 무게와 관리 차이" },
    { main: "안경코받침 교체", sub1: "안경코받침 자국", sub2: "안경코받침 소재", title: "안경코받침 교체 전 자국이 남는 이유" },
    { main: "안경귀통증 원인", sub1: "안경귀통증 피팅", sub2: "안경귀통증 착용감", title: "안경귀통증 원인 피팅과 착용감 먼저 확인" },
    { main: "안경테 변형", sub1: "안경테 보관", sub2: "안경테 피팅", title: "안경테 변형 보관과 피팅 기준" },
    { main: "안경사이즈 선택", sub1: "안경사이즈 얼굴형", sub2: "안경사이즈 착용감", title: "안경사이즈 선택 얼굴형부터 보는 이유" },
    { main: "하금테안경 인상", sub1: "하금테안경 얼굴형", sub2: "하금테안경 착용감", title: "하금테안경 인상이 강해 보이는 이유" },
    { main: "무테안경 관리", sub1: "무테안경 나사", sub2: "무테안경 렌즈", title: "무테안경 관리할 때 나사가 중요한 이유" },
    { main: "안경다리 피팅", sub1: "안경다리 균형", sub2: "안경다리 귀통증", title: "안경다리 피팅 후 귀가 아픈 이유" },
    { main: "베타티타늄안경 선택", sub1: "베타티타늄안경 탄성", sub2: "베타티타늄안경 무게", title: "베타티타늄안경 선택할 때 탄성 차이" },
    { main: "메탈안경 관리", sub1: "메탈안경 변형", sub2: "메탈안경 착용감", title: "메탈안경 관리할 때 변형을 보는 이유" },
    { main: "반무테안경 선택", sub1: "반무테안경 렌즈", sub2: "반무테안경 나사", title: "반무테안경 선택 렌즈와 나사 확인" },
    { main: "안경브릿지 선택", sub1: "안경브릿지 얼굴형", sub2: "안경브릿지 착용감", title: "안경브릿지 선택 얼굴형에 맞춰 볼 때" },
    { main: "안경테컬러 선택", sub1: "안경테컬러 피부톤", sub2: "안경테컬러 인상", title: "안경테컬러 선택 피부톤에 맞춰 볼 때" },
  ],
  contacts: [
    { main: "렌즈충혈 원인", sub1: "렌즈충혈 착용", sub2: "렌즈충혈 건조", title: "렌즈충혈 원인을 살펴봐야 할 때" },
    { main: "렌즈건조 원인", sub1: "렌즈건조 착용", sub2: "렌즈건조 관리", title: "렌즈건조 원인과 착용 습관" },
    { main: "난시렌즈 선택", sub1: "난시렌즈 착용", sub2: "난시렌즈 검사", title: "난시렌즈 선택 전 착용감이 흔들릴 때" },
    { main: "소프트렌즈 착용", sub1: "소프트렌즈 건조", sub2: "소프트렌즈 관리", title: "소프트렌즈 착용 건조감이 오래 남을 때" },
    { main: "원데이렌즈 교체", sub1: "원데이렌즈 위생", sub2: "원데이렌즈 착용", title: "원데이렌즈 교체 주기와 위생 관리" },
    { main: "하드렌즈 관리", sub1: "하드렌즈 세척", sub2: "하드렌즈 보관", title: "하드렌즈 관리에서 놓치기 쉬운 부분" },
    { main: "컬러렌즈 착용", sub1: "컬러렌즈 건조", sub2: "컬러렌즈 검사", title: "컬러렌즈 착용 전 봐야 할 눈 상태" },
    { main: "멀티포컬렌즈 적응", sub1: "멀티포컬렌즈 시야", sub2: "멀티포컬렌즈 착용", title: "멀티포컬렌즈 적응 중 시야 변화" },
    { main: "렌즈이물감 원인", sub1: "렌즈이물감 건조", sub2: "렌즈이물감 착용", title: "렌즈이물감 반복될 때 보는 원인" },
    { main: "렌즈세척 방법", sub1: "렌즈세척 위생", sub2: "렌즈세척 보관", title: "렌즈세척 방법이 중요한 이유" },
    { main: "장시간렌즈 착용", sub1: "장시간렌즈 건조", sub2: "장시간렌즈 관리", title: "장시간렌즈 착용 후 불편한 이유" },
    { main: "렌즈검사 기준", sub1: "렌즈검사 시력", sub2: "렌즈검사 착용", title: "렌즈검사 전에 확인할 눈 상태" },
    { main: "렌즈착용 시간", sub1: "렌즈착용 건조", sub2: "렌즈착용 관리", title: "렌즈착용 시간 건조와 관리 기준" },
    { main: "렌즈관리 습관", sub1: "렌즈관리 세척", sub2: "렌즈관리 보관", title: "렌즈관리 습관 세척과 보관 기준" },
    { main: "렌즈보관 방법", sub1: "렌즈보관 위생", sub2: "렌즈보관 케이스", title: "렌즈보관 방법 위생과 케이스 기준" },
    { main: "렌즈교체 주기", sub1: "렌즈교체 위생", sub2: "렌즈교체 착용", title: "렌즈교체 주기 위생과 착용 기준" },
    { main: "난시렌즈 검사", sub1: "난시렌즈 시력", sub2: "난시렌즈 착용", title: "난시렌즈 검사 시력과 착용 기준" },
    { main: "원데이렌즈 위생", sub1: "원데이렌즈 교체", sub2: "원데이렌즈 착용", title: "원데이렌즈 위생 교체와 착용 기준" },
    { main: "콘택트렌즈 검사", sub1: "콘택트렌즈 시력", sub2: "콘택트렌즈 착용", title: "콘택트렌즈 검사 시력과 착용 기준" },
    { main: "렌즈건조 관리", sub1: "렌즈건조 착용", sub2: "렌즈건조 습관", title: "렌즈건조 관리 착용과 습관 기준" },
    { main: "렌즈직경 차이", sub1: "렌즈직경 착용감", sub2: "렌즈직경 시야", title: "렌즈직경 차이 착용감이 낯설 때" },
    { main: "베이스커브 선택", sub1: "베이스커브 착용감", sub2: "베이스커브 검사", title: "베이스커브 선택 렌즈가 자꾸 움직일 때" },
    { main: "렌즈함수율 차이", sub1: "렌즈함수율 건조", sub2: "렌즈함수율 착용", title: "렌즈함수율 차이 건조감이 오래 갈 때" },
    { main: "산소투과율 렌즈", sub1: "산소투과율 착용", sub2: "산소투과율 충혈", title: "산소투과율 렌즈 충혈이 반복될 때" },
    { main: "렌즈돌아감 원인", sub1: "렌즈돌아감 난시", sub2: "렌즈돌아감 착용", title: "렌즈돌아감 원인 난시 교정이 흐릴 때" },
    { main: "렌즈흐림 원인", sub1: "렌즈흐림 건조", sub2: "렌즈흐림 세척", title: "렌즈흐림 원인 착용 중 뿌옇게 보일 때" },
    { main: "렌즈빠짐 원인", sub1: "렌즈빠짐 착용", sub2: "렌즈빠짐 검사", title: "렌즈빠짐 원인 눈 깜빡일 때 반복되면" },
    { main: "토릭렌즈 검사", sub1: "토릭렌즈 난시", sub2: "토릭렌즈 착용", title: "토릭렌즈 검사 축이 맞지 않을 때" },
    { main: "서클렌즈 직경", sub1: "서클렌즈 착용감", sub2: "서클렌즈 건조", title: "서클렌즈 직경 눈이 답답하게 느껴질 때" },
    { main: "투명렌즈 착용", sub1: "투명렌즈 건조", sub2: "투명렌즈 검사", title: "투명렌즈 착용 하루 끝에 건조할 때" },
  ],
  "eye-info": [
    { main: "안구건조 원인", sub1: "안구건조 증상", sub2: "안구건조 관리", title: "안구건조 원인을 살펴봐야 할 때" },
    { main: "눈초점 흐림", sub1: "눈초점 피로", sub2: "눈초점 검사", title: "눈초점 흐림이 반복될 때" },
    { main: "어린이시력 관리", sub1: "어린이시력 검사", sub2: "어린이시력 근시", title: "어린이시력 관리에서 볼 부분" },
    { main: "눈피로 원인", sub1: "눈피로 습관", sub2: "눈피로 검사", title: "눈피로 반복될 때 살펴볼 원인" },
    { main: "시력검사 시기", sub1: "시력검사 도수", sub2: "시력검사 난시", title: "시력검사 시기를 놓치기 쉬운 경우" },
    { main: "야간시력 흐림", sub1: "야간시력 운전", sub2: "야간시력 검사", title: "야간시력 흐림이 운전에 주는 영향" },
    { main: "눈충혈 원인", sub1: "눈충혈 건조", sub2: "눈충혈 렌즈", title: "눈충혈 반복될 때 확인할 습관" },
    { main: "어린이근시 확인", sub1: "어린이근시 검사", sub2: "어린이근시 관리", title: "어린이근시 진행에서 볼 부분" },
    { main: "자외선 눈", sub1: "자외선 렌즈", sub2: "자외선 차단", title: "자외선 눈 영향과 렌즈 선택" },
    { main: "난시 증상", sub1: "난시 검사", sub2: "난시 도수", title: "난시 증상 느껴질 때 검사 기준" },
    { main: "근시 진행", sub1: "근시 검사", sub2: "근시 관리", title: "근시 진행이 의심될 때 보는 부분" },
    { main: "원시 증상", sub1: "원시 검사", sub2: "원시 도수", title: "원시 증상과 가까운 거리 불편" },
    { main: "노안 증상", sub1: "노안 검사", sub2: "노안 렌즈", title: "노안 증상 시작될 때 확인할 변화" },
    { main: "눈건조 관리", sub1: "눈건조 습관", sub2: "눈건조 렌즈", title: "눈건조 관리에서 놓치기 쉬운 습관" },
    { main: "스마트폰 눈피로", sub1: "스마트폰 시력", sub2: "스마트폰 습관", title: "스마트폰 눈피로 줄이는 생활 습관" },
    { main: "독서 눈피로", sub1: "독서 시력", sub2: "독서 거리", title: "독서할 때 눈피로가 심해지는 이유" },
    { main: "눈떨림 원인", sub1: "눈떨림 피로", sub2: "눈떨림 습관", title: "눈떨림 원인 피로가 쌓였을 때" },
    { main: "시력저하 원인", sub1: "시력저하 검사", sub2: "시력저하 습관", title: "시력저하 원인 습관부터 돌아볼 때" },
    { main: "근거리 흐림", sub1: "근거리 시력", sub2: "근거리 검사", title: "근거리 흐림 독서할 때 불편한 이유" },
    { main: "눈초점 피로", sub1: "눈초점 습관", sub2: "눈초점 검사", title: "눈초점 피로가 반복되는 이유" },
    { main: "눈건강 생활", sub1: "눈건강 습관", sub2: "눈건강 검사", title: "눈건강 생활 습관을 바꿔야 할 때" },
    { main: "어린이 눈피로", sub1: "어린이 시력검사", sub2: "어린이 생활습관", title: "어린이 눈피로가 반복될 때" },
    { main: "청소년시력 관리", sub1: "청소년시력 검사", sub2: "청소년시력 습관", title: "청소년시력 관리 생활습관이 중요한 이유" },
    { main: "실내눈 피로", sub1: "실내눈 습관", sub2: "실내눈 조명", title: "실내눈 피로 조명에 따라 달라지는 이유" },
    { main: "운전시야 흐림", sub1: "운전시야 야간", sub2: "운전시야 검사", title: "운전시야 흐림 야간에 더 불편한 이유" },
    { main: "눈부심 원인", sub1: "눈부심 렌즈", sub2: "눈부심 검사", title: "눈부심 원인 빛에 민감해질 때" },
    { main: "눈피로 습관", sub1: "눈피로 스마트폰", sub2: "눈피로 조명", title: "눈피로 습관 스마트폰을 오래 볼 때" },
    { main: "시야흐림 원인", sub1: "시야흐림 피로", sub2: "시야흐림 검사", title: "시야흐림 원인 피로가 쌓였을 때" },
    { main: "어린이근시 관리", sub1: "어린이근시 습관", sub2: "어린이근시 검사", title: "어린이근시 관리 생활습관이 중요한 이유" },
    { main: "독서시력 피로", sub1: "독서시력 거리", sub2: "독서시력 습관", title: "독서시력 피로 책을 오래 볼 때" },
    { main: "야간눈부심 원인", sub1: "야간눈부심 운전", sub2: "야간눈부심 검사", title: "야간눈부심 원인 운전할 때 불편한 이유" },
  ],
  "glasses-story": [
    { main: "안경김서림 원인", sub1: "안경김서림 관리", sub2: "안경김서림 렌즈", title: "안경김서림 원인과 관리 방법" },
    { main: "안경세척 방법", sub1: "안경세척 렌즈", sub2: "안경세척 코팅", title: "안경세척 방법을 바꿔야 할 때" },
    { main: "안경수리 맡기기", sub1: "안경수리 나사", sub2: "안경수리 파손", title: "안경수리 맡기기 전 나사와 파손 확인" },
    { main: "안경코받침 교체", sub1: "안경코받침 소재", sub2: "안경코받침 관리", title: "안경코받침 교체 시기와 소재 선택" },
    { main: "안경닦이 소재", sub1: "안경닦이 관리", sub2: "안경닦이 교체", title: "안경닦이 소재 차이가 렌즈 코팅에 주는 영향" },
    { main: "안경보관 방법", sub1: "안경보관 습관", sub2: "안경보관 케이스", title: "안경보관 방법이 렌즈 흠집을 줄이는 이유" },
    { main: "안경스크래치 관리", sub1: "안경스크래치 원인", sub2: "안경스크래치 렌즈", title: "안경스크래치 생기는 습관과 관리 기준" },
    { main: "안경착용감 조정", sub1: "안경착용감 피팅", sub2: "안경착용감 코패드", title: "안경착용감 달라질 때 먼저 보는 부분" },
    { main: "안경흘러내림 원인", sub1: "안경흘러내림 피팅", sub2: "안경흘러내림 코패드", title: "안경흘러내림 원인 피팅과 코패드 먼저 확인" },
    { main: "안경테 관리", sub1: "안경테 변형", sub2: "안경테 보관", title: "안경테 변형을 줄이는 보관 습관" },
    { main: "코패드자국 원인", sub1: "코패드자국 피팅", sub2: "코패드자국 교체", title: "코패드자국 남을 때 피팅을 보는 이유" },
    { main: "안경조정 방법", sub1: "안경조정 균형", sub2: "안경조정 착용감", title: "안경조정 방법 균형과 착용감 확인" },
    { main: "안경렌즈 얼룩", sub1: "안경렌즈 세척", sub2: "안경렌즈 코팅", title: "안경렌즈 얼룩 남을 때 세척 습관" },
    { main: "안경나사 풀림", sub1: "안경나사 조임", sub2: "안경나사 수리", title: "안경나사 풀림 조임과 수리 확인" },
    { main: "안경테 변형", sub1: "안경테 피팅", sub2: "안경테 보관", title: "안경테 변형 피팅과 보관 확인" },
    { main: "안경코패드 관리", sub1: "안경코패드 세척", sub2: "안경코패드 교체", title: "안경코패드 관리 세척과 교체 기준" },
    { main: "안경렌즈 코팅", sub1: "안경렌즈 세척", sub2: "안경렌즈 보관", title: "안경렌즈 코팅 세척과 보관 습관" },
    { main: "안경착용감 변화", sub1: "안경착용감 피팅", sub2: "안경착용감 균형", title: "안경착용감 변화 피팅과 균형 확인" },
    { main: "안경관리 습관", sub1: "안경관리 세척", sub2: "안경관리 보관", title: "안경관리 습관 세척과 보관 기준" },
    { main: "안경케이스 보관", sub1: "안경케이스 습관", sub2: "안경케이스 렌즈", title: "안경케이스 보관 습관과 렌즈 보호" },
    { main: "안경닦이 관리", sub1: "안경닦이 세척", sub2: "안경닦이 교체", title: "안경닦이 관리 세척과 교체 기준" },
    { main: "안경세척 습관", sub1: "안경세척 렌즈", sub2: "안경세척 얼룩", title: "안경세척 습관 렌즈와 얼룩 확인" },
    { main: "안경렌즈 흠집", sub1: "안경렌즈 보관", sub2: "안경렌즈 세척", title: "안경렌즈 흠집 보관과 세척 습관" },
    { main: "안경코패드 세척", sub1: "안경코패드 자국", sub2: "안경코패드 교체", title: "안경코패드 세척 자국과 교체 확인" },
    { main: "안경피팅 변화", sub1: "안경피팅 균형", sub2: "안경피팅 착용감", title: "안경피팅 변화 균형과 착용감 확인" },
    { main: "안경관리 방법", sub1: "안경관리 렌즈", sub2: "안경관리 테", title: "안경관리 방법 렌즈와 테 확인" },
    { main: "안경테 세척", sub1: "안경테 변색", sub2: "안경테 보관", title: "안경테 세척 변색과 보관 기준" },
    { main: "안경렌즈 보관", sub1: "안경렌즈 케이스", sub2: "안경렌즈 흠집", title: "안경렌즈 보관 케이스와 흠집 확인" },
    { main: "안경착용 습관", sub1: "안경착용 균형", sub2: "안경착용 관리", title: "안경착용 습관 균형과 관리 기준" },
    { main: "안경힌지 관리", sub1: "안경힌지 나사", sub2: "안경힌지 움직임", title: "안경힌지 관리 나사와 움직임 확인" },
    { main: "안경고무팁 교체", sub1: "안경고무팁 착용감", sub2: "안경고무팁 귀통증", title: "안경고무팁 교체 착용감과 귀통증 확인" },
    { main: "안경렌즈 물자국", sub1: "안경렌즈 세척", sub2: "안경렌즈 코팅", title: "안경렌즈 물자국 세척과 코팅 확인" },
    { main: "안경테 뒤틀림", sub1: "안경테 균형", sub2: "안경테 피팅", title: "안경테 뒤틀림 균형과 피팅 확인" },
  ],
};

const BROAD_KEYWORD_HEADS: Record<string, string[]> = {
  progressive: [
    "누진렌즈",
    "다초점렌즈",
    "누진다초점",
    "노안안경",
    "노안렌즈",
    "돋보기안경",
    "사무용렌즈",
    "실내용누진",
    "중근용렌즈",
    "운전렌즈",
    "실내렌즈",
  ],
  lenses: [
    "안경렌즈",
    "렌즈교체",
    "안경알",
    "블루라이트렌즈",
    "변색렌즈",
    "자외선렌즈",
    "고굴절렌즈",
    "압축렌즈",
    "렌즈압축",
    "코팅렌즈",
    "편광렌즈",
    "운전렌즈",
    "사무용렌즈",
    "어린이렌즈",
    "근시완화렌즈",
    "근시억제렌즈",
    "마이오스마트",
  ],
  frames: [
    "안경테",
    "안경피팅",
    "안경흘러내림",
    "가벼운안경",
    "티타늄안경",
    "베타티타늄안경",
    "울템안경",
    "뿔테안경",
    "메탈안경",
    "하금테안경",
    "무테안경",
    "반무테안경",
    "큰안경",
    "둥근안경",
    "사각안경",
    "안경코받침",
    "코패드",
  ],
  contacts: [
    "콘택트렌즈",
    "원데이렌즈",
    "소프트렌즈",
    "하드렌즈",
    "난시렌즈",
    "컬러렌즈",
    "멀티포컬렌즈",
    "토릭렌즈",
    "투명렌즈",
    "서클렌즈",
    "아큐브렌즈",
    "알콘렌즈",
    "바슈롬렌즈",
    "쿠퍼비전",
    "바이오피니티",
    "데일리스렌즈",
    "토탈원렌즈",
    "렌즈직경",
    "베이스커브",
    "렌즈함수율",
    "산소투과율",
    "실리콘하이드로겔",
    "렌즈건조",
    "렌즈충혈",
    "렌즈이물감",
    "렌즈흐림",
    "렌즈돌아감",
    "렌즈찢어짐",
    "렌즈빠짐",
    "렌즈세척",
    "렌즈보관",
    "렌즈검사",
    "렌즈착용",
    "렌즈착용감",
    "렌즈착용시간",
    "렌즈교체",
    "장시간렌즈",
  ],
  "eye-info": [
    "시력검사",
    "눈피로",
    "안구건조",
    "눈초점",
    "시력저하",
    "야간시력",
    "눈충혈",
    "눈부심",
    "근시",
    "난시",
    "원시",
    "노안",
    "어린이시력",
    "어린이근시",
    "청소년시력",
    "스마트폰눈",
    "운전시야",
  ],
  "glasses-story": [
    "안경수리",
    "안경세척",
    "안경김서림",
    "안경관리",
    "안경보관",
    "안경조정",
    "안경착용감",
    "안경흘러내림",
    "코패드교체",
    "안경스크래치",
    "안경렌즈",
    "안경나사",
    "안경힌지",
    "안경닦이",
    "안경케이스",
  ],
};

const BROAD_KEYWORD_TAILS: Record<string, string[]> = {
  progressive: ["적응", "울렁임", "시야", "운전", "도수", "검사", "돋보기", "업무", "독서", "실내", "부모님", "처음"],
  lenses: ["선택", "교체", "두께", "압축", "코팅", "도수", "눈피로", "자외선", "눈부심", "야간", "운전", "어린이", "근시", "실내"],
  frames: ["선택", "착용감", "피팅", "얼굴형", "무게", "소재", "코패드", "귀통증", "흘러내림", "사이즈", "피부톤", "관리"],
  contacts: [
    "건조",
    "충혈",
    "이물감",
    "흐림",
    "검사",
    "착용감",
    "착용시간",
    "세척",
    "보관",
    "위생",
    "난시",
    "시야",
    "교체",
    "직경",
    "베이스커브",
    "함수율",
    "산소투과율",
    "돌아감",
    "빠짐",
    "찢어짐",
  ],
  "eye-info": ["원인", "증상", "검사", "관리", "습관", "피로", "흐림", "운전", "독서", "스마트폰", "어린이", "근시", "야간"],
  "glasses-story": ["원인", "방법", "관리", "교체", "세척", "보관", "피팅", "수리", "흠집", "얼룩", "코팅", "착용감", "습관"],
};

const TITLE_ANGLE_PHRASES = [
  "불편이 오래 남을 때",
  "생활에서 확인할 신호",
  "먼저 확인할 신호",
  "내 상황과 비교할 기준",
  "방문 전 확인할 항목",
  "착용 후 어색한 이유",
  "선택 전에 구분할 점",
  "습관에서 놓치기 쉬운 점",
];

function getSeasonalTailsForBroadCombinations(categoryId: string, month: number): string[] {
  if (categoryId === "contacts") {
    if (month >= 6 && month <= 8) return ["건조", "위생", "착용", "교체"];
    if (month >= 9 && month <= 11) return ["건조", "착용", "검사", "충혈"];
    if (month >= 12 || month <= 2) return ["건조", "착용", "보관", "이물감"];
    return ["건조", "검사", "착용", "충혈"];
  }
  if (categoryId === "progressive") return ["부모님", "운전", "독서", "업무"];
  if (categoryId === "lenses") return ["자외선", "눈피로", "운전", "어린이"];
  if (categoryId === "frames") return ["착용감", "얼굴형", "무게", "피팅"];
  if (categoryId === "eye-info") return ["눈피로", "시력검사", "스마트폰", "운전"];
  if (categoryId === "glasses-story") return ["김서림", "세척", "보관", "착용감"];
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildBroadCombinationOptions(params: {
  region: string;
  categoryId: string;
  month: number;
}): KeywordOption[] {
  void params.region;
  const heads = BROAD_KEYWORD_HEADS[params.categoryId] ?? [];
  const tails = BROAD_KEYWORD_TAILS[params.categoryId] ?? [];
  const seasonalTails = getSeasonalTailsForBroadCombinations(params.categoryId, params.month);
  const expandedTails = Array.from(new Set([...tails, ...seasonalTails]));
  const options: KeywordOption[] = [];
  const seen = new Set<string>();

  for (const head of heads) {
    for (const tail of expandedTails) {
      if (head.includes(tail)) continue;
      const mainKeyword = `${head} ${tail}`;
      if (seen.has(mainKeyword)) continue;
      seen.add(mainKeyword);
      const angle = TITLE_ANGLE_PHRASES[options.length % TITLE_ANGLE_PHRASES.length];
      options.push({
        title: `${mainKeyword} ${angle}`,
        mainKeyword,
        subKeyword1: `${head} ${expandedTails[(options.length + 3) % expandedTails.length]}`,
        subKeyword2: `${head} ${expandedTails[(options.length + 7) % expandedTails.length]}`,
      });
      if (options.length >= 140) break;
    }
    if (options.length >= 140) break;
  }

  return options;
}

function isCategoryAppropriateCandidate(categoryId: string, option: KeywordOption): boolean {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  if (
    !isValidTwoWordKeyword(option.mainKeyword) ||
    !isValidTwoWordKeyword(option.subKeyword1) ||
    !isValidTwoWordKeyword(option.subKeyword2)
  ) {
    return false;
  }
  if (
    hasMalformedCompoundAxis(option.mainKeyword) ||
    hasMalformedCompoundAxis(option.subKeyword1) ||
    hasMalformedCompoundAxis(option.subKeyword2)
  ) {
    return false;
  }
  if (
    startsWithRegionWord(option.mainKeyword) ||
    startsWithRegionWord(option.subKeyword1) ||
    startsWithRegionWord(option.subKeyword2) ||
    startsWithRegionWord(option.title)
  ) {
    return false;
  }
  if (/종합|사야|시간 관계|관계에서|상태가 반복|습관이 흐|검사 가는|검사가 반복|건조 검사가|보관 상태가 반복|착용 보관/.test(source)) {
    return false;
  }
  if (categoryId === "contacts") {
    if (/부모님|가정의달|새학기|자외선|휴가|야외|연말/.test(source)) return false;
  }
  if (categoryId === "frames") {
    if (/렌즈건조|렌즈충혈|원데이렌즈|콘택트렌즈|하드렌즈|소프트렌즈/.test(source)) return false;
  }
  if (categoryId === "progressive") {
    if (/렌즈세척|렌즈보관|컬러렌즈|원데이렌즈|코패드|안경수리|김서림|여름|휴가|자외선/.test(source)) return false;
    if (/실내용누진 운전|실내렌즈 운전|사무용렌즈 운전|중근용렌즈 운전|운전렌즈 업무|운전렌즈 독서|돋보기안경 적응|돋보기안경 울렁임|노안렌즈 운전|노안렌즈 업무/.test(source)) {
      return false;
    }
    if (/노안렌즈.*(귀 뒤쪽|귀통증|코패드|흘러내림|피팅)/.test(source)) return false;
  }
  if (categoryId === "eye-info") {
    if (/착용시간|원데이|콘택트|렌즈착용|렌즈관리/.test(source)) return false;
    if (/시력검사.*(안경닦이|안경수리|코패드|김서림|흘러내림|피팅|귀통증)/.test(source)) return false;
  }
  if (categoryId === "glasses-story") {
    if (/안경수리\s+(흘러내림|착용감)|안경세척\s+코팅.*렌즈와 비교/.test(source)) return false;
    if (/안경닦이.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경케이스.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경렌즈\s+원인|안경스크래치\s+처음/.test(source)) return false;
  }
  return !/산소투($|\s)/.test(source);
}

function isDemandKeywordRelevantForCategory(categoryId: string, keyword: string): boolean {
  const compact = keyword.replace(/\s+/g, "");
  if (!compact || /디카|카메라|렌터카|보험|대출|부동산|게임|맛집|호텔|항공|주식|코인/.test(compact)) {
    return false;
  }

  if (categoryId === "frames") {
    return /안경테|안경|선글라스|뿔테|메탈|티타늄|울템|하금테|무테|로우로우|카린|나인어코드|레이벤|카페인|BYWP/.test(compact);
  }
  if (categoryId === "lenses") {
    return /안경렌즈|안경알|기능렌즈|운전렌즈|어린이렌즈|블루라이트|자외선|변색렌즈|편광렌즈|고굴절|압축렌즈|코팅렌즈|근시완화|근시억제|마이오스마트|에실로|자이스|호야|니콘|케미|토카이/.test(compact);
  }
  if (categoryId === "contacts") {
    return /콘택트렌즈|원데이렌즈|난시렌즈|컬러렌즈|하드렌즈|소프트렌즈|멀티포컬렌즈|렌즈건조|렌즈충혈|렌즈직경|베이스커브|아큐브|알콘|쿠퍼|바슈롬|토릭렌즈/.test(compact);
  }
  if (categoryId === "progressive") {
    return /누진렌즈|다초점렌즈|누진다초점|노안안경|노안렌즈|사무용렌즈|실내용누진|중근용렌즈|돋보기|에실로|자이스|호야|니콘|바리락스/.test(compact);
  }
  if (categoryId === "eye-info") {
    return /시력검사|눈피로|안구건조|눈초점|시력저하|야간시력|어린이시력|어린이근시|근시|난시|노안|눈부심/.test(compact);
  }
  if (categoryId === "glasses-story") {
    return /안경수리|안경세척|안경관리|안경보관|안경피팅|안경흘러내림|안경김서림|코패드|안경나사|안경렌즈|안경테/.test(compact);
  }
  return true;
}

function splitCompactDemandKeyword(
  categoryId: string,
  keyword: string
): [string, string] | null {
  const compact = keyword.replace(/\s+/g, "");
  const heads = [
    ...(BROAD_KEYWORD_HEADS[categoryId] ?? []),
    "누진다초점렌즈",
    "근시완화렌즈",
    "근시억제렌즈",
    "블루라이트렌즈",
    "자외선렌즈",
    "야간운전렌즈",
    "안경렌즈",
    "기능렌즈",
    "운전렌즈",
    "사무용렌즈",
    "어린이렌즈",
    "다초점렌즈",
    "누진렌즈",
    "노안안경",
    "노안렌즈",
    "난시렌즈",
    "원데이렌즈",
    "콘택트렌즈",
    "컬러렌즈",
  ].sort((a, b) => b.length - a.length);

  const head = heads.find(
    (candidate) => compact.startsWith(candidate) && compact.length > candidate.length
  );
  if (!head) return null;

  const core = compact.slice(head.length);
  if (!core || core.length > 8 || /추천|가격|비용|후기|할인|무료|예약|상담|문의/.test(core)) {
    return null;
  }
  return [head, core];
}

function buildFallbackKeywordOptions(params: {
  region: string;
  categoryId: string;
  demandSignals: SearchVolumeSignal[];
}): KeywordOption[] {
  const region = params.region || inferRegionFromShopName("");
  const month = new Date().getMonth() + 1;

  const demandOptions = params.demandSignals
    .filter((signal) => {
      const total = signal.monthlyTotalSearches ?? 0;
      const ratio = signal.competitionRatio ?? 0;
      return (
        isDemandKeywordRelevantForCategory(params.categoryId, signal.keyword) &&
        total > 0 &&
        total <= 3000 &&
        (ratio === 0 || ratio <= 30) &&
        signal.keyword.trim().split(/\s+/).length <= 2
      );
    })
    .sort((a, b) => getDemandSignalScore(b) - getDemandSignalScore(a))
    .slice(0, 6)
    .map((signal): KeywordOption | null => {
      const parts = signal.keyword.trim().split(/\s+/);
      const rawKeyword = signal.keyword.trim();
      const inferred =
        parts.length >= 2
          ? ([parts[0], parts[1]] as [string, string])
          : splitCompactDemandKeyword(params.categoryId, rawKeyword);
      if (!inferred) return null;
      const [head, core] = inferred;
      const main = `${head} ${core}`;
      return {
        title: `${main} 생활에서 확인할 신호`,
        mainKeyword: main,
        subKeyword1: `${head} 기준`,
        subKeyword2: `${head} 관리`,
      };
    })
    .filter((option): option is KeywordOption => Boolean(option));

  const categoryOptions = (FALLBACK_KEYWORD_SETS[params.categoryId] ?? [])
    .map((item) => ({
      title: item.title,
      mainKeyword: item.main,
      subKeyword1: item.sub1,
      subKeyword2: item.sub2,
    }));

  const seasonalOptions = getSeasonalFallbackOptions({
    categoryId: params.categoryId,
    region,
    month,
  });
  return [
    ...seasonalOptions,
    ...demandOptions,
    ...categoryOptions,
  ]
    .filter((option) => isCategoryAppropriateCandidate(params.categoryId, option))
    .slice(0, 220);
}

function isValidTwoWordKeyword(keyword: string): boolean {
  const parts = keyword.trim().split(/\s+/);
  return parts.length === 2 && parts.every((part) => part.length >= 1);
}

function hasMalformedCompoundAxis(keyword: string): boolean {
  return keyword
    .trim()
    .split(/\s+/)
    .some((part) =>
    /^(야간운전|고도수|건조한|출근|초보|부모님|어머니|아버지|운전자|처음|40대|50대|60대|직장인|청소년|학생|여자|남자)(안경렌즈|안경알|난시렌즈|콘택트렌즈|원데이렌즈|컬러렌즈|하드렌즈|소프트렌즈|누진렌즈|다초점렌즈|노안안경|노안렌즈|선글라스|안경테|안경)$/.test(part)
      ||
      /^(누진렌즈|다초점렌즈|노안안경|노안렌즈|안경렌즈|안경알|기능렌즈|운전렌즈|사무용렌즈|어린이렌즈|난시렌즈|콘택트렌즈|원데이렌즈|컬러렌즈)(적응|선택|검사|착용감|관리|도수|시야|울렁임|건조|착용시간|실패|코팅|두께|운전)$/.test(part)
    );
}

function selectKeywordAnchorWord(keyword: string): string {
  const parts = keyword.trim().split(/\s+/);
  const [first, second] = parts;
  if (!second) return first ?? "";
  if (
    /^(10대|20대|30대|40대|50대|60대|여자|남자|학생|청소년|직장인|중년|부모님|어머니|아버지|어린이|운전자|초보|처음|출근|운동|장시간|야간운전|고도수|블루라이트차단|가벼운|튼튼한|편한|편안한|어지러운|큰사이즈|빅사이즈|오버사이즈|운전용|업무용|독서용|실내용)$/.test(first)
  ) {
    return second;
  }
  return first ?? "";
}

// LLM이 만든 제목은 그대로 신뢰한다. 여기서는 제목을 절대 다시 쓰지 않고,
// 서브키워드가 비어 있거나 2단어 형태가 아닐 때만 메인 키워드 머리어 기준으로 채운다.
function alignTitleWithKeywords(option: KeywordOption, index: number): KeywordOption {
  void index;
  const main = splitKeyword(option.mainKeyword);
  if (!main) return option;

  const [head, mainCore] = main;
  const keywordHead = isRegionWord(head) ? mainCore : selectKeywordAnchorWord(option.mainKeyword);
  const [core1, core2] = pickKeywordCores(option);
  const sub1 = splitKeyword(option.subKeyword1);
  const sub2 = splitKeyword(option.subKeyword2);
  const needsSub1 = !sub1 || !option.subKeyword1.includes(keywordHead);
  const needsSub2 = !sub2 || !option.subKeyword2.includes(keywordHead);
  if (!needsSub1 && !needsSub2) return option;

  return {
    ...option,
    subKeyword1: needsSub1 ? `${keywordHead} ${sub1?.[1] ?? core1}` : option.subKeyword1,
    subKeyword2: needsSub2 ? `${keywordHead} ${sub2?.[1] ?? core2}` : option.subKeyword2,
  };
}

/**
 * @deprecated 더 이상 호출되지 않는다. 100개가 넘는 정규식 .replace() 체인으로
 * 템플릿이 만든 어색한 제목을 땜질하던 함수다. 템플릿 조립을 제거했으므로 불필요.
 * 안전하게 삭제 가능.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function polishGeneratedTitle(title: string): string {
  return title
    .replace(/원인 (.+)(?:과|와) (.+) 기준/g, (_match, first: string, second: string) =>
      `원인 ${joinCores(first, second)} 먼저 확인`
    )
    .replace(/(.+)(?:과|와) (.+)으로 잡는 방법/g, (_match, first: string, second: string) =>
      `${joinCores(first, second)} 먼저 확인`
    )
    .replace(/선택 전 (.+) 기준/g, "선택 전 $1 차이")
    .replace(/관리 (.+) 기준/g, "관리할 때 $1")
    .replace(/관리할 때 (.+) 기준/g, "관리할 때 $1")
    .replace(/피팅 (.+) 기준/g, "피팅 후 $1 달라지는 이유")
    .replace(/소재 착용감 기준/g, "소재에 따라 착용감이 다른 이유")
    .replace(/코패드와 균형 기준/g, "코패드와 균형이 중요한 이유")
    .replace(/피부톤과 인상 기준/g, "피부톤에 따라 인상이 달라지는 이유")
    .replace(/변형과 착용감 기준/g, "변형되면 착용감이 달라지는 이유")
    .replace(/균형과 귀통증 기준/g, "균형이 틀어지면 귀가 아픈 이유")
    .replace(/얼굴형과 착용감 기준/g, "얼굴형에 따라 착용감이 다른 이유")
    .replace(/나사 풀림과 렌즈 빠짐 주의점/g, "나사와 렌즈 확인")
    .replace(/다리 피팅/g, "피팅")
    .replace(/먼저$/g, "먼저 볼 부분")
    .replace(/확인해야 할 때/g, "살펴봐야 할 때")
    .replace(/확인할 때/g, "살펴볼 때")
    .replace(/피로부터 봐야 하는 이유/g, "피로가 반복되는 이유")
    .replace(/선택 전 코팅과 눈피로$/g, "선택 전 눈피로가 걱정될 때")
    .replace(/눈피로 코팅 차이로 달라지는 점$/g, "눈피로 코팅 때문에 달라질 때")
    .replace(/눈피로가 쌓일 때 살펴야 할 코팅$/g, "눈피로가 오래 남을 때")
    .replace(/화면을 오래 봤을 때 달라지는 것$/g, "화면을 오래 볼 때 눈피로가 남는 이유")
    .replace(/선택 전 자외선과 실내$/g, "선택 전 자외선이 걱정될 때")
    .replace(/검사 전 어린이와 도수$/g, "검사 전 도수 변화가 걱정될 때")
    .replace(/어린이 도수 진행이 빠를 때/g, "어린이 검사 전 근시가 걱정될 때")
    .replace(/운전 중 시야와 적응$/g, "운전 시야 적응이 어려울 때")
    .replace(/기준 어린이와 검사 차이$/g, "검사 전 알아둘 부분")
    .replace(/기준 검사까지 봐야 하는 이유$/g, "검사 전 알아둘 부분")
    .replace(/검사와 관리 차이/g, "검사 후 관리가 필요한 경우")
    .replace(/검사 후 관리가 필요한 경우/g, "근시가 걱정될 때")
    .replace(/습관과 검사 기준/g, "습관을 돌아봐야 할 때")
    .replace(/때 관리 습관$/g, "때")
    .replace(/야간과 검사 기준/g, "야간에 더 불편한 이유")
    .replace(/습관과 조명 기준/g, "조명에 따라 달라지는 이유")
    .replace(/교체 전 자국과 소재$/g, "교체 전 자국부터 살펴볼 때")
    .replace(/자국과 소재 살펴볼 점/g, "자국이 남는 이유")
    .replace(/얼굴형을 먼저 보는 게 맞는 이유$/g, "얼굴형마다 달라지는 부분")
    .replace(/탄성과 무게 차이$/g, "가벼운데 탄성이 다른 이유")
    .replace(/착용감 코패드 때문에 달라지는 점$/g, "착용감 코패드 위치가 맞지 않을 때")
    .replace(/나사부터 볼 부분$/g, "나사 풀림이 생겼을 때")
    .replace(/착용감부터 볼 부분$/g, "착용감이 달라졌을 때")
    .replace(/관리부터 볼 부분$/g, "관리 습관이 흔들릴 때")
    .replace(/검사부터 볼 부분$/g, "검사 시기를 놓치기 쉬울 때")
    .replace(/얼굴형 때문에 불편할 때$/g, "얼굴형마다 달라지는 부분")
    .replace(/변형이 착용감을 망치는 순서$/g, "변형되면 착용감이 달라지는 이유")
    .replace(/시야 때문에 불편할 때$/g, "시야가 좁게 느껴질 때")
    .replace(/건조 때문에 불편할 때$/g, "건조감이 오래 남을 때")
    .replace(/파손 때문에 불편할 때$/g, "파손 상태를 먼저 봐야 할 때")
    .replace(/실내 때문에 불편할 때$/g, "실내에서 초점이 흐릴 때")
    .replace(/때문에 불편할 때$/g, "상태가 반복될 때")
    .replace(/에서 놓치기 쉬운 부분$/g, "에서 자주 놓치는 습관")
    .replace(/전 실내 차이$/g, "전 실내 사용감 차이")
    .replace(/전 실내 사용감 차이$/g, "실내 초점이 낯설 때")
    .replace(/전 업무 차이$/g, "전 업무 시야가 답답할 때")
    .replace(/전 착용 차이$/g, "전 착용감이 달라질 때")
    .replace(/전 시야 차이$/g, "전 시야가 답답할 때")
    .replace(/전 도수 차이$/g, "전 도수가 높아졌을 때")
    .replace(/맞는지 보는 법$/g, "맞지 않을 때")
    .replace(/확인할 것$/g, "확인할 때")
    .replace(/먼저 살펴야 할 것$/g, "반복될 때")
    .replace(/적응 때문에 불편할 때$/g, "적응이 어려울 때")
    .replace(/점검 항목$/g, "확인할 때")
    .replace(/원인 찾는 법$/g, "원인이 반복될 때")
    .replace(/영향을 주는 이유$/g, "달라지는 이유")
    .replace(/관리 흐름$/g, "관리 습관")
    .replace(/관리까지 살펴봐야 할 때$/g, "진행 신호를 놓치기 쉬울 때")
    .replace(/맡기기까지 살펴봐야 할 때$/g, "맡기기 전 상태를 봐야 할 때")
    .replace(/습관부터 보는 이유$/g, "습관이 반복될 때")
    .replace(/착용감이 달라졌을 때$/g, "귀 눌림이 반복될 때")
    .replace(/가 달라졌을 때$/g, "변화가 느껴질 때")
    .replace(/확인할 관리 원인$/g, "관리 습관이 흔들릴 때")
    .replace(/파손 상태에 따라 달라지는 판단$/g, "파손 상태를 먼저 봐야 할 때")
    .replace(/나사 풀림이 반복될 때 달라지는 점$/g, "나사 풀림이 반복될 때")
    .replace(/세척 순서가 틀리면 달라지는 것들$/g, "세척 순서가 맞지 않을 때")
    .replace(/어린이 도수가 오를 때 먼저 할 것$/g, "어린이 도수 변화가 빠를 때")
    .replace(/나사부터 파손 상태를 봐야 할 때$/g, "나사 풀림이 반복될 때")
    .replace(/착용 습관 균형이 중요한 이유$/g, "착용 균형이 자주 틀어질 때")
    .replace(/전 피부톤 차이$/g, "피부톤에 따라 인상이 달라질 때")
    .replace(/얼굴형마다 달라지는 부분$/g, "얼굴형에 따라 착용감이 달라질 때")
    .replace(/스마트폰이 반복되는 이유$/g, "스마트폰을 오래 볼 때")
    .replace(/검사 상태가 반복될 때$/g, "검사 시기를 놓치기 쉬울 때")
    .replace(/습관이 원인일 때 검사 전에 볼 신호$/g, "습관이 반복될 때")
    .replace(/도수 후 검사 변화가 남을 때$/g, "도수 변화 후 시야가 낯설 때")
    .replace(/피팅 변화 균형 상태가 반복될 때$/g, "피팅 균형이 자주 틀어질 때")
    .replace(/소재가 달라지면 착용감도 달라지는 이유$/g, "소재에 따라 착용감이 달라질 때")
    .replace(/달라지는 판단$/g, "먼저 봐야 할 때")
    .replace(/달라지는 점$/g, "변화가 생길 때")
    .replace(/달라지는 것$/g, "차이가 느껴질 때")
    .replace(/달라지는 것들$/g, "차이가 느껴질 때")
    .replace(/먼저 할 것$/g, "먼저 볼 때")
    .replace(/코패드부터 봐야 하는 이유$/g, "코패드 높이가 맞지 않을 때")
    .replace(/피팅부터 봐야 하는 이유$/g, "피팅 균형이 맞지 않을 때")
    .replace(/때문에 달라지는 점$/g, "때문에 불편할 때")
    .replace(/맞는 이유$/g, "달라지는 부분")
    .replace(/기준(.+)기준/g, "기준$1확인")
    .replace(/확인(.+)확인/g, "확인$1점검")
    .replace(/관리(.+)관리/g, "관리$1습관")
    .replace(/검사(.+)검사/g, "검사$1확인")
    .replace(/차이(.+)차이/g, "차이$1구분")
    .replace(/\s+/g, " ")
    .trim();
}

// 진짜로 망가진 제목만 떨어뜨린다(템플릿으로 다시 쓰지 않는다).
// 후보는 LLM이 넉넉히 생성하고 재시도/폴백 경로가 있으므로, 의심스러운 건
// 억지로 고치기보다 드롭하는 편이 결과 품질에 유리하다.
function isUsableLlmTitle(option: KeywordOption): boolean {
  const title = option.title.trim();
  if (!title) return false;
  // 메인 키워드는 제목에 원형 그대로 들어가야 한다(검색 노출의 전제).
  if (!title.includes(option.mainKeyword.trim())) return false;
  // 길이 안전장치(노출에서 잘리거나 너무 짧아 정보 기대감이 없는 제목 차단).
  const len = title.length;
  if (len < 12 || len > 40) return false;
  // 기계적/스팸성 패턴은 고치지 말고 버린다.
  if (isAwkwardGeneratedTitle(title)) return false;
  return true;
}

function getKeywordCore(keyword: string): string {
  return splitKeyword(keyword)?.[1] ?? "";
}

function hasVisibleSubKeywordCore(option: KeywordOption): boolean {
  const title = option.title;
  const subCores = [getKeywordCore(option.subKeyword1), getKeywordCore(option.subKeyword2)]
    .filter(Boolean);
  return subCores.some((core) => title.includes(core));
}

function buildTitleWithSupportCore(option: KeywordOption, supportCore: string): string {
  const mainCore = getKeywordCore(option.mainKeyword);
  const mainKeyword = option.mainKeyword;
  const titleSupportCore = /처음/.test(supportCore) ? "사용감" : supportCore;

  if (/원인/.test(mainCore)) {
    return `${mainKeyword} ${titleSupportCore} 먼저 확인할 때`;
  }
  if (/울렁임|어지러움|불편|건조|충혈|흐림|통증|이물감|흘러내림/.test(mainCore)) {
    if (/시야/.test(titleSupportCore)) return `${mainKeyword} ${titleSupportCore}가 흔들릴 때`;
    if (/선택/.test(titleSupportCore)) return `${mainKeyword} 반복될 때`;
    if (/어린이|부모님|학생|직장인|운전자|초보/.test(titleSupportCore)) return `${mainKeyword} ${titleSupportCore} 기준`;
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/착용감/.test(mainCore)) {
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/처음|적응/.test(mainCore)) {
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/도수/.test(mainCore)) {
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/선택|차이|소재|두께|압축|코팅|사이즈|얼굴형|무게/.test(mainCore)) {
    if (/돋보기|안경테|소재/.test(titleSupportCore)) return `${mainKeyword} ${titleSupportCore}와 비교할 때`;
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/검사|시기|근시|난시|노안/.test(mainCore)) {
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  if (/어린이|부모님|학생|직장인|운전자|초보/.test(titleSupportCore)) {
    return `${mainKeyword} ${titleSupportCore} 기준`;
  }
  return `${mainKeyword} ${titleSupportCore} 기준`;
}

function chooseSupportCoreForTitle(option: KeywordOption): string {
  const mainCore = getKeywordCore(option.mainKeyword);
  const cores = [getKeywordCore(option.subKeyword1), getKeywordCore(option.subKeyword2)]
    .filter((core) => core && core !== mainCore);
  if (/착용감|불편|울렁임|어지러움|적응|도수/.test(mainCore)) {
    return cores.find((core) => !/돋보기|선택|차이|디자인|렌즈교체|안경테|선글라스/.test(core)) ?? cores[0] ?? "";
  }
  return cores[0] ?? "";
}

function repairTitleForValidationShape(option: KeywordOption): KeywordOption {
  if (!option.title.includes(option.mainKeyword)) return option;

  const supportCore = chooseSupportCoreForTitle(option);

  let title = option.title;
  if (supportCore && !hasVisibleSubKeywordCore(option)) {
    title = buildTitleWithSupportCore(option, supportCore);
  }

  if (title.length < 15 && supportCore) {
    title = buildTitleWithSupportCore({ ...option, title }, supportCore);
  }

  if (title.length > 30 && supportCore) {
    const compact = `${option.mainKeyword} ${supportCore} 확인할 때`;
    title = compact.length <= 30 ? compact : title;
  }

  return { ...option, title };
}

function normalizeGeneratedOptions(options: KeywordOption[]): KeywordOption[] {
  return options
    .map((option) => ({
      title: option.title.trim().replace(/\s+/g, " "),
      mainKeyword: option.mainKeyword.trim().replace(/\s+/g, " "),
      subKeyword1: option.subKeyword1.trim().replace(/\s+/g, " "),
      subKeyword2: option.subKeyword2.trim().replace(/\s+/g, " "),
    }))
    // 제목은 LLM 출력을 그대로 유지하고, 서브키워드만 보정한다.
    .map((option, index) => alignTitleWithKeywords(option, index))
    // 명확한 검증 실패(서브핵심어 누락/길이 부족)만 최소 보정한다.
    .map((option) => repairTitleForValidationShape(option))
    // 망가진 제목은 템플릿으로 덮어쓰지 않고 드롭한다.
    .filter((option) => isUsableLlmTitle(option))
    .filter(
      (option) =>
        option.title.trim().length > 0 &&
        option.mainKeyword.trim().length > 0 &&
        option.subKeyword1.trim().length > 0 &&
        option.subKeyword2.trim().length > 0
    );
}

function buildCandidateEditingPrompt(params: {
  targetStore: string;
  category: string;
  candidates: KeywordOption[];
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
  strategyGuide: string;
}): string {
  const candidateLines = params.candidates
    .map(
      (candidate, index) =>
        `${index + 1}. title=${candidate.title} / main=${candidate.mainKeyword} / sub1=${candidate.subKeyword1} / sub2=${candidate.subKeyword2}`
    )
    .join("\n");
  const forbidden = params.forbiddenList.slice(0, 20).join("\n") || "(없음)";
  const references = params.referenceList.slice(0, 20).join("\n") || "(없음)";
  const competitors = params.competitorList.slice(0, 15).join("\n") || "(없음)";

  return `당신은 네이버 블로그 제목/키워드 편집장입니다.
아래 후보는 이미 네이버 검색량과 카테고리 적합성을 기준으로 코드가 압축한 후보입니다.
후보를 바탕으로 하되, 키워드 풀이 좁으면 핵심어×문제어×상황어 조합을 추가해 10개를 선별·정리하세요.

[대상]
- 매장: ${params.targetStore}
- 카테고리: ${params.category}

[후보]
${candidateLines}

[같은 매장 기존 제목]
${forbidden}

[다른 매장 참고 제목]
${references}

[경쟁 제목]
${competitors}

${params.strategyGuide}

[네이버 제목 편집 스킬]
${NAVER_TITLE_SKILL_RULES}

[중복/금지 규칙]
- 메인/서브 키워드는 정확히 2단어 조합.
- 기본 후보에 없는 키워드도 실제 검색어처럼 자연스러우면 허용.
- 지역명 + 핵심키워드는 등록 블로그 간 중복을 나누는 용도로 허용.
- 예: title="누진렌즈 울렁임 적응이 어려운 이유" / main="누진렌즈 울렁임" / sub1="누진렌즈 원인" / sub2="누진렌즈 적응"
- 같은 소재 반복 금지.
- 같은 관리형 글을 단어만 바꿔 반복 금지. 예: 렌즈세척/렌즈보관/렌즈관리/하드렌즈 관리/렌즈 케이스는 모두 같은 관리형 축으로 본다.
- 10개 결과 안에서 같은 축은 최대 1개만 둔다. 부득이하면 2개까지 허용하되 제목 각도와 본문 전개가 완전히 달라야 한다.
- 콘택트렌즈 카테고리는 관리형만 채우지 말고 건조, 충혈/이물감, 난시검사, 컬러렌즈, 멀티포컬, 착용시간, 원데이 교체처럼 서로 다른 문제를 섞는다.
- 같은 매장 기존 글에 같은 메인 키워드 또는 같은 소재가 있으면 금지.
- 다른 등록 매장은 제목 동일, 관점 동일, 메인+서브 조합 동일만 금지. 메인 키워드만 같고 관점이 다르면 허용.
- 네이버 상위 노출 경쟁 제목과 비슷하면 탈락보다 제목 각도·상황어·어미를 바꿔 구분.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 의료 단정 금지. 근시억제/근시완화는 정보형 기준 문장으로만 다룰 것.
- 시즌 키워드는 현재 월과 카테고리가 맞을 때만 제목 각도로 반영할 것. 억지로 계절어를 붙이지 말 것.
- 실제 검색어로 어색한 조합 금지: 주방, 가입도, 수치, 재방문 같은 단어를 억지로 붙이지 말 것.
- 제목에 넣기 어려운 서브 키워드는 만들지 말고, 제목에 자연스럽게 들어갈 수 있는 서브 키워드로 바꿀 것.
- 결과는 JSON만 출력.

{
  "results": [
    {
      "title": "제목",
      "main_keyword": "2단어 키워드",
      "sub_keyword_1": "2단어 키워드",
      "sub_keyword_2": "2단어 키워드"
    }
  ]
}`;
}

function buildHumanTitleRepairPrompt(params: {
  category: string;
  candidates: KeywordOption[];
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
}): string {
  const candidateLines = params.candidates
    .map(
      (candidate, index) =>
        `${index + 1}. title=${candidate.title} / main=${candidate.mainKeyword} / sub1=${candidate.subKeyword1} / sub2=${candidate.subKeyword2}`
    )
    .join("\n");
  const forbidden = params.forbiddenList.slice(0, 20).join("\n") || "(없음)";
  const references = params.referenceList.slice(0, 20).join("\n") || "(없음)";
  const competitors = params.competitorList.slice(0, 30).join("\n") || "(없음)";

  return `당신은 네이버 블로그 제목을 사람이 읽는 제목으로 최종 편집하는 에디터입니다.

[카테고리]
${params.category}

[편집할 후보]
${candidateLines}

[같은 매장 기존 제목 - 같은 메인 키워드/같은 제목 금지]
${forbidden}

[다른 등록 매장 제목 - 완전 동일 제목 금지, 관점 과도 중복 피하기]
${references}

[현재 네이버 상위 제목 - 같은 제목 구조/각도 피하기]
${competitors}

[편집 원칙]
- 후보를 단순 탈락시키지 말고 먼저 자연스러운 제목으로 고치세요.
- 후보 풀이 좁으면 같은 카테고리 안의 다른 핵심어와 문제어를 조합해 새 후보를 추가하세요.
- 지역명 + 핵심키워드는 등록 블로그 간 중복을 줄이는 용도로 허용합니다.
- title에는 main_keyword를 원형 그대로 포함하세요.
- main_keyword는 2단어 조합을 유지하세요.
- sub_keyword_1, sub_keyword_2도 2단어 조합을 유지하되, 어색하면 자연스러운 본문 소재 키워드로 바꾸세요.
- 지역명은 title/main/sub에 자동으로 넣지 마세요.
- 제목은 사람이 클릭할 만한 블로그 제목이어야 합니다. 키워드 나열, 문장 조각, 조사 붙은 키워드는 금지입니다.
- "확인", "기준", "때문에 달라지는 점", "부터 보는 부분", "봐야 하는 이유", "걱정될 때" 같은 어미를 반복하지 마세요.
- "차이"는 제품 비교가 명확할 때만 쓰고, "A와 B 차이"처럼 키워드를 붙인 제목은 피하세요.
- "맞는 이유", "때문에 달라지는 점"은 기계적으로 보이므로 결과가 드러나는 문장으로 바꾸세요.
- 같은 후보 묶음 안에서 제목 구조가 반복되면 안 됩니다.
- 같은 관리형 축을 단어만 바꿔 반복하지 마세요. 렌즈세척/렌즈보관/렌즈관리/하드렌즈 관리/렌즈 케이스는 모두 같은 축입니다.
- 콘택트렌즈 후보는 관리형만 만들지 말고 건조, 충혈/이물감, 난시검사, 컬러렌즈, 멀티포컬, 착용시간, 원데이 교체처럼 문제 축을 분산하세요.
- 네이버 상위 제목과 비슷하면 메인 키워드는 유지하되 증상, 사용 장면, 비교 관점, 관리 순서를 바꿔 다른 각도로 만드세요.
- 기계적인 제목은 반드시 고쳐서 반환하세요.
- 후보는 최소 20개 이상 반환하세요. 원 후보가 부족하면 같은 메인 키워드의 각도를 바꿔 추가 후보를 만드세요.
- "보기", "정리", "볼 것", "살펴볼 것"처럼 보고서식 어미로 끝내지 마세요.
- "부터 볼 부분", "때문에 불편할 때", "망치는 순서"처럼 어색하거나 과한 표현은 쓰지 마세요.
- "놓치기 쉬운 부분", "관리 흐름", "전 A 차이"처럼 추상적인 제목은 구체적인 증상/상황으로 바꾸세요.
- "습관부터 보는 이유", "맡기기까지 살펴봐야 할 때", "전 착용 차이"처럼 어색한 조합은 쓰지 마세요.
- "전 도수 차이", "살펴야 할 코팅", "확인할 관리 원인", "달라지는 판단"처럼 키워드 조각만 붙은 제목은 쓰지 마세요.
- "달라지는 것", "먼저 할 것"처럼 의미가 비어 있는 끝맺음은 쓰지 마세요.
- "관리부터 볼 부분", "검사부터 볼 부분"처럼 부자연스러운 조사 조합을 쓰지 마세요.
- "때 관리 습관", "도수 후 검사 변화"처럼 조사와 명사가 끊어진 제목은 쓰지 마세요.

[좋은 예]
- 안경흘러내림 원인 코패드 위치가 달라졌을 때
- 블루라이트렌즈 선택 전 눈피로가 문제될 때
- 어린이시력 검사 근시 진행을 놓치기 쉬운 때
- 안경보관 방법 렌즈 흠집을 줄이는 습관
- 누진렌즈 운전 야간 시야가 답답할 때
- 울템안경 특징 가벼운데 탄성이 다른 이유
- 안경피팅 착용감 코패드 위치가 맞지 않을 때
- 안경사이즈 선택 얼굴형에 맞지 않을 때
- 무테안경 관리 나사 풀림이 생겼을 때
- 메탈안경 관리 변형되면 착용감이 달라지는 이유
- 렌즈착용 시간 건조감이 오래 남을 때
- 중근용렌즈 선택 전 실내 사용감 차이
- 안경고무팁 교체할 때 착용감이 달라졌을 때
- 난시렌즈 선택 전 착용감이 달라질 때
- 안경수리 나사 맡기기 전 상태를 봐야 할 때
- 어린이눈 피로 습관이 반복될 때
- 렌즈두께 선택 도수가 높아졌을 때
- 소프트렌즈 착용감 건조감이 오래 남을 때
- 안경수리 나사 파손 상태를 먼저 봐야 할 때
- 블루라이트렌즈 눈피로 화면을 오래 볼 때 남는 이유
- 근시억제렌즈 검사 어린이 도수 변화가 빠를 때
- 하드렌즈 관리 세척 순서가 맞지 않을 때
- 청소년시력 관리 검사 시기를 놓치기 쉬울 때
- 누진렌즈 도수 변화 후 시야가 낯설 때
- 눈피로 습관 스마트폰을 오래 볼 때

[나쁜 예]
- 안경흘러내림 원인 피팅부터 봐야 하는 이유
- 중근용렌즈 실내 업무 때문에 달라지는 점
- 어린이시력 검사 근시가 걱정될 때 보는 기준
- 렌즈건조 관리할 때 착용부터 볼 부분
- 울템안경 특징 탄성과 무게 차이
- 안경피팅 착용감 코패드 때문에 달라지는 점
- 안경사이즈 선택 얼굴형을 먼저 보는 게 맞는 이유
- 무테안경 관리할 때 나사부터 볼 부분
- 하금테안경 인상 얼굴형 때문에 불편할 때
- 메탈안경 관리할 때 변형이 착용감을 망치는 순서
- 렌즈보관 방법에서 놓치기 쉬운 부분
- 렌즈착용 시간 건조감이 누적될 때 관리 흐름
- 중근용렌즈 선택 전 실내 차이
- 안경고무팁 교체할 때 착용감부터 볼 부분
- 난시렌즈 선택 전 착용 차이
- 안경수리 나사 맡기기까지 살펴봐야 할 때
- 어린이눈 피로 습관부터 보는 이유
- 블루라이트렌즈 눈피로가 쌓이는 패턴 보기
- 렌즈코팅 손상 얼룩이 잘 지워지지 않는 원인 정리
- 근시완화렌즈 검사 도수가 계속 올라갈 때 살펴볼 것
- 렌즈두께 선택 전 도수 차이
- 블루라이트렌즈 선택 눈피로가 쌓일 때 살펴야 할 코팅
- 소프트렌즈 착용감 달라졌을 때 확인할 관리 원인
- 안경수리 맡기기 파손 상태에 따라 달라지는 판단
- 안경힌지 관리 나사 풀림이 반복될 때 달라지는 점
- 블루라이트렌즈 눈피로 화면을 오래 봤을 때 달라지는 것
- 근시억제렌즈 검사 어린이 도수가 오를 때 먼저 할 것
- 하드렌즈 세척할 때 관리부터 볼 부분
- 하드렌즈 관리 세척 순서가 틀리면 달라지는 것들
- 청소년시력 관리할 때 검사부터 볼 부분
- 렌즈착용 시간 건조감이 오래 남을 때 관리 습관
- 눈피로 습관 스마트폰이 반복되는 이유
- 어린이근시 확인 검사 상태가 반복될 때
- 누진렌즈 도수 후 검사 변화가 남을 때
- A와 B 확인, A와 B 기준

JSON만 출력하세요. 최소 20개 후보를 반환하세요.
{
  "results": [
    {
      "title": "15~30자 자연스러운 제목",
      "main_keyword": "2단어",
      "sub_keyword_1": "2단어",
      "sub_keyword_2": "2단어"
    }
  ]
}`;
}

function canAddIntentBalancedCandidate<T extends KeywordOption>(
  candidate: T,
  selected: T[],
  options: { maxPerBucket?: number; allowSimilar?: boolean; maxRegional?: number } = {}
): boolean {
  if (isAwkwardGeneratedTitle(candidate.title)) return false;

  const hasExactDuplicate = selected.some(
    (picked) =>
      normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
      hasSameKeywordCombination(picked, candidate)
  );
  if (hasExactDuplicate) return false;
  if (selected.some((picked) => picked.mainKeyword === candidate.mainKeyword)) return false;

  if (!options.allowSimilar && selected.some((picked) => isTooSimilarTitle(candidate, picked))) {
    return false;
  }

  const material = inferSpecificMaterialGroup(candidate);
  const sameMaterialCount = selected.filter(
    (picked) => inferSpecificMaterialGroup(picked) === material
  ).length;
  if (sameMaterialCount >= (options.allowSimilar ? 2 : 1)) {
    return false;
  }

  const contentTheme = inferContentTheme(candidate);
  const sameThemeCount = selected.filter(
    (picked) => inferContentTheme(picked) === contentTheme
  ).length;
  if (sameThemeCount >= 1) {
    return false;
  }

  const mainAxis = inferMainKeywordAxis(candidate);
  const sameMainAxisCount = selected.filter(
    (picked) => inferMainKeywordAxis(picked) === mainAxis
  ).length;
  if (sameMainAxisCount >= (options.allowSimilar ? 2 : 1)) {
    return false;
  }

  const bucket = inferIntentBucket(candidate);
  const maxRegional = options.maxRegional ?? 2;
  if (
    bucket === "regional" &&
    selected.filter((picked) => inferIntentBucket(picked) === "regional").length >= maxRegional
  ) {
    return false;
  }

  const maxPerBucket = options.maxPerBucket ?? 3;
  const bucketCount = selected.filter((picked) => inferIntentBucket(picked) === bucket).length;
  return bucketCount < maxPerBucket;
}

function pickIntentBalancedKeywordResults<T extends KeywordOption & { _priorityScore: number }>(
  rankedResults: T[]
): T[] {
  const selected: T[] = [];

  for (const { bucket, min } of INTENT_BUCKET_QUOTAS) {
    const bucketCandidates = rankedResults.filter(
      (candidate) => inferIntentBucket(candidate) === bucket
    );
    for (const candidate of bucketCandidates) {
      if (selected.filter((picked) => inferIntentBucket(picked) === bucket).length >= min) {
        break;
      }
      if (
        canAddIntentBalancedCandidate(candidate, selected, {
          maxPerBucket: min + 1,
          maxRegional: 2,
        })
      ) {
        selected.push(candidate);
      }
    }
  }

  for (const candidate of rankedResults) {
    if (selected.length >= TARGET_RESULT_COUNT) break;
    if (
      canAddIntentBalancedCandidate(candidate, selected, {
        maxPerBucket: 3,
        maxRegional: 2,
      })
    ) {
      selected.push(candidate);
    }
  }

  for (const candidate of rankedResults) {
    if (selected.length >= TARGET_RESULT_COUNT) break;
    if (
      canAddIntentBalancedCandidate(candidate, selected, {
        maxPerBucket: 4,
        allowSimilar: true,
        maxRegional: 2,
      })
    ) {
      selected.push(candidate);
    }
  }

  for (const candidate of rankedResults) {
    if (selected.length >= TARGET_RESULT_COUNT) break;
    if (
      canAddIntentBalancedCandidate(candidate, selected, {
        maxPerBucket: TARGET_RESULT_COUNT,
        allowSimilar: true,
        maxRegional: 2,
      })
    ) {
      selected.push(candidate);
    }
  }

  return interleaveIntentBuckets(selected).slice(0, TARGET_RESULT_COUNT);
}

function interleaveIntentBuckets<T extends KeywordOption>(selected: T[]): T[] {
  const buckets = new Map<IntentBucket, T[]>();
  for (const option of selected) {
    const bucket = inferIntentBucket(option);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), option]);
  }

  const ordered: T[] = [];
  let moved = true;
  while (ordered.length < selected.length && moved) {
    moved = false;
    for (const bucket of INTENT_DISPLAY_ORDER) {
      const next = buckets.get(bucket)?.shift();
      if (!next) continue;
      ordered.push(next);
      moved = true;
      if (ordered.length >= selected.length) break;
    }
  }

  return ordered;
}

function appendFinalBackfill<T extends KeywordOption & { _priorityScore: number }>(
  selected: T[],
  rankedPool: T[]
): T[] {
  const filled = [...selected];

  for (const candidate of rankedPool) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (
      canAddIntentBalancedCandidate(candidate, filled, {
        maxPerBucket: TARGET_RESULT_COUNT,
        allowSimilar: true,
        maxRegional: 2,
      })
    ) {
      filled.push(candidate);
    }
  }

  for (const candidate of rankedPool) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    if (inferIntentBucket(candidate) === "regional") continue;
    const material = inferSpecificMaterialGroup(candidate);
    const sameMaterialCount = filled.filter(
      (picked) => inferSpecificMaterialGroup(picked) === material
    ).length;
    if (sameMaterialCount >= 2) continue;
    const contentTheme = inferContentTheme(candidate);
    const sameThemeCount = filled.filter(
      (picked) => inferContentTheme(picked) === contentTheme
    ).length;
    if (sameThemeCount >= 1) continue;
    const mainAxis = inferMainKeywordAxis(candidate);
    const sameMainAxisCount = filled.filter(
      (picked) => inferMainKeywordAxis(picked) === mainAxis
    ).length;
    if (sameMainAxisCount >= 1) continue;
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  for (const candidate of rankedPool) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    const material = inferSpecificMaterialGroup(candidate);
    const sameMaterialCount = filled.filter(
      (picked) => inferSpecificMaterialGroup(picked) === material
    ).length;
    if (sameMaterialCount >= 2) continue;
    const contentTheme = inferContentTheme(candidate);
    const sameThemeCount = filled.filter(
      (picked) => inferContentTheme(picked) === contentTheme
    ).length;
    if (sameThemeCount >= 2) continue;
    const mainAxis = inferMainKeywordAxis(candidate);
    const sameMainAxisCount = filled.filter(
      (picked) => inferMainKeywordAxis(picked) === mainAxis
    ).length;
    if (sameMainAxisCount >= 2) continue;
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  return interleaveIntentBuckets(filled).slice(0, TARGET_RESULT_COUNT);
}

function appendCategoryBackfill<T extends AnalyzedKeyword>(
  selected: T[],
  rankedPool: T[],
  fallbackCandidates: T[]
): T[] {
  const filled = appendFinalBackfill(selected, rankedPool);
  if (filled.length >= TARGET_RESULT_COUNT) return filled;

  for (const candidate of fallbackCandidates) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (
      !canAddIntentBalancedCandidate(candidate, filled, {
        maxPerBucket: TARGET_RESULT_COUNT,
        maxRegional: 2,
      })
    ) {
      continue;
    }
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  for (const candidate of fallbackCandidates) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    const mainAxis = inferMainKeywordAxis(candidate);
    const sameMainAxisCount = filled.filter(
      (picked) => inferMainKeywordAxis(picked) === mainAxis
    ).length;
    if (sameMainAxisCount >= 1) continue;
    const material = inferSpecificMaterialGroup(candidate);
    const sameMaterialCount = filled.filter(
      (picked) => inferSpecificMaterialGroup(picked) === material
    ).length;
    if (sameMaterialCount >= 1) continue;
    const contentTheme = inferContentTheme(candidate);
    const sameThemeCount = filled.filter(
      (picked) => inferContentTheme(picked) === contentTheme
    ).length;
    if (sameThemeCount >= 1) continue;
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  for (const candidate of fallbackCandidates) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    const contentTheme = inferContentTheme(candidate);
    const sameThemeCount = filled.filter(
      (picked) => inferContentTheme(picked) === contentTheme
    ).length;
    if (sameThemeCount >= 2) continue;
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  return interleaveIntentBuckets(filled).slice(0, TARGET_RESULT_COUNT);
}

function appendEmergencyDiverseBackfill<T extends AnalyzedKeyword>(
  selected: T[],
  candidates: T[]
): T[] {
  const filled = [...selected];

  for (const maxSameTheme of [1, 2]) {
    for (const candidate of candidates) {
      if (filled.length >= TARGET_RESULT_COUNT) break;
      if (!candidate.validation.isValid) continue;
      if (!candidate.title.includes(candidate.mainKeyword)) continue;
      if (isAwkwardGeneratedTitle(candidate.title)) continue;
      const hasExactDuplicate = filled.some(
        (picked) =>
          normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
          hasSameKeywordCombination(picked, candidate)
      );
      if (hasExactDuplicate) continue;

      const sameThemeCount = filled.filter(
        (picked) => inferContentTheme(picked) === inferContentTheme(candidate)
      ).length;
      if (sameThemeCount >= maxSameTheme) continue;

      const sameMainAxisCount = filled.filter(
        (picked) => inferMainKeywordAxis(picked) === inferMainKeywordAxis(candidate)
      ).length;
      if (sameMainAxisCount >= 2) continue;

      filled.push(candidate);
    }
    if (filled.length >= TARGET_RESULT_COUNT) break;
  }

  for (const candidate of candidates) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (!candidate.validation.isValid) continue;
    if (!candidate.title.includes(candidate.mainKeyword)) continue;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!hasExactDuplicate) {
      filled.push(candidate);
    }
  }

  return interleaveIntentBuckets(filled).slice(0, TARGET_RESULT_COUNT);
}

function matchesAnyProductHead(option: KeywordOption, productHeads: string[]): boolean {
  if (productHeads.length === 0) return false;
  const source = `${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`
    .replace(/\s+/g, "")
    .toLowerCase();
  return productHeads.some((head) =>
    source.includes(head.replace(/\s+/g, "").toLowerCase())
  );
}

function getMatchedProductHeads(option: KeywordOption, productHeads: string[]): string[] {
  if (productHeads.length === 0) return [];
  const source = option.mainKeyword.replace(/\s+/g, "").toLowerCase();
  return productHeads.filter((head) =>
    source.includes(head.replace(/\s+/g, "").toLowerCase())
  );
}

function getKeywordOptionKey(option: KeywordOption): string {
  return option.mainKeyword.replace(/\s+/g, "").toLowerCase();
}

function matchesKeywordMesh(option: KeywordOption, meshKeywordKeys: Set<string>): boolean {
  return meshKeywordKeys.has(getKeywordOptionKey(option));
}

function ensureProductRepresentation<T extends AnalyzedKeyword>(
  selected: T[],
  candidates: T[],
  productHeads: string[],
  minCount = 2
): T[] {
  if (productHeads.length === 0) return selected;

  const filled = [...selected];
  const productCount = () => filled.filter((item) => matchesAnyProductHead(item, productHeads)).length;
  if (productCount() >= minCount) return filled.slice(0, TARGET_RESULT_COUNT);

  const selectedKeys = new Set(filled.map((item) => `${item.title}|${item.mainKeyword}`));
  const productCandidates = candidates
    .filter((candidate) => candidate.validation.isValid)
    .filter((candidate) => matchesAnyProductHead(candidate, productHeads))
    .filter((candidate) => !selectedKeys.has(`${candidate.title}|${candidate.mainKeyword}`))
    .filter((candidate) => !isAwkwardGeneratedTitle(candidate.title))
    .sort((a, b) => b._priorityScore - a._priorityScore);

  for (const candidate of productCandidates) {
    if (productCount() >= minCount) break;
    const replaceIndex = [...filled]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => !matchesAnyProductHead(item, productHeads))?.index;
    if (replaceIndex === undefined) break;
    filled[replaceIndex] = candidate;
    selectedKeys.add(`${candidate.title}|${candidate.mainKeyword}`);
  }

  return interleaveIntentBuckets(filled).slice(0, TARGET_RESULT_COUNT);
}

function ensureKeywordMeshRepresentation<T extends AnalyzedKeyword>(
  selected: T[],
  candidates: T[],
  meshKeywordKeys: Set<string>,
  productHeads: string[],
  minCount = 3
): T[] {
  if (meshKeywordKeys.size === 0) return selected.slice(0, TARGET_RESULT_COUNT);

  const filled = [...selected];
  const meshCount = () => filled.filter((item) => matchesKeywordMesh(item, meshKeywordKeys)).length;
  if (meshCount() >= minCount) return filled.slice(0, TARGET_RESULT_COUNT);

  const selectedKeys = new Set(filled.map((item) => `${item.title}|${item.mainKeyword}`));
  const meshCandidates = candidates
    .filter((candidate) => candidate.validation.isValid)
    .filter((candidate) => matchesKeywordMesh(candidate, meshKeywordKeys))
    .filter((candidate) => !selectedKeys.has(`${candidate.title}|${candidate.mainKeyword}`))
    .filter((candidate) => !isAwkwardGeneratedTitle(candidate.title))
    .sort((a, b) => b._priorityScore - a._priorityScore);

  for (const candidate of meshCandidates) {
    if (meshCount() >= minCount) break;
    const replaceIndex =
      [...filled]
        .map((item, index) => ({ item, index }))
        .reverse()
        .find(({ item }) =>
          !matchesKeywordMesh(item, meshKeywordKeys) && !matchesAnyProductHead(item, productHeads)
        )?.index ??
      [...filled]
        .map((item, index) => ({ item, index }))
        .reverse()
        .find(({ item }) => !matchesKeywordMesh(item, meshKeywordKeys))?.index;
    if (replaceIndex === undefined) break;
    filled[replaceIndex] = candidate;
    selectedKeys.add(`${candidate.title}|${candidate.mainKeyword}`);
  }

  return interleaveIntentBuckets(filled).slice(0, TARGET_RESULT_COUNT);
}

function dedupeFinalKeywordResults<T extends AnalyzedKeyword>(
  selected: T[],
  candidates: T[],
  productHeads: string[] = []
): T[] {
  const result: T[] = [];
  const pushIfFresh = (candidate: T) => {
    if (!candidate.validation.isValid) return;
    if (!candidate.title.includes(candidate.mainKeyword)) return;
    if (isAwkwardGeneratedTitle(candidate.title)) return;
    const matchedProductHeads = getMatchedProductHeads(candidate, productHeads);
    if (matchedProductHeads.length > 1) return;
    if (
      matchedProductHeads.length === 1 &&
      result.filter((picked) => getMatchedProductHeads(picked, productHeads)[0] === matchedProductHeads[0]).length >= 2
    ) {
      return;
    }
    const duplicate = result.some(
      (picked) =>
        normalizeTitleForComparison(picked.mainKeyword) === normalizeTitleForComparison(candidate.mainKeyword) ||
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (!duplicate) result.push(candidate);
  };

  for (const candidate of selected) {
    if (result.length >= TARGET_RESULT_COUNT) break;
    pushIfFresh(candidate);
  }
  for (const candidate of candidates) {
    if (result.length >= TARGET_RESULT_COUNT) break;
    pushIfFresh(candidate);
  }

  return interleaveIntentBuckets(result).slice(0, TARGET_RESULT_COUNT);
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
  const competitorTitleSimilarity = analyzeTitleSimilarity(
    option.title,
    competitorList
  );
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
    competitorTitleSimilarity,
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

function findDemandSignalForKeyword(
  keyword: string,
  demandSignals: SearchVolumeSignal[]
): SearchVolumeSignal | undefined {
  const normalized = keyword.replace(/\s+/g, "").toLowerCase();
  const exact = demandSignals.find(
    (signal) => signal.keyword.replace(/\s+/g, "").toLowerCase() === normalized
  );
  if (exact) return exact;

  return demandSignals.find((signal) => {
    const signalKey = signal.keyword.replace(/\s+/g, "").toLowerCase();
    return normalized.includes(signalKey) || signalKey.includes(normalized);
  });
}

function mergeDemandSignals(...groups: SearchVolumeSignal[][]): SearchVolumeSignal[] {
  const merged = new Map<string, SearchVolumeSignal>();
  for (const group of groups) {
    for (const signal of group) {
      const key = signal.keyword.replace(/\s+/g, "").toLowerCase();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, signal);
        continue;
      }
      merged.set(key, {
        ...existing,
        ...signal,
        monthlyTotalSearches:
          signal.monthlyTotalSearches ?? existing.monthlyTotalSearches,
        blogDocumentCount: signal.blogDocumentCount ?? existing.blogDocumentCount,
        opportunityScore: signal.opportunityScore ?? existing.opportunityScore,
        competitionRatio: signal.competitionRatio ?? existing.competitionRatio,
        seasonalFit: signal.seasonalFit ?? existing.seasonalFit,
        seasonalReason: signal.seasonalReason ?? existing.seasonalReason,
      });
    }
  }
  return Array.from(merged.values());
}

function dedupeKeywordOptions<T extends KeywordOption>(options: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const option of options) {
    const key = `${option.title}|${option.mainKeyword}|${option.subKeyword1}|${option.subKeyword2}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function getVolumeTierScore(tier: VolumeGateFields["_volumeTier"] | undefined): number {
  if (tier === "pass") return 45;
  if (tier === "weak") return -20;
  return 0;
}

function getProductHeadScore(option: KeywordOption, productHeads: string[]): number {
  if (productHeads.length === 0) return 0;
  const source = `${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`
    .replace(/\s+/g, "")
    .toLowerCase();
  const matched = productHeads.some((head) =>
    source.includes(head.replace(/\s+/g, "").toLowerCase())
  );
  return matched ? 34 : 0;
}

function getKeywordMeshScore(option: KeywordOption, meshKeywordKeys: Set<string>): number {
  return matchesKeywordMesh(option, meshKeywordKeys) ? 24 : 0;
}

function getSearcherConversionQualityScore(option: KeywordOption): number {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const mainTail = splitKeyword(option.mainKeyword)?.[1] ?? "";
  let score = 0;

  if (/울렁임|어지러움|건조|충혈|흐림|통증|이물감|흘러내림|눈부심|불편|피로/.test(source)) {
    score += 18;
  }
  if (/처음|착용|야간|운전|업무|독서|스마트폰|생활|부모님|어린이|장시간/.test(source)) {
    score += 12;
  }
  if (/검사|도수|피팅|코패드|착용감|시야|얼굴형|거리|두께|압축|코팅/.test(source)) {
    score += 12;
  }
  if (/확인할 점|비교할 기준|어색한 이유|불편할 때|생활거리|놓치기 쉬운 점/.test(option.title)) {
    score += 10;
  }

  if (/선택|관리|방법|기준|업무|운전|생활/.test(mainTail) && !/불편|검사|도수|시야|착용감|눈부심|건조|울렁임|흘러내림/.test(source)) {
    score -= 18;
  }
  if (/달라지는 부분|반복될 때|사용감이 달라질 때|사용감이 달라지는 이유|생활에서 자주 생기는 이유|방문 전 살펴볼 기준|관리 습관이 흔들릴 때|알아볼 때 확인할 부분/.test(option.title)) {
    score -= 24;
  }
  if (/운전렌즈 업무|운전렌즈 독서|실내렌즈 운전|사무용렌즈 운전|중근용렌즈 운전/.test(source)) {
    score -= 35;
  }

  return score;
}

function getTopicAlignmentScore(option: KeywordOption, topic?: string): number {
  const topicText = topic?.trim() ?? "";
  if (!topicText) return 0;

  const topicTokens = Array.from(
    new Set(topicText.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [])
  ).filter((token) => !COMMON_TITLE_WORDS.has(token));
  if (topicTokens.length === 0) return 0;

  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`
    .replace(/\s+/g, "")
    .toLowerCase();
  const mainKey = option.mainKeyword.replace(/\s+/g, "").toLowerCase();
  const titleKey = option.title.replace(/\s+/g, "").toLowerCase();
  const matched = topicTokens.filter((token) =>
    source.includes(token.replace(/\s+/g, "").toLowerCase())
  );
  const primaryTopicToken = topicTokens[0]?.replace(/\s+/g, "").toLowerCase();
  const secondaryTopicToken = topicTokens[1]?.replace(/\s+/g, "").toLowerCase();
  const hasPrimary = primaryTopicToken ? source.includes(primaryTopicToken) : false;
  const mainHasPrimary = primaryTopicToken ? mainKey.includes(primaryTopicToken) : false;
  const mainHasSecondary = secondaryTopicToken ? mainKey.includes(secondaryTopicToken) : false;
  const titleHasSecondary = secondaryTopicToken ? titleKey.includes(secondaryTopicToken) : false;

  let score = matched.length * 16;
  if (hasPrimary) score += 18;
  if (mainHasPrimary) score += 28;
  if (mainHasPrimary && mainHasSecondary) score += 70;
  if (mainHasPrimary && titleHasSecondary) score += 24;
  if (matched.length >= Math.min(2, topicTokens.length)) score += 14;
  if (!hasPrimary) score -= 180;
  if (secondaryTopicToken && !source.includes(secondaryTopicToken)) score -= 40;
  return score;
}

function extractTopicFocusTokens(topic?: string): string[] {
  return Array.from(new Set(topic?.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []))
    .map((token) => stripKoreanParticle(token))
    .filter((token) => token.length >= 2 && !COMMON_TITLE_WORDS.has(token))
    .slice(0, 3);
}

function prioritizeTopicFocusedResults<T extends AnalyzedKeyword>(results: T[], topic?: string): T[] {
  const tokens = extractTopicFocusTokens(topic);
  const primary = tokens[0]?.replace(/\s+/g, "").toLowerCase();
  if (!primary) return results;
  const secondary = tokens[1]?.replace(/\s+/g, "").toLowerCase();

  const score = (item: T): number => {
    const main = item.mainKeyword.replace(/\s+/g, "").toLowerCase();
    const title = item.title.replace(/\s+/g, "").toLowerCase();
    const source = `${item.title} ${item.mainKeyword} ${item.subKeyword1} ${item.subKeyword2}`
      .replace(/\s+/g, "")
      .toLowerCase();
    let value = item._priorityScore;
    value += main.includes(primary) ? 200 : title.includes(primary) ? 120 : source.includes(primary) ? 70 : -250;
    if (secondary) {
      value += main.includes(secondary) ? 100 : title.includes(secondary) ? 70 : source.includes(secondary) ? 40 : -30;
    }
    return value;
  };

  return [...results].sort((a, b) => score(b) - score(a));
}

function mergeExternalSignalsWithVolumeGate(params: {
  externalSignals: KeywordOptionAnalysis["externalSignals"] | undefined;
  volumeSignal?: SearchVolumeSignal;
  volumeTier: VolumeGateFields["_volumeTier"] | undefined;
  gateNotes: string[];
}): KeywordOptionAnalysis["externalSignals"] | undefined {
  const { externalSignals, volumeSignal, volumeTier, gateNotes } = params;
  const notes = Array.from(
    new Set([
      ...(externalSignals?.notes ?? []),
      ...gateNotes,
      volumeTier ? `검색량 게이트 판정: ${volumeTier}` : "",
    ].filter(Boolean))
  );

  if (!externalSignals && !volumeSignal && notes.length === 0) return undefined;

  const searchVolume = volumeSignal
    ? [
        volumeSignal,
        ...((externalSignals?.searchVolume ?? []).filter(
          (signal) =>
            signal.keyword.replace(/\s+/g, "").toLowerCase() !==
            volumeSignal.keyword.replace(/\s+/g, "").toLowerCase()
        )),
      ]
    : externalSignals?.searchVolume ?? [];

  return {
    status: externalSignals?.status ?? (volumeSignal ? "available" : "unavailable"),
    provider: externalSignals?.provider ?? (volumeSignal ? "naver-searchad-volume-gate" : "volume-gate"),
    checkedAt: externalSignals?.checkedAt ?? new Date().toISOString(),
    searchVolume,
    relatedKeywords: externalSignals?.relatedKeywords ?? [],
    exposures: externalSignals?.exposures ?? [],
    notes,
  };
}

type AnalyzedKeyword = KeywordOption & Partial<VolumeGateFields> & {
  analysis: KeywordOptionAnalysis;
  validation: ReturnType<typeof validateKeywordOption>;
  _priorityScore: number;
};

function collectCandidateSearchSeeds(options: KeywordOption[]): string[] {
  const seen = new Set<string>();
  const seeds: string[] = [];

  for (const option of options) {
    for (const value of [option.mainKeyword, option.subKeyword1, option.subKeyword2]) {
      const seed = value.trim();
      const key = seed.replace(/\s+/g, "").toLowerCase();
      if (!seed || seen.has(key)) continue;
      seen.add(key);
      seeds.push(seed);
      if (seeds.length >= TARGET_RESULT_COUNT * 10) return seeds;
    }
  }

  return seeds;
}

function getExternalDemandScore(
  externalSignals: KeywordOptionAnalysis["externalSignals"] | undefined
): number {
  const volumes = externalSignals?.searchVolume ?? [];
  const bestTotal = Math.max(
    0,
    ...volumes.map((signal) => signal.monthlyTotalSearches ?? 0)
  );
  const bestTrend = volumes.some((signal) => signal.trend === "rising") ? 12 : 0;
  const bestCompetition = Math.max(
    0,
    ...volumes.map((signal) => getCompetitionScore(signal.competitionLabel))
  );
  const bestOpportunity = Math.max(
    0,
    ...volumes.map((signal) =>
      typeof signal.opportunityScore === "number" ? Math.round(signal.opportunityScore / 2) : 0
    )
  );
  const bestSeasonal = volumes.some((signal) => signal.seasonalFit === "high")
    ? 10
    : volumes.some((signal) => signal.seasonalFit === "medium")
      ? 4
      : 0;
  const measuredDemandBonus = volumes.some(
    (signal) => typeof signal.monthlyTotalSearches === "number" && signal.monthlyTotalSearches > 0
  )
    ? 35
    : -30;

  return (
    getMonthlyDemandScore(bestTotal) +
    bestTrend +
    bestCompetition +
    bestOpportunity +
    bestSeasonal +
    measuredDemandBonus
  );
}

function isCleanCandidate(option: AnalyzedKeyword): boolean {
  const issues = option.analysis.duplicateRisk?.issues ?? [];
  const competitorHit = issues.some(
    (issue) =>
      issue.code === "competitor-top-title-overlap" ||
      issue.code === "competitor-keyword-combination-overlap"
  );
  const sameStoreHit = issues.some(
    (issue) =>
      issue.code === "same-store-title-overlap" ||
      issue.code === "same-store-keyword-combination-overlap"
  );
  const crossBlogHit = issues.some(
    (issue) =>
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
  return !competitorHit && !sameStoreHit && !crossBlogHit;
}

function isDuplicateSignalFree(option: AnalyzedKeyword): boolean {
  return !hasRegisteredStoreOverlap(option);
}

function isBroadlyUsableCandidate(option: AnalyzedKeyword): boolean {
  return (
    option.validation.isValid &&
    option.title.includes(option.mainKeyword) &&
    !isAwkwardGeneratedTitle(option.title)
  );
}

function hasRegisteredStoreOverlap(option: AnalyzedKeyword): boolean {
  const issues = option.analysis.duplicateRisk?.issues ?? [];
  return issues.some(
    (issue) =>
      issue.code === "same-store-title-overlap" ||
      issue.code === "same-store-keyword-combination-overlap" ||
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
}

async function analyzeOptions(params: {
  rawOptions: Array<KeywordOption & Partial<VolumeGateFields>>;
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
  demandSignals?: SearchVolumeSignal[];
  topic?: string;
  productHeads?: string[];
  meshKeywordKeys?: Set<string>;
}): Promise<AnalyzedKeyword[]> {
  const {
    rawOptions,
    forbiddenList,
    referenceList,
    competitorList,
    demandSignals = [],
    topic,
    productHeads = [],
    meshKeywordKeys = new Set<string>(),
  } = params;

  return Promise.all(
    rawOptions.map(async (option) => {
      const validation = validateKeywordOption(option, forbiddenList, referenceList);
      const analysis = await buildKeywordAnalysis({
        option,
        forbiddenList,
        referenceList,
        competitorList,
      });
      const demandSignal = option._volumeSignal ?? findDemandSignalForKeyword(option.mainKeyword, demandSignals);
      const sameStoreThemeOverlap = countHistoryThemeOverlap(option, forbiddenList);
      const crossBlogThemeOverlap = countHistoryThemeOverlap(option, referenceList);
      const hasMeasuredDemand =
        typeof demandSignal?.monthlyTotalSearches === "number" &&
        demandSignal.monthlyTotalSearches > 0;
      return {
        ...option,
        analysis: demandSignal
          ? {
              ...analysis,
              externalSignals: {
                status: "available",
                provider: "naver-searchad-precheck",
                checkedAt: new Date().toISOString(),
                searchVolume: [demandSignal],
                relatedKeywords: [],
                exposures: [],
                notes: [
                  "후보 선별 전에 검색광고 키워드 도구에서 확인한 월간 검색량 신호입니다.",
                ],
              },
            }
          : analysis,
        validation,
        _priorityScore:
          getKeywordPriorityScore({ validation, analysis }) +
          getSearcherConversionQualityScore(option) +
          getTopicAlignmentScore(option, topic) +
          getProductHeadScore(option, productHeads) +
          getKeywordMeshScore(option, meshKeywordKeys) +
          getVolumeTierScore(option._volumeTier) +
          (demandSignal ? getDemandSignalScore(demandSignal) : 0) -
          (hasMeasuredDemand ? 0 : 18) -
          Math.min(45, sameStoreThemeOverlap * 15) -
          Math.min(30, crossBlogThemeOverlap * 4),
      };
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId, topic, refresh } = body as {
      shopId: string;
      categoryId: string;
      topic?: string;
      refresh?: boolean;
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

    const resultCacheKey = buildKeywordResultCacheKey({ shopId, categoryId, topic });
    const cachedResult = refresh ? null : await getCachedKeywordResultData(resultCacheKey);
    if (cachedResult) {
      return NextResponse.json({
        success: true,
        data: {
          ...cachedResult.data,
          cache: {
            status: "hit",
            checkedAt: cachedResult.checkedAt,
            month: getKeywordResultCacheMonth(),
          },
        },
      });
    }

    const requestedTopic = typeof topic === "string" ? topic.trim() : "";
    const topicPlan = planBlogTopic({
      shop,
      category,
      userTopic: requestedTopic,
    });
    const effectiveTopic = topicPlan.topic;
    const articleTopic = requestedTopic || topicPlan.thesis;
    const productHeads = getShopProductHeads({ shop, category });
    const productModifiers = getProductModifiers({
      categoryId: category.id,
      heads: productHeads,
    });
    const productModifiersByHead = getProductModifiersByHead({
      categoryId: category.id,
      heads: productHeads,
    });

    const competitorSeeds = [
      category.name,
      ...category.subcategories.slice(0, 3),
    ].filter(Boolean);

    const discoverySeeds = Array.from(
      new Set([
        ...buildKeywordDiscoverySeeds({
          shop,
          category,
          topic: effectiveTopic,
        }),
        ...buildKeywordMeshSeeds({
          shop,
          category,
          maxSeeds: 80,
        }),
        ...productHeads,
      ])
    );

    // RSS 이력, 경쟁 제목, 검색량 신호는 서로 독립적이므로 동시에 수집한다.
    // (이전에는 직렬로 호출해 네트워크 지연이 합산되며 응답이 느려졌다.)
    const [historyOutcome, competitorOutcome, demandOutcome] = await Promise.all([
      // RSS 이력 + 세션 저장소 이력 병합.
      // 임시저장만 수행하는 워크플로우 특성상 RSS 에는 시스템 생성물이 반영되지 않으므로
      // 세션 저장소의 최근 생성 이력을 타깃=forbidden / 나머지=reference 로 합쳐
      // 6개 매장 중복 방지 지침이 실데이터 기반으로 동작하도록 보정한다.
      (async () => {
        let forbiddenList: string[] = [];
        let referenceList: string[] = [];
        try {
          const rssResult = await fetchBlogTitles(shopId);
          forbiddenList = rssResult.forbiddenList;
          referenceList = rssResult.referenceList;
        } catch {
          // RSS 이력은 보조 신호이므로 실패해도 키워드 분석은 계속 진행한다.
        }
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
        return { forbiddenList, referenceList };
      })(),
      // 네이버 검색 실패 시 경쟁 제목 없이 진행
      fetchCompetitorTitles(competitorSeeds).catch(() => [] as string[]),
      // 검색량 + 블로그 문서수 조회 실패 시에도 기존 네이버 검색/트렌드 기반 생성은 계속한다.
      fetchKeywordOpportunitySignals(discoverySeeds)
        .catch(() => fetchKeywordDemandSignals(discoverySeeds))
        .catch(() => [] as SearchVolumeSignal[]),
    ]);

    const { forbiddenList, referenceList } = historyOutcome;
    let competitorList: string[] = competitorOutcome;
    let demandSignals: SearchVolumeSignal[] = demandOutcome;

    const strategyGuide = buildKeywordStrategyGuide({
      shop,
      category,
      topic: effectiveTopic,
      demandSignals,
    });

    const region = inferShopRegion(shop);
    const combinedSeedBatch = combineKeywords({
      categoryId: category.id,
      region,
      coreHeads: [...(BROAD_KEYWORD_HEADS[category.id] ?? []), ...productHeads],
      modifiers: [
        ...(BROAD_KEYWORD_TAILS[category.id] ?? []),
        ...topicPlan.preferredModifiers,
        ...productModifiers,
      ],
      coreModifiersByHead: {
        ...DEFAULT_CORES_BY_HEAD,
        ...productModifiersByHead,
      },
      maxModifiersPerHead: 6,
      maxCandidates: 90,
    });
    const productSeedBatch = buildProductKeywordOptions({
      shop,
      category,
      maxPerHead: 3,
    });
    const meshSeedBatch = buildKeywordMeshOptions({
      shop,
      category,
      maxCandidates: 120,
    });
    const meshKeywordKeys = new Set(meshSeedBatch.map(getKeywordOptionKey));
    const nonProductMeshKeywordKeys = new Set(
      meshSeedBatch
        .filter((option) => !matchesAnyProductHead(option, productHeads))
        .map(getKeywordOptionKey)
    );
    const fallbackBatch = dedupeKeywordOptions([
      ...meshSeedBatch,
      ...productSeedBatch,
      ...combinedSeedBatch,
      ...buildFallbackKeywordOptions({
        region,
        categoryId: category.id,
        demandSignals,
      }),
    ]);

    let baseCandidates = fallbackBatch;
    if (KEYWORD_AI_EXPANSION_ENABLED) {
      try {
        const gptCandidates = await generateKeywordCandidatesWithGpt({
          shopName: shop.name,
          region,
          categoryName: category.name,
          topic: effectiveTopic,
          demandSignals,
          strategyGuide,
          fallbackCandidates: fallbackBatch,
        });
        if (gptCandidates && gptCandidates.length > 0) {
          const seen = new Set<string>();
          baseCandidates = normalizeGeneratedOptions([...gptCandidates, ...fallbackBatch])
            .filter((candidate) => isCategoryAppropriateCandidate(category.id, candidate))
            .filter((candidate) => {
              const key = `${candidate.title}|${candidate.mainKeyword}`.trim();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
        }
      } catch {
        // GPT 후보 확장 실패 시 로컬 후보만 사용한다.
      }
    }

    const firstPrompt = buildCandidateEditingPrompt({
      targetStore: shop.name,
      category: category.name,
      candidates: baseCandidates.slice(0, 20),
      forbiddenList,
      referenceList,
      competitorList,
      strategyGuide,
    });

    let firstBatch: KeywordOption[] = [];
    let usedFallbackBatch = false;
    if (KEYWORD_AI_EXPANSION_ENABLED) {
      try {
        firstBatch = normalizeGeneratedOptions(
          await generateKeywords(firstPrompt, KEYWORD_FIRST_EDIT_TIMEOUT_MS)
        ).filter((candidate) => isCategoryAppropriateCandidate(category.id, candidate));
      } catch {
        firstBatch = normalizeGeneratedOptions(baseCandidates).filter((candidate) =>
          isCategoryAppropriateCandidate(category.id, candidate)
        );
        usedFallbackBatch = true;
      }
    } else {
      firstBatch = normalizeGeneratedOptions(baseCandidates).filter((candidate) =>
        isCategoryAppropriateCandidate(category.id, candidate)
      );
      usedFallbackBatch = true;
    }

    const firstBatchSeen = new Set<string>();
    firstBatch = [...firstBatch, ...normalizeGeneratedOptions(baseCandidates)]
      .filter((candidate) => isCategoryAppropriateCandidate(category.id, candidate))
      .filter((candidate) => {
        const key = `${candidate.title}|${candidate.mainKeyword}`;
        if (firstBatchSeen.has(key)) return false;
        firstBatchSeen.add(key);
        return true;
      })
      .slice(0, TARGET_RESULT_COUNT * 8);

    if (!Array.isArray(firstBatch) || firstBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: "키워드 후보를 생성하지 못했습니다. 입력 조건을 다시 확인해주세요." },
        { status: 500 }
      );
    }

    try {
      const candidateSeeds = collectCandidateSearchSeeds([...fallbackBatch, ...firstBatch]);
      const candidateDemandSignals = await fetchKeywordOpportunitySignals(candidateSeeds).catch(
        () => [] as SearchVolumeSignal[]
      );
      if (!KEYWORD_FAST_MODE) {
        const candidateCompetitorList = await fetchCompetitorTitles(candidateSeeds, 10);
        competitorList = Array.from(new Set([...competitorList, ...candidateCompetitorList]));
      }
      demandSignals = mergeDemandSignals(demandSignals, candidateDemandSignals);
    } catch {
      // 후보 키워드별 상위 제목/검색량 조회 실패 시 기존 카테고리 기반 신호만 사용한다.
    }

    const needsTitleRepair =
      KEYWORD_AI_EXPANSION_ENABLED &&
      firstBatch.length < TARGET_RESULT_COUNT * 2 ||
      (KEYWORD_AI_EXPANSION_ENABLED &&
        firstBatch.some((candidate) => isAwkwardGeneratedTitle(candidate.title)));

    if (needsTitleRepair) {
      try {
        const repairPrompt = buildHumanTitleRepairPrompt({
          category: category.name,
          candidates: firstBatch.slice(0, TARGET_RESULT_COUNT * 4),
          forbiddenList,
          referenceList,
          competitorList,
        });
        const repairedBatch = normalizeGeneratedOptions(
          await generateKeywords(repairPrompt, KEYWORD_REPAIR_TIMEOUT_MS)
        ).filter((candidate) => isCategoryAppropriateCandidate(category.id, candidate));
        if (repairedBatch.length >= Math.min(TARGET_RESULT_COUNT, firstBatch.length)) {
          const repairedSeen = new Set<string>();
          firstBatch = [...repairedBatch, ...firstBatch]
            .filter((candidate) => {
              const key = `${candidate.title}|${candidate.mainKeyword}|${candidate.subKeyword1}|${candidate.subKeyword2}`;
              if (repairedSeen.has(key)) return false;
              repairedSeen.add(key);
              return true;
            })
            .slice(0, TARGET_RESULT_COUNT * 8);
        }
      } catch {
        // 제목 보정 실패 시 1차 편집 후보로 계속 진행한다.
      }
    }

    const firstVolumeGate = applyVolumeGate(firstBatch, demandSignals);
    firstBatch = firstVolumeGate.candidates;
    const volumeGateNotes = firstVolumeGate.notes;

    const analyzed = await analyzeOptions({
      rawOptions: firstBatch,
      forbiddenList,
      referenceList,
      competitorList,
      demandSignals,
      topic: effectiveTopic,
      productHeads,
      meshKeywordKeys,
    });

    let cleanCandidates = analyzed.filter(isCleanCandidate);

    const broadlyUsableCount = analyzed.filter(isBroadlyUsableCandidate).length;

    if (
      KEYWORD_AI_EXPANSION_ENABLED &&
      !usedFallbackBatch &&
      cleanCandidates.length < 4 &&
      broadlyUsableCount < TARGET_RESULT_COUNT
    ) {
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
          strategyGuide,
        });
        const retryBatch = await generateKeywords(retryPrompt, KEYWORD_RETRY_TIMEOUT_MS);
        if (Array.isArray(retryBatch) && retryBatch.length > 0) {
          const retryGate = applyVolumeGate(retryBatch, demandSignals);
          const retryAnalyzed = await analyzeOptions({
            rawOptions: retryGate.candidates,
            forbiddenList,
            referenceList,
            competitorList,
            demandSignals,
            topic: effectiveTopic,
            productHeads,
            meshKeywordKeys,
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

    // 등록된 매장끼리 제목/관점이 겹치는 후보는 부족분 채우기에서도 제외한다.
    // 경쟁 제목 중복은 경고 후보가 될 수 있지만, 같은 네트워크 매장 중복은 결과에 넣지 않는다.
    const noStoreOverlapCandidates = analyzed.filter(
      (item) => !hasRegisteredStoreOverlap(item)
    );
    const strictSafeCandidates = noStoreOverlapCandidates
      .filter(isDuplicateSignalFree)
      .filter((item) => item.validation.isValid);

    // 중복 제거는 최종 10개로 자르기 전에 넓은 후보 풀에서 수행한다.
    // 그래야 검색량 점수가 비슷한 후보들이 같은 소재로 몰려도 대체 후보를 살릴 수 있다.
    let rankedPool: AnalyzedKeyword[] = [...strictSafeCandidates].sort(
      (a, b) => b._priorityScore - a._priorityScore
    );

    if (rankedPool.length < TARGET_RESULT_COUNT) {
      const selectedKeys = new Set(
        rankedPool.map((item) => `${item.title}|${item.mainKeyword}`)
      );
      const backfill = noStoreOverlapCandidates
        .filter((item) => !selectedKeys.has(`${item.title}|${item.mainKeyword}`))
        .filter(isDuplicateSignalFree)
        .filter((item) => item.validation.isValid)
        .sort((a, b) => b._priorityScore - a._priorityScore)
        .slice(0, TARGET_RESULT_COUNT * 2);
      rankedPool = [...rankedPool, ...backfill];
    }

    if (rankedPool.length < TARGET_RESULT_COUNT) {
      const selectedKeys = new Set(
        rankedPool.map((item) => `${item.title}|${item.mainKeyword}`)
      );
      const emergencyBackfill = noStoreOverlapCandidates
        .filter((item) => !selectedKeys.has(`${item.title}|${item.mainKeyword}`))
        .filter(isBroadlyUsableCandidate)
        .sort((a, b) => b._priorityScore - a._priorityScore)
        .slice(0, TARGET_RESULT_COUNT * 2);
      rankedPool = [...rankedPool, ...emergencyBackfill];
    }

    const analyzedFallback = await analyzeOptions({
      rawOptions: applyVolumeGate(
        normalizeGeneratedOptions(fallbackBatch).filter((candidate) =>
          isCategoryAppropriateCandidate(category.id, candidate)
        ),
        demandSignals
      ).candidates,
      forbiddenList,
      referenceList,
      competitorList,
      demandSignals,
      topic: effectiveTopic,
      productHeads,
      meshKeywordKeys,
    });
    const safeFallback = [...analyzedFallback, ...noStoreOverlapCandidates]
      .filter((item) => !hasRegisteredStoreOverlap(item))
      .filter(isBroadlyUsableCandidate)
      .sort((a, b) => b._priorityScore - a._priorityScore);

    const representationPool = [...safeFallback, ...analyzedFallback, ...noStoreOverlapCandidates, ...analyzed].sort(
      (a, b) => b._priorityScore - a._priorityScore
    );
    let diverseRankedResults = appendEmergencyDiverseBackfill(
      appendCategoryBackfill(
      pickIntentBalancedKeywordResults(rankedPool),
      rankedPool,
      safeFallback
      ),
      representationPool
    );
    diverseRankedResults = ensureProductRepresentation(
      diverseRankedResults,
      representationPool,
      productHeads,
      category.id === "eye-info" || category.id === "glasses-story" ? 1 : 2
    );
    diverseRankedResults = ensureKeywordMeshRepresentation(
      diverseRankedResults,
      representationPool,
      nonProductMeshKeywordKeys,
      productHeads,
      category.id === "eye-info" || category.id === "glasses-story" ? 2 : 3
    );
    diverseRankedResults = dedupeFinalKeywordResults(diverseRankedResults, representationPool, productHeads);
    const topForExternalSignals = diverseRankedResults.slice(0, EXTERNAL_SIGNAL_TOP_K);

    // 후보별 외부 검색 신호 조회를 병렬로 수행한다. (이전에는 직렬 for 루프라
    // 후보 수에 비례해 네트워크 지연이 합산됐다.)
    const externalSignalEntries: Array<
      readonly [string, KeywordOptionAnalysis["externalSignals"] | undefined]
    > = await Promise.all(
      topForExternalSignals.map(
        async (
          item
        ): Promise<readonly [string, KeywordOptionAnalysis["externalSignals"] | undefined]> => {
          try {
            const externalSignals = await getExternalSearchSignals({
              title: item.title,
              mainKeyword: item.mainKeyword,
              subKeyword1: item.subKeyword1,
              subKeyword2: item.subKeyword2,
            });
            if (
              externalSignals.provider === "naver-openapi" &&
              item.analysis.externalSignals?.searchVolume?.length
            ) {
              return [item.title, item.analysis.externalSignals] as const;
            }
            return [item.title, externalSignals] as const;
          } catch {
            return [item.title, undefined] as const;
          }
        }
      )
    );

    const externalSignalMap = new Map(externalSignalEntries);

    const demandRankedResults = [...diverseRankedResults].sort((a, b) => {
      const aScore = a._priorityScore + getExternalDemandScore(externalSignalMap.get(a.title));
      const bScore = b._priorityScore + getExternalDemandScore(externalSignalMap.get(b.title));
      return bScore - aScore;
    });
    const topicRankedResults = prioritizeTopicFocusedResults(demandRankedResults, effectiveTopic);

    const smartBlockEntries = await Promise.all(
      topicRankedResults.slice(0, SMART_BLOCK_TOP_K).map(async (item) => {
        try {
          return [item.title, await inferSmartBlockSubKeywords(item.mainKeyword)] as const;
        } catch {
          return [item.title, undefined] as const;
        }
      })
    );
    const smartBlockMap = new Map(smartBlockEntries);

    const results = topicRankedResults.map((item) => {
      const {
        _priorityScore,
        _volumeTier,
        _volumeSignal,
        _volumeSaturation,
        analysis,
        ...rest
      } = item;
      void _priorityScore;
      const volumeSignal = _volumeSignal ?? findDemandSignalForKeyword(item.mainKeyword, demandSignals);
      const volumeTier = _volumeTier ?? "unknown";
      const saturation = _volumeSaturation ?? volumeSignal?.competitionRatio ?? null;
      const smartBlock = smartBlockMap.get(item.title);
      const recommendedSmartBlockCandidate = smartBlock?.subKeywordCandidates.find(
        (candidate) =>
          candidate.keyword.replace(/\s+/g, "").toLowerCase() ===
          smartBlock.recommendedTitleKeyword.replace(/\s+/g, "").toLowerCase()
      );
      const suggestedTitleKeyword =
        smartBlock &&
        smartBlock.recommendedTitleKeyword.replace(/\s+/g, "").toLowerCase() !==
          item.mainKeyword.replace(/\s+/g, "").toLowerCase() &&
        (recommendedSmartBlockCandidate?.titleHits ?? 0) >= 2
          ? smartBlock.recommendedTitleKeyword
          : undefined;

      return {
        ...rest,
        volumeTier,
        monthlyTotalSearches: volumeSignal?.monthlyTotalSearches ?? null,
        blogDocumentCount: volumeSignal?.blogDocumentCount ?? null,
        competitionRatio: saturation,
        opportunityScore: volumeSignal?.opportunityScore ?? null,
        suggestedTitleKeyword,
        analysis: {
          ...analysis,
          externalSignals: mergeExternalSignalsWithVolumeGate({
            externalSignals: externalSignalMap.get(item.title) ?? analysis.externalSignals,
            volumeSignal,
            volumeTier,
            gateNotes: volumeGateNotes,
          }),
          ...(smartBlock ? { smartBlock } : {}),
        },
      };
    });

    const responseData: KeywordResultResponseData = {
      results,
      notes: volumeGateNotes,
      topic: articleTopic,
      topicLabel: effectiveTopic,
      topicPlan,
    };

    await saveKeywordResultData(resultCacheKey, responseData);

    return NextResponse.json({
      success: true,
      data: {
        ...responseData,
        cache: {
          status: "miss",
          month: getKeywordResultCacheMonth(),
        },
      },
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
