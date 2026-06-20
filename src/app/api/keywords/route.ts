import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { generateKeywords, reviseKeywordTitles, selectCategoryFitIndices } from "@/lib/ai/claude";
import {
  buildTitlePolishPrompt,
  buildSeedTitlePrompt,
  buildCategoryFitPrompt,
  TITLE_PATTERN_GUIDE,
} from "@/lib/prompts/titlePrompt";
import { OPTICAL_ACCURACY_GUIDE } from "@/lib/domain/opticalDomainRules";
import { getCategoryDepthDimensions } from "@/lib/keywords/categoryDepth";
import { generateKeywordCandidatesWithGpt } from "@/lib/ai/openaiKeywords";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import { keywordsSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";
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
import { getCorpusTitles } from "@/lib/analysis/titleCorpus";
import {
  getTopExposedKeywordKeys,
  normalizeExposureKeyword,
} from "@/lib/blogops/insights";
import { analyzeCompetitorMorphology } from "@/lib/analysis/competitorMorphology";
import { analyzeTitleSimilarity } from "@/lib/analysis/titleSimilarity";
import { combineKeywords } from "@/lib/keywords/keywordCombiner";
import {
  buildKeywordMeshOptions,
  buildKeywordMeshSeeds,
} from "@/lib/keywords/keywordMesh";
import {
  buildProductKeywordOptions,
  containsAnyKnownBrand,
  containsUnregisteredBrand,
  getProductModifiers,
  getProductModifiersByHead,
  getShopProductHeads,
} from "@/lib/keywords/productKeywordCatalog";
import {
  applyVolumeGate,
  normalizeKeywordKey,
  type VolumeGateFields,
} from "@/lib/keywords/volumeGate";
import { MECHANICAL_TITLE_PATTERNS } from "@/lib/keywords/naverTitleSkill";
import { listSessions } from "@/lib/storage/sessionStore";
import { planBlogTopic } from "@/lib/topics/topicPlanner";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { analyzeNetworkDuplicateRisk } from "@/lib/validation/networkDuplicateAnalyzer";
import { titleContainsMainKeyword, validateKeywordOption } from "@/lib/validation/keywordRules";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import type { KeywordOption, KeywordOptionAnalysis, SearchVolumeSignal } from "@/types";

export const maxDuration = 360;
const TARGET_RESULT_COUNT = 10;
// 건강한 런도 백필 한계로 9개에서 멈추는 경우가 잦다. 캐시 조건이 엄격히 10이면
// 그런 런이 저장되지 않아 매 호출이 새 라이브 런이 되고(분산↑), 자기잠식 제거가 겹친
// 얇은 런에서 2개로 붕괴할 수 있다. "충분히 좋은" 런(>= MIN)은 저장·재사용한다.
const KEYWORD_RESULT_MIN_CACHEABLE = 7;
const KEYWORD_FAST_MODE = process.env.KEYWORD_FAST_MODE !== "0";
const KEYWORD_AI_EXPANSION_ENABLED = process.env.KEYWORD_AI_EXPANSION !== "0";
const KEYWORD_GPT_EXPANSION_ENABLED = process.env.KEYWORD_GPT_EXPANSION !== "0";
// LLM 후보 수집은 codex CLI 프로세스를 spawn한다. 동시에 너무 많이 띄우면
// Windows 리소스/구독 동시요청 한도를 초과해 spawn이 실패한다(os error 1453).
// 그래서 한 번에 띄우는 프로세스 수(concurrency)와 호출당 요청 개수, 재시도 라운드 수를
// 분리해서 제한하고, 부족분만 라운드를 늘려 채운다.
const KEYWORD_GPT_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.KEYWORD_GPT_CONCURRENCY) || 2)
);
const KEYWORD_GPT_PER_CALL = Math.max(
  1,
  Math.min(8, Number(process.env.KEYWORD_GPT_PER_CALL) || 4)
);
const KEYWORD_GPT_MAX_ROUNDS = Math.max(
  1,
  Math.min(8, Number(process.env.KEYWORD_GPT_MAX_ROUNDS) || 6)
);
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
const KEYWORD_TITLE_POLISH_TIMEOUT_MS = 90_000;
const KEYWORD_CATEGORY_FIT_TIMEOUT_MS = 60_000;
const KEYWORD_RESULT_CACHE_ENABLED = process.env.KEYWORD_RESULT_CACHE !== "0";
// v18: rule6 시리즈 허용(다른 관점) + 테마 감점 완화 + 자기잠식 가드 — 이전 결과 무효화.
// v19: 합성 헤드·비검색 조합 억제(GPT 프롬프트) + 붕괴 floor 3종 + 제목 끝맺음 계열 정규화.
// v20: 롱테일 우선→실볼륨 우선 전환 + 실검색어 고정(검색광고 목록 우선) + 소재 군집 쏠림 금지.
// v21: 안경이야기 범위 확장(관리 매뉴얼→안경·안경원 전반 이야기) — 스타일·상황·경험·트렌드 군집 시드/게이트 추가.
// v22: 제목 폴리시 자연스러움 강화 — 도식 명사 스택("~순서/~법") 금지, 사람 말투(평서·조건·질문형)로.
// v23: 개수 안정화 — 부족분을 실볼륨 시드에 제목 생성해 채우는 복구 백필(7~10 변동 해소).
// v24: 안경렌즈 카테고리에 콘택트렌즈·선글라스 누수 차단 + "이름에 쓰기" 류 비문 제목 거름 — 이전 결과 무효화.
// v25: 제목 완성도 복구(v23 프롬프트) — 종속절 단독 종결 금지·중립 약속어(차이/종류/기준/방법 등) 마무리 재허용·끝맺음 계열 분산. "쓰다 만 제목" 해소 — 이전 결과 무효화.
// v26: 약속어 의미 규율(차이=같은축 두종류만·가짜비교 금지, 기준=막연종결 금지) + 브랜드명/전문수치(베이스커브·함수율·산소투과율) 후보 드롭 + 비변별 직경 드롭 + 코퍼스 시드 정밀화 — 이전 결과 무효화.
// v27: 제목 "결정론 가드" 전면 보강 — v26/c22c44c 등이 프롬프트(LLM 지시)뿐이라 확률적으로 새던 것을
//      isAwkwardGeneratedTitle(전 카테고리 공유 게이트)에서 직접 차단. ① 막연한 채움 끝맺음(보는 부분/확인할 부분/보는 순서),
//      ② 미완성 조건절(~다면/~라면/~려면), ③ 비문 오타(어떡할/콘안경), ④ 전문용어 재유입(명시야·누진대·아베수·색수차·굴절률·아이포인트·함수율·455nm).
//      이전 v26 캐시(frames 등) 무효화·재생성.
const KEYWORD_RESULT_CACHE_VERSION = 27;
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
  const entry = cache.months[month]?.[key] ?? null;
  if (!entry || entry.data.results.length < KEYWORD_RESULT_MIN_CACHEABLE) return null;
  return entry;
}

async function saveKeywordResultData(
  key: string,
  data: KeywordResultResponseData,
  month = getKeywordResultCacheMonth()
): Promise<void> {
  if (!KEYWORD_RESULT_CACHE_ENABLED) return;
  if (data.results.length < KEYWORD_RESULT_MIN_CACHEABLE) return;
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

// 같은 대상을 가리키는 헤드 동의어. 정규화하지 않으면 "안경알 두께"와 "안경렌즈 두께"가
// 다른 축으로 잡혀 최종 결과에 같은 소재가 몰린다.
const MAIN_AXIS_SYNONYMS: Record<string, string> = {
  안경알: "안경렌즈",
  렌즈알: "안경렌즈",
  블루라이트렌즈: "블루라이트",
  블루라이트차단: "블루라이트",
};

function inferMainKeywordAxis(option: KeywordOption): string {
  const main = splitKeyword(option.mainKeyword);
  if (!main) return option.mainKeyword.trim();

  const [head, core] = main;
  const axis = isRegionWord(head) ? core : head;
  return MAIN_AXIS_SYNONYMS[axis] ?? axis;
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

function stripKoreanParticle(word: string): string {
  if (word === "어린이") return word;
  if (word === "차이로") return "차이";
  return word
    .replace(/(으로|부터|까지|처럼|보다|에서)$/g, "")
    .replace(/(과|와|을|를|은|는|이|가|의)$/g, "");
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
        title: "",
        mainKeyword: `어린이시력 검사`,
        subKeyword1: `어린이시력 근시`,
        subKeyword2: `어린이시력 관리`,
      },
      {
        title: "",
        mainKeyword: "어린이시력 관리",
        subKeyword1: "어린이시력 검사",
        subKeyword2: "어린이시력 근시",
      }
    );
  }

  if ((month === 4 || month === 5) && (categoryId === "eye-info" || categoryId === "lenses")) {
    options.push(
      {
        title: "",
        mainKeyword: `어린이시력 검사`,
        subKeyword1: `어린이시력 근시`,
        subKeyword2: `어린이시력 관리`,
      },
      {
        title: "",
        mainKeyword: "안구건조 증상",
        subKeyword1: "안구건조 원인",
        subKeyword2: "안구건조 관리",
      }
    );
  }

  if ((month === 4 || month === 5) && categoryId === "progressive") {
    options.push({
      title: "",
      mainKeyword: `노안안경 부모님`,
      subKeyword1: `노안안경 시야`,
      subKeyword2: `노안안경 검사`,
    });
  }

  if (month >= 6 && month <= 8) {
    if (categoryId === "contacts") {
      options.push(
        {
          title: "",
          mainKeyword: `렌즈건조 여름`,
          subKeyword1: `렌즈건조 착용`,
          subKeyword2: `렌즈건조 관리`,
        },
        {
          title: "",
          mainKeyword: "원데이렌즈 착용시간",
          subKeyword1: "원데이렌즈 건조",
          subKeyword2: "원데이렌즈 관리",
        }
      );
    }
    if (categoryId === "lenses") {
      options.push({
        title: "",
        mainKeyword: `변색렌즈 자외선`,
        subKeyword1: `변색렌즈 야외`,
        subKeyword2: `변색렌즈 안경`,
      });
    }
  }

  if (month >= 10 || month <= 2) {
    if (categoryId === "glasses-story") {
      options.push({
        title: "",
        mainKeyword: `안경김서림 겨울`,
        subKeyword1: `안경김서림 관리`,
        subKeyword2: `안경김서림 세척`,
      });
    }
    if (categoryId === "eye-info" || categoryId === "contacts") {
      options.push({
        title: "",
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
// 키워드 나열형, 같은 토큰 반복, 슬래시 나열만 차단한다.
function isAwkwardGeneratedTitle(title: string): boolean {
  return (
    MECHANICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title)) ||
    // 형식 금지: 쉼표·이모지·번호목록/불릿 마커
    /[,，、]/.test(title) ||
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(title) ||
    /(^|\s)(\d+[.)]|[①-⑩]|[-*•])\s/.test(title) ||
    // 의미 붕괴 비문: "변색렌즈 이름에 쓰기 전" 처럼 키워드를 '이름'으로 오해해 만든 제목
    /이름[을에는]\s*(쓰|적|넣|붙)/.test(title) ||
    // 같은 단어가 두 번 들어간 스팸성 제목
    /(확인 확인|기준 기준|선택 선택|관리 관리|검사 검사|차이 차이|원인 원인)/.test(title) ||
    // "A와 B 확인/기준/점검" 식 키워드 나열
    /\S+\s*(와|과)\s+\S+\s+(확인|기준|점검)$/.test(title) ||
    // 슬래시 나열
    /\S\s*\/\s*\S/.test(title) ||
    // [완성도 결정론 가드 v27] LLM이 프롬프트(완성도 규칙)를 안 지킨 경우를 잡는다.
    // 프롬프트만으로는 확률적으로 새므로, 화면에서 실제로 통과한 실패 유형만 정밀 차단한다.
    //
    // (1) 막연한 채움 끝맺음: "보는 부분 / 확인할 부분 / 보는 순서" 처럼 구체성 없이
    //     쓰다 만 느낌으로 끝나는 제목. (단 "~보는 법/~고르는 법/~줄이는 방법"은 자연스러우니 건드리지 않음)
    /(보는|볼|확인할|확인하는|체크할|살펴볼|챙길|봐야 할|봐야할)\s*(부분|순서)$/.test(title.trim()) ||
    // (2) 미완성 조건절 종결: "~다면/~라면/~려면"으로 끊겨 다음 말이 필요한 종속절 마무리
    //     (v26 프롬프트가 "~한다면"을 실패 예시로 명시한 바로 그 유형)
    /(다면|라면|려면|으려면|는다면)$/.test(title.trim()) ||
    // (3) 비문·오타 의문사: "어떡할 때/어케/어캐" 같은 깨진 표현, "콘안경" 같은 합성 오류
    /(어떡할|어떻할|어케|어캐|어캤|뭣할|머할|콘안경)/.test(title) ||
    // (4) 전문용어 결정론 차단: c22c44c가 금지 목록을 프롬프트에만 넣어 '명시야' 등이 재유입됐다.
    //     손님이 검색하지 않는 명백한 전문어만(오탐 0) 코드에서 직접 거른다.
    //     (고굴절·압축렌즈 등 손님이 쓰는 상품어는 매칭되지 않음: '굴절률'≠'고굴절', '함수율'≠'함수')
    /(\d+\s*nm|아베수|색수차|굴절률|명시야|누진대|아이포인트|함수율)/.test(title)
  );
}

const FALLBACK_KEYWORD_SETS: Record<
  string,
  Array<{ main: string; sub1: string; sub2: string }>
> = {
  progressive: [
    { main: "누진렌즈 적응", sub1: "누진렌즈 울렁임", sub2: "누진렌즈 시야" },
    { main: "누진다초점 렌즈", sub1: "누진다초점 적응", sub2: "누진다초점 시야" },
    { main: "노안안경 선택", sub1: "노안안경 돋보기", sub2: "노안안경 시야" },
    { main: "다초점렌즈 적응", sub1: "다초점렌즈 울렁임", sub2: "다초점렌즈 운전" },
    { main: "돋보기 불편", sub1: "돋보기 시야", sub2: "돋보기 노안" },
    { main: "누진렌즈 운전", sub1: "누진렌즈 야간", sub2: "누진렌즈 시야" },
    { main: "누진렌즈 도수", sub1: "누진렌즈 검사", sub2: "누진렌즈 시야" },
    { main: "누진다초점 안경", sub1: "누진다초점 적응", sub2: "누진다초점 시야" },
    { main: "노안안경 도수", sub1: "노안안경 검사", sub2: "노안안경 시야" },
    { main: "노안안경 착용감", sub1: "노안안경 돋보기", sub2: "노안안경 시야" },
    { main: "중근용렌즈 선택", sub1: "중근용렌즈 실내", sub2: "중근용렌즈 업무" },
    { main: "사무용렌즈 선택", sub1: "사무용렌즈 컴퓨터", sub2: "사무용렌즈 시야" },
    { main: "실내용누진 선택", sub1: "실내용누진 업무", sub2: "실내용누진 시야" },
    { main: "누진렌즈 울렁임", sub1: "누진렌즈 적응", sub2: "누진렌즈 시야" },
    { main: "다초점렌즈 운전", sub1: "다초점렌즈 적응", sub2: "다초점렌즈 시야" },
    { main: "중근용렌즈 업무", sub1: "중근용렌즈 실내", sub2: "중근용렌즈 시야" },
    { main: "실내용누진 시야", sub1: "실내용누진 업무", sub2: "실내용누진 적응" },
    { main: "노안렌즈 선택", sub1: "노안렌즈 시야", sub2: "노안렌즈 검사" },
    { main: "노안렌즈 적응", sub1: "노안렌즈 울렁임", sub2: "노안렌즈 시야" },
  ],
  lenses: [
    { main: "렌즈교체 기준", sub1: "렌즈교체 시기", sub2: "렌즈교체 코팅" },
    { main: "안경렌즈 압축", sub1: "안경렌즈 두께", sub2: "안경렌즈 무게" },
    { main: "블루라이트렌즈 선택", sub1: "블루라이트렌즈 눈피로", sub2: "블루라이트렌즈 코팅" },
    { main: "근시억제렌즈 검사", sub1: "근시억제렌즈 어린이", sub2: "근시억제렌즈 도수" },
    { main: "근시완화렌즈 검사", sub1: "근시완화렌즈 어린이", sub2: "근시완화렌즈 도수" },
    { main: "안경렌즈 코팅", sub1: "안경렌즈 흠집", sub2: "안경렌즈 관리" },
    { main: "안경렌즈 두께", sub1: "안경렌즈 압축", sub2: "안경렌즈 도수" },
    { main: "변색렌즈 선택", sub1: "변색렌즈 자외선", sub2: "변색렌즈 실내" },
    { main: "누진렌즈 시야", sub1: "누진렌즈 적응", sub2: "누진렌즈 운전" },
    { main: "렌즈코팅 손상", sub1: "렌즈코팅 얼룩", sub2: "렌즈코팅 관리" },
    { main: "안경렌즈 교체", sub1: "안경렌즈 코팅", sub2: "안경렌즈 흠집" },
    { main: "자외선렌즈 선택", sub1: "자외선렌즈 야외", sub2: "자외선렌즈 눈부심" },
    { main: "운전렌즈 선택", sub1: "운전렌즈 야간", sub2: "운전렌즈 눈부심" },
    { main: "사무용렌즈 선택", sub1: "사무용렌즈 컴퓨터", sub2: "사무용렌즈 눈피로" },
    { main: "고굴절렌즈 선택", sub1: "고굴절렌즈 두께", sub2: "고굴절렌즈 도수" },
    { main: "렌즈압축 선택", sub1: "렌즈압축 두께", sub2: "렌즈압축 무게" },
    { main: "안경렌즈 선택", sub1: "안경렌즈 도수", sub2: "안경렌즈 두께" },
    { main: "안경렌즈 관리", sub1: "안경렌즈 코팅", sub2: "안경렌즈 얼룩" },
    { main: "렌즈두께 선택", sub1: "렌즈두께 도수", sub2: "렌즈두께 압축" },
    { main: "기능렌즈 선택", sub1: "기능렌즈 눈부심", sub2: "기능렌즈 야외" },
  ],
  frames: [
    { main: "안경피팅 착용감", sub1: "안경피팅 코패드", sub2: "안경피팅 균형" },
    { main: "안경흘러내림 원인", sub1: "안경흘러내림 코패드", sub2: "안경흘러내림 피팅" },
    { main: "가벼운안경 선택", sub1: "가벼운안경 소재", sub2: "가벼운안경 착용감" },
    { main: "티타늄안경 선택", sub1: "티타늄안경 무게", sub2: "티타늄안경 착용감" },
    { main: "울템안경 특징", sub1: "울템안경 무게", sub2: "울템안경 탄성" },
    { main: "뿔테안경 얼굴형", sub1: "뿔테안경 인상", sub2: "뿔테안경 사이즈" },
    { main: "금속테안경 착용감", sub1: "금속테안경 코패드", sub2: "금속테안경 무게" },
    { main: "안경테 얼굴형", sub1: "안경테 사이즈", sub2: "안경테 브릿지" },
    { main: "안경테 소재", sub1: "안경테 무게", sub2: "안경테 관리" },
    { main: "안경코받침 교체", sub1: "안경코받침 자국", sub2: "안경코받침 소재" },
    { main: "안경귀통증 원인", sub1: "안경귀통증 피팅", sub2: "안경귀통증 착용감" },
    { main: "안경테 변형", sub1: "안경테 보관", sub2: "안경테 피팅" },
    { main: "안경사이즈 선택", sub1: "안경사이즈 얼굴형", sub2: "안경사이즈 착용감" },
    { main: "하금테안경 인상", sub1: "하금테안경 얼굴형", sub2: "하금테안경 착용감" },
    { main: "무테안경 관리", sub1: "무테안경 나사", sub2: "무테안경 렌즈" },
    { main: "안경다리 피팅", sub1: "안경다리 균형", sub2: "안경다리 귀통증" },
    { main: "베타티타늄안경 선택", sub1: "베타티타늄안경 탄성", sub2: "베타티타늄안경 무게" },
    { main: "메탈안경 관리", sub1: "메탈안경 변형", sub2: "메탈안경 착용감" },
    { main: "반무테안경 선택", sub1: "반무테안경 렌즈", sub2: "반무테안경 나사" },
    { main: "안경브릿지 선택", sub1: "안경브릿지 얼굴형", sub2: "안경브릿지 착용감" },
    { main: "안경테컬러 선택", sub1: "안경테컬러 피부톤", sub2: "안경테컬러 인상" },
  ],
  contacts: [
    { main: "렌즈충혈 원인", sub1: "렌즈충혈 착용", sub2: "렌즈충혈 건조" },
    { main: "렌즈건조 원인", sub1: "렌즈건조 착용", sub2: "렌즈건조 관리" },
    { main: "난시렌즈 선택", sub1: "난시렌즈 착용", sub2: "난시렌즈 검사" },
    { main: "소프트렌즈 착용", sub1: "소프트렌즈 건조", sub2: "소프트렌즈 관리" },
    { main: "원데이렌즈 교체", sub1: "원데이렌즈 위생", sub2: "원데이렌즈 착용" },
    { main: "하드렌즈 관리", sub1: "하드렌즈 세척", sub2: "하드렌즈 보관" },
    { main: "컬러렌즈 착용", sub1: "컬러렌즈 건조", sub2: "컬러렌즈 검사" },
    { main: "멀티포컬렌즈 적응", sub1: "멀티포컬렌즈 시야", sub2: "멀티포컬렌즈 착용" },
    { main: "렌즈이물감 원인", sub1: "렌즈이물감 건조", sub2: "렌즈이물감 착용" },
    { main: "렌즈세척 방법", sub1: "렌즈세척 위생", sub2: "렌즈세척 보관" },
    { main: "장시간렌즈 착용", sub1: "장시간렌즈 건조", sub2: "장시간렌즈 관리" },
    { main: "렌즈검사 기준", sub1: "렌즈검사 시력", sub2: "렌즈검사 착용" },
    { main: "렌즈착용 시간", sub1: "렌즈착용 건조", sub2: "렌즈착용 관리" },
    { main: "렌즈관리 습관", sub1: "렌즈관리 세척", sub2: "렌즈관리 보관" },
    { main: "렌즈보관 방법", sub1: "렌즈보관 위생", sub2: "렌즈보관 케이스" },
    { main: "렌즈교체 주기", sub1: "렌즈교체 위생", sub2: "렌즈교체 착용" },
    { main: "난시렌즈 검사", sub1: "난시렌즈 시력", sub2: "난시렌즈 착용" },
    { main: "원데이렌즈 위생", sub1: "원데이렌즈 교체", sub2: "원데이렌즈 착용" },
    { main: "콘택트렌즈 검사", sub1: "콘택트렌즈 시력", sub2: "콘택트렌즈 착용" },
    { main: "렌즈건조 관리", sub1: "렌즈건조 착용", sub2: "렌즈건조 습관" },
    { main: "렌즈돌아감 원인", sub1: "렌즈돌아감 난시", sub2: "렌즈돌아감 착용" },
    { main: "렌즈흐림 원인", sub1: "렌즈흐림 건조", sub2: "렌즈흐림 세척" },
    { main: "렌즈빠짐 원인", sub1: "렌즈빠짐 착용", sub2: "렌즈빠짐 검사" },
    { main: "토릭렌즈 검사", sub1: "토릭렌즈 난시", sub2: "토릭렌즈 착용" },
    { main: "서클렌즈 직경", sub1: "서클렌즈 착용감", sub2: "서클렌즈 건조" },
    { main: "투명렌즈 착용", sub1: "투명렌즈 건조", sub2: "투명렌즈 검사" },
  ],
  "eye-info": [
    { main: "안구건조 원인", sub1: "안구건조 증상", sub2: "안구건조 관리" },
    { main: "눈초점 흐림", sub1: "눈초점 피로", sub2: "눈초점 검사" },
    { main: "어린이시력 관리", sub1: "어린이시력 검사", sub2: "어린이시력 근시" },
    { main: "눈피로 원인", sub1: "눈피로 습관", sub2: "눈피로 검사" },
    { main: "시력검사 시기", sub1: "시력검사 도수", sub2: "시력검사 난시" },
    { main: "야간시력 흐림", sub1: "야간시력 운전", sub2: "야간시력 검사" },
    { main: "눈충혈 원인", sub1: "눈충혈 건조", sub2: "눈충혈 렌즈" },
    { main: "어린이근시 확인", sub1: "어린이근시 검사", sub2: "어린이근시 관리" },
    { main: "자외선 눈", sub1: "자외선 렌즈", sub2: "자외선 차단" },
    { main: "난시 증상", sub1: "난시 검사", sub2: "난시 도수" },
    { main: "근시 진행", sub1: "근시 검사", sub2: "근시 관리" },
    { main: "원시 증상", sub1: "원시 검사", sub2: "원시 도수" },
    { main: "노안 증상", sub1: "노안 검사", sub2: "노안 렌즈" },
    { main: "눈건조 관리", sub1: "눈건조 습관", sub2: "눈건조 렌즈" },
    { main: "스마트폰 눈피로", sub1: "스마트폰 시력", sub2: "스마트폰 습관" },
    { main: "독서 눈피로", sub1: "독서 시력", sub2: "독서 거리" },
    { main: "눈떨림 원인", sub1: "눈떨림 피로", sub2: "눈떨림 습관" },
    { main: "시력저하 원인", sub1: "시력저하 검사", sub2: "시력저하 습관" },
    { main: "근거리 흐림", sub1: "근거리 시력", sub2: "근거리 검사" },
    { main: "눈초점 피로", sub1: "눈초점 습관", sub2: "눈초점 검사" },
    { main: "눈건강 생활", sub1: "눈건강 습관", sub2: "눈건강 검사" },
    { main: "어린이 눈피로", sub1: "어린이 시력검사", sub2: "어린이 생활습관" },
    { main: "청소년시력 관리", sub1: "청소년시력 검사", sub2: "청소년시력 습관" },
    { main: "실내눈 피로", sub1: "실내눈 습관", sub2: "실내눈 조명" },
    { main: "운전시야 흐림", sub1: "운전시야 야간", sub2: "운전시야 검사" },
    { main: "눈부심 원인", sub1: "눈부심 렌즈", sub2: "눈부심 검사" },
    { main: "눈피로 습관", sub1: "눈피로 스마트폰", sub2: "눈피로 조명" },
    { main: "시야흐림 원인", sub1: "시야흐림 피로", sub2: "시야흐림 검사" },
    { main: "어린이근시 관리", sub1: "어린이근시 습관", sub2: "어린이근시 검사" },
    { main: "독서시력 피로", sub1: "독서시력 거리", sub2: "독서시력 습관" },
    { main: "야간눈부심 원인", sub1: "야간눈부심 운전", sub2: "야간눈부심 검사" },
  ],
  "glasses-story": [
    // 스타일·상황·경험·트렌드 군집 (관리 쏠림 방지 — 안경/안경원 전반의 이야기)
    { main: "얼굴형 안경", sub1: "얼굴형 안경테", sub2: "얼굴형 코디" },
    { main: "안경 코디", sub1: "안경 스타일", sub2: "안경 인상" },
    { main: "첫 안경", sub1: "첫 안경 적응", sub2: "첫 안경 맞춤" },
    { main: "어린이 안경", sub1: "어린이 안경 적응", sub2: "어린이 안경 관리" },
    { main: "안경 맞춤", sub1: "안경 맞춤 과정", sub2: "안경 검안" },
    { main: "안경 교체시기", sub1: "안경 수명", sub2: "안경 교체" },
    { main: "안경김서림 원인", sub1: "안경김서림 관리", sub2: "안경김서림 렌즈" },
    { main: "안경세척 방법", sub1: "안경세척 렌즈", sub2: "안경세척 코팅" },
    { main: "안경수리 맡기기", sub1: "안경수리 나사", sub2: "안경수리 파손" },
    { main: "안경코받침 교체", sub1: "안경코받침 소재", sub2: "안경코받침 관리" },
    { main: "안경닦이 소재", sub1: "안경닦이 관리", sub2: "안경닦이 교체" },
    { main: "안경보관 방법", sub1: "안경보관 습관", sub2: "안경보관 케이스" },
    { main: "안경스크래치 관리", sub1: "안경스크래치 원인", sub2: "안경스크래치 렌즈" },
    { main: "안경착용감 조정", sub1: "안경착용감 피팅", sub2: "안경착용감 코패드" },
    { main: "안경흘러내림 원인", sub1: "안경흘러내림 피팅", sub2: "안경흘러내림 코패드" },
    { main: "안경테 관리", sub1: "안경테 변형", sub2: "안경테 보관" },
    { main: "코패드자국 원인", sub1: "코패드자국 피팅", sub2: "코패드자국 교체" },
    { main: "안경조정 방법", sub1: "안경조정 균형", sub2: "안경조정 착용감" },
    { main: "안경렌즈 얼룩", sub1: "안경렌즈 세척", sub2: "안경렌즈 코팅" },
    { main: "안경나사 풀림", sub1: "안경나사 조임", sub2: "안경나사 수리" },
    { main: "안경테 변형", sub1: "안경테 피팅", sub2: "안경테 보관" },
    { main: "안경코패드 관리", sub1: "안경코패드 세척", sub2: "안경코패드 교체" },
    { main: "안경렌즈 코팅", sub1: "안경렌즈 세척", sub2: "안경렌즈 보관" },
    { main: "안경착용감 변화", sub1: "안경착용감 피팅", sub2: "안경착용감 균형" },
    { main: "안경관리 습관", sub1: "안경관리 세척", sub2: "안경관리 보관" },
    { main: "안경케이스 보관", sub1: "안경케이스 습관", sub2: "안경케이스 렌즈" },
    { main: "안경닦이 관리", sub1: "안경닦이 세척", sub2: "안경닦이 교체" },
    { main: "안경세척 습관", sub1: "안경세척 렌즈", sub2: "안경세척 얼룩" },
    { main: "안경렌즈 흠집", sub1: "안경렌즈 보관", sub2: "안경렌즈 세척" },
    { main: "안경코패드 세척", sub1: "안경코패드 자국", sub2: "안경코패드 교체" },
    { main: "안경피팅 변화", sub1: "안경피팅 균형", sub2: "안경피팅 착용감" },
    { main: "안경관리 방법", sub1: "안경관리 렌즈", sub2: "안경관리 테" },
    { main: "안경테 세척", sub1: "안경테 변색", sub2: "안경테 보관" },
    { main: "안경렌즈 보관", sub1: "안경렌즈 케이스", sub2: "안경렌즈 흠집" },
    { main: "안경착용 습관", sub1: "안경착용 균형", sub2: "안경착용 관리" },
    { main: "안경힌지 관리", sub1: "안경힌지 나사", sub2: "안경힌지 움직임" },
    { main: "안경고무팁 교체", sub1: "안경고무팁 착용감", sub2: "안경고무팁 귀통증" },
    { main: "안경렌즈 물자국", sub1: "안경렌즈 세척", sub2: "안경렌즈 코팅" },
    { main: "안경테 뒤틀림", sub1: "안경테 균형", sub2: "안경테 피팅" },
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
    // 관리/수리 군집
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
    "안경나사",
    "안경힌지",
    "안경닦이",
    "안경케이스",
    // 스타일 군집
    "얼굴형안경",
    "안경코디",
    "안경스타일",
    "뿔테안경",
    // 상황·계기 군집
    "첫안경",
    "어린이안경",
    "안경교체시기",
    // 안경원 경험 군집
    "안경맞춤",
    "안경검안",
    // 트렌드·상식 군집
    "안경트렌드",
    "안경수명",
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
    "돌아감",
    "빠짐",
    "찢어짐",
  ],
  "eye-info": ["원인", "증상", "검사", "관리", "습관", "피로", "흐림", "운전", "독서", "스마트폰", "어린이", "근시", "야간"],
  "glasses-story": ["원인", "방법", "관리", "교체", "세척", "보관", "피팅", "수리", "흠집", "얼룩", "코팅", "착용감", "습관", "코디", "스타일", "얼굴형", "인상", "처음", "고르기", "시기", "트렌드", "맞춤"],
};

// 코퍼스 harvest 시드 정밀화: 카테고리 subcategories는 "교체/도수/소재/시야/코디" 같은
// 일반어라 단독으로 네이버에 검색하면 정수기 렌탈 교체·도수치료·부동산 임장·패션 코디 등
// 도메인 외 결과를 끌어온다(오염 뿌리). 광학 앵커를 붙여 안경 도메인 결과만 나오게 한다.
const CATEGORY_SEED_ANCHOR: Record<string, string> = {
  frames: "안경테",
  lenses: "안경렌즈",
  contacts: "콘택트렌즈",
  "eye-info": "눈",
  progressive: "누진",
  "glasses-story": "안경",
};

function anchorOpticalSeed(categoryId: string, sub: string): string {
  const term = sub.trim();
  if (!term) return term;
  // 이미 안경/렌즈/콘택트/선글라스를 포함하면 그대로(이미 도메인 특정).
  if (/안경|렌즈|콘택트|선글라스/.test(term)) return term;
  const anchor = CATEGORY_SEED_ANCHOR[categoryId] ?? "안경";
  return `${anchor} ${term}`;
}

function buildCorpusSeedQueries(category: { id: string; name: string; subcategories: string[] }): string[] {
  return [
    category.name,
    ...category.subcategories.map((sub) => anchorOpticalSeed(category.id, sub)),
    ...(BROAD_KEYWORD_HEADS[category.id] ?? []),
  ];
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
  if (/자연스러운 제목|2단어 키워드|main_keyword|sub_keyword/.test(source)) {
    return false;
  }
  // 결정론 안전망: 브랜드명·전문수치는 정보성 제목/키워드에 부적합 → 후보 자체 드롭(프롬프트 미준수 대비).
  if (/아큐브|알콘|쿠퍼비전|바슈롬|바이오피니티|데일리스|토탈원|클라렌|메다폼|오아시스원데이/.test(source)) {
    return false;
  }
  if (/베이스커브|함수율|산소투과율/.test(source)) {
    return false;
  }
  // 소프트/원데이/일반 콘택트 "직경"은 거의 동일해 비변별(컬러·서클렌즈 직경은 변별 있어 허용).
  if (/직경/.test(source) && !/컬러렌즈|서클렌즈|미용렌즈/.test(source)) {
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
    if (/렌즈건조|렌즈충혈|원데이렌즈|콘택트렌즈|하드렌즈|소프트렌즈|선글라스|누진|다초점|변색렌즈/.test(source)) return false;
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
  if (categoryId === "lenses") {
    // 안경렌즈 카테고리에 콘택트렌즈·선글라스 도메인이 새는 것을 막는다.
    // (예: "콘택트렌즈 도수", "레이벤선글라스 도수"가 안경렌즈 후보에 섞이던 누수.)
    // 변색/블루라이트/자외선/편광/고굴절/압축/코팅렌즈는 안경렌즈이므로 건드리지 않는다.
    if (/콘택트렌즈|콘택트|원데이|소프트렌즈|하드렌즈|컬러렌즈|서클렌즈|토릭렌즈|드림렌즈|미용렌즈|멀티포컬/.test(source)) {
      return false;
    }
    if (/선글라스/.test(source)) return false;
  }
  if (categoryId === "glasses-story") {
    if (/안경수리\s+(흘러내림|착용감)|안경세척\s+코팅.*렌즈와 비교/.test(source)) return false;
    if (/안경닦이.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경케이스.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경렌즈\s+원인|안경스크래치\s+처음/.test(source)) return false;
  }
  // 카테고리 적합성(positive 매칭)은 하드코딩 정규식 대신 LLM 분류 단계에서 판정한다.
  // (눈정보·안경이야기 같은 넓은 카테고리의 확장성을 위해.) 여기서는 구조/스팸/지역만 거른다.
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
    return /안경수리|안경세척|안경관리|안경보관|안경피팅|안경흘러내림|안경김서림|코패드|안경나사|안경렌즈|안경테|안경조정|안경착용감|안경스크래치|안경닦이|안경케이스|안경힌지|얼굴형|안경코디|안경스타일|첫안경|어린이안경|안경맞춤|검안|안경트렌드|뿔테|안경수명|안경교체/.test(compact);
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

// 검색광고 연관 키워드(실제 사람들이 치는 검색어 + 실측 볼륨)를 후보 시드로 역주입한다.
// 생성형 롱테일은 그럴듯해도 아무도 안 치는 조합이 많다. 실검색어를 시드 최앞단에 두면
// LLM 확장이 실제 수요가 있는 소재에 앵커링된다.
function buildRealQuerySeedOptions(
  categoryId: string,
  demandSignals: SearchVolumeSignal[],
  registeredProductHeads: string[] = []
): KeywordOption[] {
  return demandSignals
    .filter((signal) => {
      const total = signal.monthlyTotalSearches ?? 0;
      return (
        total >= 100 &&
        total <= 30000 &&
        isDemandKeywordRelevantForCategory(categoryId, signal.keyword) &&
        !/추천|가격|비용|후기|할인|무료|예약|상담|문의|순위|병원|안과|수술/.test(signal.keyword) &&
        // 사람들이 브랜드를 검색해도 매장이 취급하지 않으면 글을 쓸 수 없다.
        // 미등록 브랜드 실검색어는 시드에서 제외한다.
        !containsUnregisteredBrand(signal.keyword, registeredProductHeads)
      );
    })
    .sort(
      (a, b) =>
        (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0) ||
        (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0)
    )
    .slice(0, 30)
    .map((signal): KeywordOption | null => {
      const parts = signal.keyword.trim().split(/\s+/);
      const inferred =
        parts.length >= 2
          ? ([parts[0], parts.slice(1).join("")] as [string, string])
          : splitCompactDemandKeyword(categoryId, signal.keyword.trim());
      if (!inferred) return null;
      const main = `${inferred[0]} ${inferred[1]}`;
      if (startsWithRegionWord(main)) return null;
      return { title: "", mainKeyword: main, subKeyword1: main, subKeyword2: main };
    })
    .filter((option): option is KeywordOption => Boolean(option));
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
        title: "",
        mainKeyword: main,
        subKeyword1: main,
        subKeyword2: main,
      };
    })
    .filter((option): option is KeywordOption => Boolean(option));

  const categoryOptions = (FALLBACK_KEYWORD_SETS[params.categoryId] ?? [])
    .map((item) => ({
      title: "",
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
  return parts.length >= 2 && parts.length <= 3 && parts.every((part) => part.length >= 1);
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

// 진짜로 망가진 제목만 떨어뜨린다(템플릿으로 다시 쓰지 않는다).
// 후보는 LLM이 넉넉히 생성하고 재시도/폴백 경로가 있으므로, 의심스러운 건
// 억지로 고치기보다 드롭하는 편이 결과 품질에 유리하다.
function isUsableLlmTitle(option: KeywordOption): boolean {
  const title = option.title.trim();
  if (!title) return false;
  // 메인 키워드는 제목에 원형 그대로 들어가야 한다(검색 노출의 전제).
  // 길이 안전장치(노출에서 잘리거나 너무 짧아 정보 기대감이 없는 제목 차단).
  // 검증(rule5)은 32자 상한이므로 진입은 약간 여유를 두고 폴리시가 줄일 기회를 준다.
  const len = title.length;
  if (len < 8 || len > 48) return false;
  // 기계적/스팸성 패턴은 고치지 말고 버린다.
  if (isAwkwardGeneratedTitle(title)) return false;
  return true;
}

function normalizeGeneratedOptions(options: KeywordOption[]): KeywordOption[] {
  return options
    .map((option) => ({
      // 제목 쉼표 금지(프로젝트 규칙). LLM이 쉼표를 넣어도 결정론적으로 공백 치환한다.
      title: option.title
        .trim()
        .replace(/[,，、]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      mainKeyword: option.mainKeyword.trim().replace(/\s+/g, " "),
      subKeyword1: option.subKeyword1.trim().replace(/\s+/g, " "),
      subKeyword2: option.subKeyword2.trim().replace(/\s+/g, " "),
    }))
    // 제목과 키워드는 LLM 출력을 그대로 유지한다.
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

function isStructurallyUsableLlmCandidate(option: KeywordOption): boolean {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  if (
    !isValidTwoWordKeyword(option.mainKeyword) ||
    !isValidTwoWordKeyword(option.subKeyword1) ||
    !isValidTwoWordKeyword(option.subKeyword2)
  ) {
    return false;
  }
  if (/자연스러운 제목|2단어 키워드|main_keyword|sub_keyword/.test(source)) {
    return false;
  }
  return true;
}

const GPT_KEYWORD_BATCH_FOCUSES = [
  "검색광고 조회에서 실제 검색량이 확인되는 키워드 중심으로 확장",
  "사용자가 실제로 겪는 불편, 증상, 사용 장면, 생활 상황 중심으로 확장",
  "방문 전 확인 행동, 검사, 교체, 피팅 같은 전환 의도 중심으로 확장",
  "롱테일 질문 의도, 비교/선택 맥락, 새로 들어온 관심사 중심으로 확장",
];

function pickKeywordSeedWindow(
  fallbackCandidates: KeywordOption[],
  batchIndex: number,
  batchCount: number
): KeywordOption[] {
  if (fallbackCandidates.length === 0) return [];
  const windowSize = Math.min(
    36,
    Math.max(18, Math.ceil(fallbackCandidates.length / Math.max(1, batchCount)))
  );
  const start = (batchIndex * windowSize) % fallbackCandidates.length;
  const doubled = [...fallbackCandidates, ...fallbackCandidates];
  return doubled.slice(start, start + windowSize);
}

// 하드코딩 제목으로 부족분을 채우지 않는다. 대신 LLM을 부족분만큼 다시 호출해
// 후보 풀을 TARGET_RESULT_COUNT 이상으로 끌어올린다. CLI 프로세스 동시 spawn 수는
// KEYWORD_GPT_CONCURRENCY로 제한해 리소스 고갈(os error 1453)을 막고,
// 진전이 없는 라운드가 나오면(서비스 다운/전부 중복) 즉시 중단한다.
async function generateGptKeywordCandidatePool(params: {
  shopName: string;
  region: string;
  categoryName: string;
  topic?: string;
  demandSignals: SearchVolumeSignal[];
  strategyGuide: string;
  fallbackCandidates: KeywordOption[];
  depthDimensions?: string[];
  competitorTitles?: string[];
  topPostContent?: {
    bodyHighlights: string[];
    contentBlocks: string[];
    titleAngles: string[];
  } | null;
  corpusTitles?: string[];
}): Promise<KeywordOption[]> {
  const seen = new Set<string>();
  const pool: KeywordOption[] = [];
  const focusCount = KEYWORD_GPT_MAX_ROUNDS * KEYWORD_GPT_CONCURRENCY;

  // 풀이 한 전문 차원에 쏠리지 않도록 누적 단계에서 차원당 상한(3)을 둔다.
  // 이렇게 해야 풀이 차원-다양해져, 최종 차원 캡(2)이 교체할 후보를 확보한다.
  const dimLists = dimensionTokensFromList(params.depthDimensions ?? []);
  const POOL_DIM_CAP = 3;
  const poolDimCount = new Map<number, number>();

  const addCandidates = (candidates: KeywordOption[]): void => {
    const usable = normalizeGeneratedOptions(candidates).filter(
      isStructurallyUsableLlmCandidate
    );
    for (const candidate of usable) {
      const key = `${normalizeTitleForComparison(candidate.title)}|${normalizeKeywordKey(candidate.mainKeyword)}`;
      if (seen.has(key)) continue;
      if (dimLists.length > 0) {
        const dim = candidateDimensionIndex(
          `${candidate.title} ${candidate.mainKeyword} ${candidate.subKeyword1} ${candidate.subKeyword2}`,
          dimLists
        );
        if (dim !== -1) {
          if ((poolDimCount.get(dim) ?? 0) >= POOL_DIM_CAP) continue;
          poolDimCount.set(dim, (poolDimCount.get(dim) ?? 0) + 1);
        }
      }
      seen.add(key);
      pool.push(candidate);
    }
  };

  const targetPool = TARGET_RESULT_COUNT * 2;
  // 한 라운드가 정체(새 후보 0)해도 즉시 포기하지 않는다. 갱신된 avoidKeywords 제외목록으로
  // 다음 라운드가 새 소재를 낼 수 있으므로, 연속 정체 STALL_LIMIT회까지는 더 시도한다.
  // (좁은 카테고리에서 Codex가 가끔 겹치는 후보를 반환해 풀이 덜 찬 채 멈추던 문제 완화.)
  // 단, 생성 단계가 maxDuration(360s)을 잠식하지 않도록 시간 예산(150s)을 둔다. 이후 분석·폴리시·
  // 외부신호 단계가 최대 ~170s까지 걸리므로(실측 glasses-story 369s = 생성200+후단169), 생성을
  // 150s로 제한해 합산이 360s를 넘지 않게 한다(최악 ~320s, 안전 마진 확보).
  const STALL_LIMIT = 2;
  const POOL_TIME_BUDGET_MS = 150_000;
  const poolStartedAt = Date.now();
  let stallStreak = 0;
  for (
    let round = 0;
    round < KEYWORD_GPT_MAX_ROUNDS &&
    pool.length < targetPool &&
    Date.now() - poolStartedAt < POOL_TIME_BUDGET_MS;
    round += 1
  ) {
    const remaining = targetPool - pool.length;
    const callsThisRound = Math.min(
      KEYWORD_GPT_CONCURRENCY,
      Math.max(1, Math.ceil(remaining / KEYWORD_GPT_PER_CALL))
    );
    const before = pool.length;

    const results = await Promise.all(
      Array.from({ length: callsThisRound }, async (_, callIndex) => {
        const focusIndex = (round * KEYWORD_GPT_CONCURRENCY + callIndex) % focusCount;
        try {
          const candidates = await generateKeywordCandidatesWithGpt({
            shopName: params.shopName,
            region: params.region,
            categoryName: params.categoryName,
            topic: params.topic,
            demandSignals: params.demandSignals,
            strategyGuide: params.strategyGuide,
            fallbackCandidates: pickKeywordSeedWindow(
              params.fallbackCandidates,
              focusIndex,
              focusCount
            ),
            targetCount: KEYWORD_GPT_PER_CALL,
            competitorTitles: params.competitorTitles,
            topPostContent: params.topPostContent,
            corpusTitles: params.corpusTitles,
            // 이미 풀에 쌓인 후보를 GPT에 알려 "겹치지 말고 새 소재로" 유도(수렴 깨기).
            avoidKeywords: pool.map((candidate) => candidate.mainKeyword),
            // 각 배치가 서로 다른 전문 깊이 차원을 맡게 해서 풀이 차원-다양하게 채워지도록 한다.
            // (한 차원에 쏠리는 것을 생성 단계에서 막는다. depth 차원이 없으면 일반 관점 로테이션.)
            batchFocus:
              params.depthDimensions && params.depthDimensions.length > 0
                ? `'${params.depthDimensions[focusIndex % params.depthDimensions.length]}' 전문 차원을 중심으로 다루세요. 다른 차원과 겹치지 않게.`
                : GPT_KEYWORD_BATCH_FOCUSES[focusIndex % GPT_KEYWORD_BATCH_FOCUSES.length],
            depthDimensions: params.depthDimensions,
          });
          return candidates ?? [];
        } catch {
          return [] as KeywordOption[];
        }
      })
    );

    results.forEach(addCandidates);

    // 정체(새 후보 0)가 연속 STALL_LIMIT회 누적되면 더 호출해도 같은 결과일 가능성이 높으므로
    // 중단한다. 1회 정체로는 멈추지 않아, 다음 라운드가 갱신된 제외목록으로 새 후보를 낼 기회를 준다.
    if (pool.length === before) {
      stallStreak += 1;
      if (stallStreak >= STALL_LIMIT) break;
    } else {
      stallStreak = 0;
    }
  }

  return pool.slice(0, TARGET_RESULT_COUNT * 8);
}

function stripSeedTitle(candidate: KeywordOption): KeywordOption {
  return { ...candidate, title: "" };
}

function formatPromptCandidate(candidate: KeywordOption, index: number): string {
  const titlePart = candidate.title.trim()
    ? `title=${candidate.title} / `
    : "";
  return `${index + 1}. ${titlePart}main=${candidate.mainKeyword} / sub1=${candidate.subKeyword1} / sub2=${candidate.subKeyword2}`;
}

function buildCandidateEditingPrompt(params: {
  targetStore: string;
  category: string;
  candidates: KeywordOption[];
  forbiddenList: string[];
  referenceList: string[];
  competitorList: string[];
  strategyGuide: string;
  corpusTitles?: string[];
}): string {
  const candidateLines = params.candidates
    .map(formatPromptCandidate)
    .join("\n");
  const forbidden = params.forbiddenList.slice(0, 10).join("\n") || "(없음)";
  const references = params.referenceList.slice(0, 8).join("\n") || "(없음)";
  const competitors = params.competitorList.slice(0, 8).join("\n") || "(없음)";
  const corpusSection =
    (params.corpusTitles ?? []).length > 0
      ? `\n[실제 업종 상위 제목 말뭉치 — 용어·표현·분류 수준의 기준]\n${params
          .corpusTitles!.slice(0, 40)
          .map((title) => `- ${title}`)
          .join("\n")}\n※ 용어 선택·분류 명칭·표현 수준은 이 말뭉치를 기준으로 삼되 문장을 베끼지 마세요. 말뭉치에 없는 생소한 조어·분류·명사 조합 금지.\n`
      : "";

  return `당신은 네이버 블로그 제목/키워드 생성 에디터입니다.
아래 키워드 seed는 제목 문장이 아니라 검색 축입니다. seed 문장을 따라 쓰지 말고, 직접 자연스러운 제목을 작성하세요.

[대상]
- 매장: ${params.targetStore}
- 카테고리: ${params.category}

[키워드 seed]
${candidateLines}

[피해야 할 같은 매장 기존 제목]
${forbidden}

[참고용 다른 매장 제목]
${references}

[실제 상위 노출 제목 — 독자가 찾는 소재·의도의 지도]
${competitors}
※ 위 소재·독자 의도는 적극 겨냥하되, 같은 표현·각도·어미·메인+서브 조합은 베끼지 말고 새 관점으로 차별화하세요.
${corpusSection}
${params.strategyGuide}

[출력 규칙]
- results 배열은 정확히 10개입니다. 10개보다 적게 반환하지 마세요.
- 가장 좋은 후보 1개만 고르지 마세요. 서로 다른 10개 독립 항목을 모두 생성하세요.
- If the results array has fewer than 10 objects, the response is invalid.
${TITLE_PATTERN_GUIDE}
${OPTICAL_ACCURACY_GUIDE}
- title에는 main_keyword 두 단어가 순서대로 이어져야 합니다. 두 단어 사이에는 조사(이/가/을/를/에/의 등)만 허용됩니다.
- 키워드 덩어리를 문두에 박고 절을 이어붙인 비문을 만들지 마세요. 키워드가 주어나 목적어로 자연스럽게 녹은 문장이어야 합니다.
- 제목에 원인-결과 주장을 쓰지 마세요("~하면 ~됩니다", "~수록 ~해지는"). 제목은 검색자가 실제 겪는 상황·궁금증까지만 담고 답과 인과는 본문에 둡니다.
- 사실이 아니거나 검증 불가능한 전제를 제목으로 만들지 마세요.
- main_keyword, sub_keyword_1, sub_keyword_2는 모두 실제 검색 가능한 2~3단어 조합입니다.
- seed의 title이 비어 있으면 제목을 새로 창작하세요.
- 같은 어미, 같은 문장 구조, 같은 소재를 반복하지 마세요.
- 제목에 쉼표(,)를 쓰지 마세요. 접속 어미로 자연스럽게 이으세요.
- 같은 끝맺음("확인할 점/부분", "기준", "차이", "이유")은 10개 중 최대 2개까지만 쓰세요.
- 기존 제목과 같은 제목, 같은 관점, 같은 메인+서브 조합은 피하세요.
- 금지어: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- JSON 외 텍스트를 쓰지 마세요.
출력 JSON 형식:
- 최상위 객체는 results 배열만 가집니다.
- results 배열 길이는 정확히 10입니다.
- 각 항목 키는 title, main_keyword, sub_keyword_1, sub_keyword_2 입니다.
- placeholder나 설명 문장을 넣지 말고 실제 후보 10개만 작성하세요.`;
}
// 같은 내용 단어(예: "마스크")가 최종 결과의 다수 제목에 반복되는 소재 쏠림을 막는다.
// 메인 키워드 자체의 단어는 검색 노출을 위해 반복될 수 있으므로 캡 대상에서 제외한다.
const SHARED_TITLE_TOKEN_CAP = 3;

// 조사가 붙은 토큰("착용감을"/"착용감이")이 서로 다른 단어로 잡히면 캡이 무력화되므로
// 어간 기준으로 정규화해 비교한다.
function titleTokenStems(title: string): string[] {
  return [
    ...new Set(
      tokenizeTitleForComparison(title)
        .map((token) => stripKoreanParticle(token))
        .filter((token) => token.length >= 2)
    ),
  ];
}

function exceedsSharedTitleTokenCap(
  candidate: KeywordOption,
  selected: KeywordOption[],
  cap = SHARED_TITLE_TOKEN_CAP
): boolean {
  const mainWords = candidate.mainKeyword.toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = titleTokenStems(candidate.title).filter(
    (token) =>
      !COMMON_TITLE_WORDS.has(token) &&
      !mainWords.some((word) => word.includes(token) || token.includes(word))
  );
  return tokens.some(
    (token) =>
      selected.filter((picked) => titleTokenStems(picked.title).includes(token)).length >= cap
  );
}

function canAddIntentBalancedCandidate<T extends KeywordOption>(
  candidate: T,
  selected: T[],
  options: { maxPerBucket?: number; allowSimilar?: boolean; maxRegional?: number } = {}
): boolean {
  if (isAwkwardGeneratedTitle(candidate.title)) return false;
  if (exceedsSharedTitleTokenCap(candidate, selected)) return false;

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

  // 시즌 소재(김서림·자외선 등)는 시의성 가치가 있지만 한 결과에 몰리면 소재 쏠림이 된다.
  if (
    bucket === "seasonal" &&
    selected.filter((picked) => inferIntentBucket(picked) === "seasonal").length >= 2
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

function appendLooseLlmBackfill<T extends AnalyzedKeyword>(
  selected: T[],
  candidates: T[]
): T[] {
  const filled = [...selected];

  for (const candidate of candidates) {
    if (filled.length >= TARGET_RESULT_COUNT) break;
    if (
      !isValidTwoWordKeyword(candidate.mainKeyword) ||
      !isValidTwoWordKeyword(candidate.subKeyword1) ||
      !isValidTwoWordKeyword(candidate.subKeyword2)
    ) {
      continue;
    }
    if (!isStructurallyUsableLlmCandidate(candidate)) continue;
    if (isAwkwardGeneratedTitle(candidate.title)) continue;
    if (hasRegisteredStoreOverlap(candidate)) continue;
    // 백필도 소재 쏠림 캡을 지킨다. 백필 단계에서 캡이 풀리면 부족분이 비슷한 소재로 채워진다.
    if (exceedsSharedTitleTokenCap(candidate, filled)) continue;
    if (
      filled.filter(
        (picked) => inferMainKeywordAxis(picked) === inferMainKeywordAxis(candidate)
      ).length >= 2
    ) {
      continue;
    }

    const hasExactDuplicate = filled.some(
      (picked) =>
        normalizeTitleForComparison(picked.mainKeyword) === normalizeTitleForComparison(candidate.mainKeyword) ||
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        hasSameKeywordCombination(picked, candidate)
    );
    if (hasExactDuplicate) continue;

    filled.push(candidate);
  }

  return filled.slice(0, TARGET_RESULT_COUNT);
}

// 제목의 끝 어절(명사형 끝맺음)을 키로 본다. 예: "...적응 문제"→"문제", "...살펴볼 원인"→"원인".
function getTitleEndingKey(title: string): string {
  // 마지막 어절만 보면 "쓰인다면/불편하다면/남는다면"이 서로 다른 끝맺음으로 잡혀
  // "~다면" 계열 반복(절-어미 패턴)이 다양화에서 빠져나간다. 계열로 정규화해 묶는다.
  const trimmed = title.trim();
  if (/다면$/.test(trimmed)) return "다면";
  if (/(을|를|이|가)?\s*때$/.test(trimmed) || /때$/.test(trimmed)) return "때";
  if (/(까|까요|ㄹ까|일까)$/.test(trimmed)) return "질문";
  if (/(법|순서|방법)$/.test(trimmed)) return "방법";
  if (/(이유|원인)$/.test(trimmed)) return "이유";
  if (/(부분|점|곳|것)$/.test(trimmed)) return "부분";
  if (/(차이|기준)$/.test(trimmed)) return "기준";
  const tokens = trimmed.split(/\s+/);
  return tokens[tokens.length - 1] ?? "";
}

// 카테고리 전문 깊이 차원별로 후보를 분류해, 한 차원에 maxPerDimension(기본 2)을 넘으면
// 풀에서 다른 차원 후보로 교체한다(개수는 유지). "난시축"에 4개가 몰리는 쏠림을 막는다.
const DIMENSION_STOPWORDS = new Set([
  "관계", "안정성", "공급", "영향", "차이", "위험", "신호", "포인트", "항목", "흐름",
  "요소", "과정", "장면", "정도", "순서", "방식", "이유", "원인", "부분", "관리", "확인",
]);

function dimensionTokensFromList(dimensions: string[]): string[][] {
  return dimensions.map((dimension) =>
    (dimension.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).filter(
      (token) => !DIMENSION_STOPWORDS.has(token)
    )
  );
}

function getDimensionTokenLists(categoryId: string): string[][] {
  return dimensionTokensFromList(getCategoryDepthDimensions(categoryId));
}

function candidateDimensionIndex(source: string, lists: string[][]): number {
  let best = -1;
  let bestScore = 0;
  lists.forEach((tokens, index) => {
    const score = tokens.reduce((sum, token) => (source.includes(token) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

function diversifyByDimension<T extends AnalyzedKeyword>(
  results: T[],
  pool: T[],
  categoryId: string,
  maxPerDimension = 2
): T[] {
  const lists = getDimensionTokenLists(categoryId);
  if (lists.length === 0) return results;

  const sourceOf = (option: KeywordOption) =>
    `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const out: T[] = [];
  const count = new Map<number, number>();
  const usedKeys = new Set(results.map((item) => `${item.title}|${item.mainKeyword}`));
  const replacementPool = pool.filter(
    (cand) => !hasRegisteredStoreOverlap(cand) && isBroadlyUsableCandidate(cand)
  );
  const bump = (dim: number) => count.set(dim, (count.get(dim) ?? 0) + 1);

  for (const item of results) {
    const dim = candidateDimensionIndex(sourceOf(item), lists);
    // 차원 미매칭(-1)은 캡하지 않는다(일반/다양 주제로 본다).
    if (dim === -1 || (count.get(dim) ?? 0) < maxPerDimension) {
      out.push(item);
      bump(dim);
      continue;
    }
    const replacement = replacementPool.find((cand) => {
      const key = `${cand.title}|${cand.mainKeyword}`;
      if (usedKeys.has(key)) return false;
      const candDim = candidateDimensionIndex(sourceOf(cand), lists);
      return candDim === -1 || (count.get(candDim) ?? 0) < maxPerDimension;
    });
    if (replacement) {
      out.push(replacement);
      usedKeys.add(`${replacement.title}|${replacement.mainKeyword}`);
      bump(candidateDimensionIndex(sourceOf(replacement), lists));
    } else {
      out.push(item);
      bump(dim);
    }
  }
  return out;
}

// 같은 끝맺음이 maxPerEnding(기본 2)을 넘으면, 풀에서 다른 끝맺음 후보로 교체한다.
// 교체 후보가 없으면 원본을 유지한다(절대 개수를 줄이지 않는다).
function diversifyTitleEndings<T extends AnalyzedKeyword>(
  results: T[],
  pool: T[],
  maxPerEnding = 2
): T[] {
  const out: T[] = [];
  const endingCount = new Map<string, number>();
  const usedKeys = new Set(results.map((item) => `${item.title}|${item.mainKeyword}`));
  const replacementPool = pool.filter(
    (cand) => !hasRegisteredStoreOverlap(cand) && isBroadlyUsableCandidate(cand)
  );

  const bump = (ending: string) =>
    endingCount.set(ending, (endingCount.get(ending) ?? 0) + 1);

  for (const item of results) {
    const ending = getTitleEndingKey(item.title);
    if ((endingCount.get(ending) ?? 0) < maxPerEnding) {
      out.push(item);
      bump(ending);
      continue;
    }
    const replacement = replacementPool.find((cand) => {
      const key = `${cand.title}|${cand.mainKeyword}`;
      if (usedKeys.has(key)) return false;
      return (endingCount.get(getTitleEndingKey(cand.title)) ?? 0) < maxPerEnding;
    });
    if (replacement) {
      out.push(replacement);
      usedKeys.add(`${replacement.title}|${replacement.mainKeyword}`);
      bump(getTitleEndingKey(replacement.title));
    } else {
      out.push(item);
      bump(ending);
    }
  }
  return out;
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
    if (!titleContainsMainKeyword(candidate.title, candidate.mainKeyword)) return;
    if (isAwkwardGeneratedTitle(candidate.title)) return;
    if (exceedsSharedTitleTokenCap(candidate, result)) return;
    // 메인 축(동의어 정규화) 중복은 출구에서도 2개로 제한한다.
    // 선별 단계의 축 캡은 백필이 우회할 수 있어 여기서 최종 보장한다.
    if (
      result.filter(
        (picked) => inferMainKeywordAxis(picked) === inferMainKeywordAxis(candidate)
      ).length >= 2
    ) {
      return;
    }
    const matchedProductHeads = getMatchedProductHeads(candidate, productHeads);
    if (matchedProductHeads.length > 1) return;
    if (
      matchedProductHeads.length === 1 &&
      result.filter((picked) => getMatchedProductHeads(picked, productHeads)[0] === matchedProductHeads[0]).length >= 2
    ) {
      return;
    }
    // 브랜드 키워드 총량 상한(전역 사전 기준): 매장이 팔더라도 결과 절반이 브랜드면
    // 정보성 균형이 깨진다. 헤드 볼륨 가산이 브랜드를 밀어올릴 수 있으므로 출구에서 합계 2개 제한.
    const candidateSource = `${candidate.mainKeyword} ${candidate.subKeyword1} ${candidate.subKeyword2}`;
    if (
      containsAnyKnownBrand(candidateSource) &&
      result.filter((picked) =>
        containsAnyKnownBrand(`${picked.mainKeyword} ${picked.subKeyword1} ${picked.subKeyword2}`)
      ).length >= 2
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
  // 정확 일치만 인정한다. 과거 부분일치 폴백은 "누진렌즈 명시야폭" 같은 지어낸 조합이
  // "누진렌즈"의 검색량을 상속받아 미측정 페널티와 볼륨 게이트를 통째로 우회하게 만들었다.
  const normalized = keyword.replace(/\s+/g, "").toLowerCase();
  return demandSignals.find(
    (signal) => signal.keyword.replace(/\s+/g, "").toLowerCase() === normalized
  );
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
  // 과거 +34는 검색량 통과 보너스(+45)에 맞먹어 브랜드 후보가 일반 후보를 밀어내는 원인이었다.
  // 매장 취급 상품이라는 약한 신호 수준(+8)으로만 반영한다.
  return matched ? 8 : 0;
}

function getKeywordMeshScore(option: KeywordOption, meshKeywordKeys: Set<string>): number {
  return matchesKeywordMesh(option, meshKeywordKeys) ? 24 : 0;
}

function getSearcherConversionQualityScore(option: KeywordOption): number {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const mainTail = splitKeyword(option.mainKeyword)?.[1] ?? "";
  let score = 0;

  // 과거 +18은 불편/증상 소재(김서림·마스크류)가 최종 10개를 점령하는 쏠림의 주범이었다.
  // 검색 전환 신호로서의 가치만 남기고 약화한다.
  if (/울렁임|어지러움|건조|충혈|흐림|통증|이물감|흘러내림|눈부심|불편|피로/.test(source)) {
    score += 6;
  }
  if (/처음|착용|야간|운전|업무|독서|스마트폰|생활|부모님|어린이|장시간/.test(source)) {
    score += 12;
  }
  if (/검사|도수|피팅|코패드|착용감|시야|얼굴형|거리|두께|압축|코팅/.test(source)) {
    score += 12;
  }
  if (/선택|관리|방법|기준|업무|운전|생활/.test(mainTail) && !/불편|검사|도수|시야|착용감|눈부심|건조|울렁임|흘러내림/.test(source)) {
    score -= 18;
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
  const push = (value: string): boolean => {
    const seed = value.trim();
    const key = seed.replace(/\s+/g, "").toLowerCase();
    if (!seed || seen.has(key)) return seeds.length < TARGET_RESULT_COUNT * 10;
    seen.add(key);
    seeds.push(seed);
    return seeds.length < TARGET_RESULT_COUNT * 10;
  };

  // 메인 키워드 전부를 먼저 수집한다. 메인이 검색량 조회에서 잘리면(이전: 메인/서브 교차 수집)
  // 실제 노출 키워드가 unknown으로 남아 볼륨 게이트가 무력화된다. 서브는 남는 자리에만 채운다.
  for (const option of options) {
    if (!push(option.mainKeyword)) return seeds;
  }
  // 헤드(첫 단어) 단독 검색량도 조회한다. 헤드가 실검색어인지가
  // "사람들이 실제로 치는 키워드인가"를 가르는 1차 신호다.
  for (const option of options) {
    const head = option.mainKeyword.trim().split(/\s+/)[0] ?? "";
    if (head && !push(head)) return seeds;
  }
  for (const option of options) {
    if (!push(option.subKeyword1) || !push(option.subKeyword2)) return seeds;
  }

  return seeds;
}

// 헤드(메인 키워드 첫 단어)가 실제로 검색되는 단어인지로 가감한다.
// 같은 롱테일이라도 헤드 자체 검색량이 높으면 실제 질의 변형일 가능성과 전환 기대가 높고
// (예: "안경닦이 세탁"), 헤드가 미측정 전문용어면 아무도 안 치는 조합이다(예: "안장형브릿지 콧대").
function getHeadKeywordDemandScore(
  option: KeywordOption,
  demandSignals: SearchVolumeSignal[]
): number {
  const head = option.mainKeyword.trim().split(/\s+/)[0] ?? "";
  if (!head) return 0;
  const signal = findDemandSignalForKeyword(head, demandSignals);
  const total = signal?.monthlyTotalSearches ?? null;
  if (total === null) return -15;
  if (total >= 1000) return 28;
  if (total >= 300) return 20;
  if (total >= 100) return 12;
  if (total > 0) return 4;
  return -15;
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

function isDuplicateSignalFree(option: AnalyzedKeyword): boolean {
  return !hasRegisteredStoreOverlap(option);
}

function isBroadlyUsableCandidate(option: AnalyzedKeyword): boolean {
  return (
    option.validation.isValid &&
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
          getHeadKeywordDemandScore(option, demandSignals) +
          getTopicAlignmentScore(option, topic) +
          getProductHeadScore(option, productHeads) +
          getKeywordMeshScore(option, meshKeywordKeys) +
          getVolumeTierScore(option._volumeTier) +
          (demandSignal ? getDemandSignalScore(demandSignal) : 0) -
          (hasMeasuredDemand ? 0 : 18) -
          // 시리즈(같은 소재·다른 관점)는 허용하되 새 소재보다 약간 뒤로.
          (validation.series ? 10 : 0) -
          // 이력 테마 감점 완화(-15→-8, 캡 -45→-24): 배치 내 다양성은 공통어/축 캡이
          // 지키므로 이력 감점이 키워드 공간을 잠그지 않게 한다 (시리즈 억제 해소).
          Math.min(24, sameStoreThemeOverlap * 8) -
          Math.min(30, crossBlogThemeOverlap * 4),
      };
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseRequestBody(keywordsSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 }
      );
    }
    const { shopId, categoryId, topic, refresh } = parsed.data;

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
    // 상위 정보성 글 본문 내용(구조화 신호)을 키워드/제목 생성 방향에 반영한다. 스크래핑+분석이
    // 느릴 수 있어 기존 수집과 병렬로 돌리고 18초 타임아웃을 둔다. 실패/초과/내부 unavailable 시
    // null 로 떨어져 제목 방향참고만 남는다(속도 회귀·생성 실패 없음).
    const morphologySeed = (effectiveTopic?.trim() || category.name).trim();
    const [historyOutcome, competitorOutcome, demandOutcome, morphologyOutcome, corpusOutcome, topExposedOutcome] = await Promise.all([
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
      // 상위 정보성 글 본문 분석. 내부 Claude 형태소 분석만 35s + 본문 fetch라 Stage 2와 동일한
      // 45s 예산을 준다(18s로는 항상 타임아웃됨). 초과 시 null 폴백(race), 내부 실패도 graceful.
      (async () => {
        if (!morphologySeed) return null;
        try {
          return await Promise.race([
            analyzeCompetitorMorphology(morphologySeed),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 48_000)),
          ]);
        } catch {
          return null;
        }
      })(),
      // 실제 업종 제목 말뭉치(월간 캐시, 첫 수집만 ~10초). 용어·표현·분류의 기준으로
      // 생성·검수 프롬프트에 주입된다. 실패 시 빈 배열(graceful).
      (async () => {
        try {
          return await getCorpusTitles({
            categoryId: category.id,
            seedQueries: buildCorpusSeedQueries(category),
            limit: 40,
          });
        } catch {
          return [] as string[];
        }
      })(),
      // 자기잠식 가드: 노출 측정에서 이미 1~3위인 키워드(BlogOps). 실패 시 빈 집합.
      getTopExposedKeywordKeys(shopId).catch(() => new Set<string>()),
    ]);

    const { forbiddenList, referenceList } = historyOutcome;
    let competitorList: string[] = competitorOutcome;
    let demandSignals: SearchVolumeSignal[] = demandOutcome;
    // 본문 분석이 성공(available)일 때만 구조화 신호를 키워드 생성에 주입한다.
    const topPostContent =
      morphologyOutcome && morphologyOutcome.status === "available"
        ? {
            bodyHighlights: morphologyOutcome.bodyHighlights,
            contentBlocks: morphologyOutcome.contentBlocks,
            titleAngles: morphologyOutcome.titleAngles,
          }
        : null;

    // 죽은 신호를 표면화한다. 빈 catch로 신호가 사라져도 결과는 정상처럼 나오므로
    // 무엇이 빠진 채 생성됐는지 notes로 알려야 무인 운영에서 품질 저하를 감지할 수 있다.
    const signalNotes: string[] = [];
    if (competitorList.length === 0) {
      signalNotes.push("경쟁 상위 제목 신호 없음 — 차별화 검증이 약한 상태로 생성됨");
    }
    if (demandSignals.length === 0) {
      signalNotes.push("검색광고 검색량 신호 없음 — 볼륨 게이트가 unknown으로 동작");
    }
    if (!topPostContent) {
      signalNotes.push("상위 글 본문 구조 신호 없음(분석 실패 또는 타임아웃)");
    }
    const corpusTitles: string[] = corpusOutcome;
    if (corpusTitles.length === 0) {
      signalNotes.push("업종 제목 말뭉치 없음(수집 실패) — 용어 기준 없이 생성됨");
    }
    const topExposedKeys: Set<string> = topExposedOutcome;
    if (topExposedKeys.size > 0) {
      signalNotes.push(
        `자기잠식 가드: 검색 1~3위 노출 중인 키워드 ${topExposedKeys.size}개는 재작성 대상에서 제외`
      );
    }

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
    // 실검색어 시드를 최앞단에 둔다. GPT 시드 윈도우가 실제 수요 키워드부터 보게 된다.
    const realQuerySeedBatch = buildRealQuerySeedOptions(category.id, demandSignals, productHeads);
    const fallbackBatch = dedupeKeywordOptions([
      ...realQuerySeedBatch,
      ...meshSeedBatch,
      ...productSeedBatch,
      ...combinedSeedBatch,
      ...buildFallbackKeywordOptions({
        region,
        categoryId: category.id,
        demandSignals,
      }),
    ]);

    const fallbackKeywordSeeds = fallbackBatch.map(stripSeedTitle);
    let baseCandidates = fallbackKeywordSeeds;
    let aiSeedCandidates: KeywordOption[] = [];
    if (KEYWORD_AI_EXPANSION_ENABLED && KEYWORD_GPT_EXPANSION_ENABLED) {
      try {
        aiSeedCandidates = await generateGptKeywordCandidatePool({
          shopName: shop.name,
          region,
          categoryName: category.name,
          topic: effectiveTopic,
          demandSignals,
          strategyGuide,
          fallbackCandidates: fallbackKeywordSeeds,
          depthDimensions: getCategoryDepthDimensions(category.id),
          competitorTitles: competitorList,
          topPostContent,
          corpusTitles,
        });
        if (aiSeedCandidates.length > 0) {
          baseCandidates = [...aiSeedCandidates, ...fallbackKeywordSeeds];
        }
      } catch {
        // GPT 후보 확장 실패 시 Claude 편집 단계로 계속 진행한다.
        signalNotes.push("GPT 후보 확장 호출 실패 — 폴백 시드 기반으로 진행");
      }
      if (aiSeedCandidates.length === 0) {
        signalNotes.push("GPT 후보 확장 결과 0개 — Claude 편집/폴백 경로로 생성됨");
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
      corpusTitles,
    });

    let firstBatch: KeywordOption[] = [];
    if (KEYWORD_AI_EXPANSION_ENABLED) {
      if (aiSeedCandidates.length > 0) {
        firstBatch = aiSeedCandidates;
      } else {
        try {
          firstBatch = normalizeGeneratedOptions(
            await generateKeywords(firstPrompt, KEYWORD_FIRST_EDIT_TIMEOUT_MS)
          ).filter(isStructurallyUsableLlmCandidate);
        } catch {
          firstBatch = aiSeedCandidates;
        }
      }
    } else {
      firstBatch = [];
    }

    const firstBatchSeen = new Set<string>();
    const firstBatchAll = [...firstBatch, ...aiSeedCandidates]
      .filter(isStructurallyUsableLlmCandidate)
      .filter((candidate) => isCategoryAppropriateCandidate(category.id, candidate))
      // 매장이 취급하지 않는 브랜드 키워드는 진입 단계에서 차단한다.
      // (연관검색어·LLM 생성 어느 경로로 들어와도 여기서 걸린다.)
      .filter(
        (candidate) =>
          !containsUnregisteredBrand(
            `${candidate.title} ${candidate.mainKeyword} ${candidate.subKeyword1} ${candidate.subKeyword2}`,
            productHeads
          )
      )
      .filter((candidate) => {
        const key = `${candidate.title}|${candidate.mainKeyword}`;
        if (firstBatchSeen.has(key)) return false;
        firstBatchSeen.add(key);
        return true;
      })
      .slice(0, TARGET_RESULT_COUNT * 8);

    // 자기잠식 가드: 이미 검색 1~3위에 노출 중인 키워드는 새 글로 재작성하지 않는다.
    // (내 1위 글과 내 새 글이 같은 키워드에서 경쟁하는 것을 방지)
    // 단, 가드 제거 후 남는 후보가 floor 미만이면 풀 붕괴(→ 결과 2개) 위험이 있으므로
    // 이때는 노출 중 후보를 맨 뒤에 재편입한다(가드는 충분히 남을 때만 강제).
    const nonCannibalBatch = firstBatchAll.filter(
      (candidate) => !topExposedKeys.has(normalizeExposureKeyword(candidate.mainKeyword))
    );
    firstBatch =
      nonCannibalBatch.length >= TARGET_RESULT_COUNT
        ? nonCannibalBatch
        : [
            ...nonCannibalBatch,
            ...firstBatchAll.filter((candidate) =>
              topExposedKeys.has(normalizeExposureKeyword(candidate.mainKeyword))
            ),
          ];

    if (!Array.isArray(firstBatch) || firstBatch.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "LLM 제목 생성에 실패했습니다. 규칙형 조합 제목을 추천으로 표시하지 않도록 차단했습니다. KEYWORD_AI_EXPANSION=1 상태와 Claude/Codex 인증을 확인해주세요.",
        },
        { status: 500 }
      );
    }

    // LLM 카테고리 적합성 분류: 선택된 카테고리(${category.name})에 맞는 후보만 남긴다.
    // 하드코딩 정규식 대신 LLM이 판정하므로 눈정보·안경이야기 같은 넓은 카테고리도 확장성 있게 본다.
    // 실패하거나 결과가 비면 원본을 유지한다(graceful, 0개로 죽지 않게).
    if (KEYWORD_AI_EXPANSION_ENABLED && firstBatch.length > 0) {
      try {
        const keepIndices = await selectCategoryFitIndices(
          buildCategoryFitPrompt({
            categoryName: category.name,
            subcategories: category.subcategories,
            candidates: firstBatch,
          }),
          KEYWORD_CATEGORY_FIT_TIMEOUT_MS
        );
        const keepSet = new Set(keepIndices);
        const fitted = firstBatch.filter((_, index) => keepSet.has(index + 1));
        // LLM 분류가 과도하게 솎아내 풀이 floor 미만으로 떨어지면(→ 결과 2개 붕괴),
        // fitted를 앞에 두되 나머지를 예비로 유지한다. 충분히 남길 때만 완전 교체한다.
        const fitFloor = Math.max(
          TARGET_RESULT_COUNT,
          Math.ceil(firstBatch.length * 0.5)
        );
        if (fitted.length >= fitFloor) {
          firstBatch = fitted;
        } else if (fitted.length > 0) {
          const fittedKeys = new Set(
            fitted.map((c) => `${c.title}|${c.mainKeyword}`)
          );
          firstBatch = [
            ...fitted,
            ...firstBatch.filter(
              (c) => !fittedKeys.has(`${c.title}|${c.mainKeyword}`)
            ),
          ];
        }
      } catch {
        // 카테고리 분류 실패 시 firstBatch를 그대로 사용한다.
        signalNotes.push("LLM 카테고리 적합성 분류 실패 — 분류 없이 진행");
      }
    }

    try {
      // LLM 후보(firstBatch)가 실제 노출 대상이므로 검색량 조회 우선권을 준다.
      // (이전: 폴백 시드 수백 개가 시드 상한(100)을 먼저 차지해 LLM 후보 키워드가
      //  조회조차 되지 않은 채 unknown으로 게이트를 통과했다.)
      const candidateSeeds = collectCandidateSearchSeeds([...firstBatch, ...fallbackKeywordSeeds]);
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

    const analyzedFallback: AnalyzedKeyword[] = [];
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
    // 브랜드(상품명) 후보 강제 끼워넣기(ensureProductRepresentation)는 제거했다.
    // 브랜드 키워드는 점수 경쟁으로만 진입하고, dedupe의 헤드당 2개 상한은 유지된다.
    diverseRankedResults = ensureKeywordMeshRepresentation(
      diverseRankedResults,
      representationPool,
      nonProductMeshKeywordKeys,
      productHeads,
      category.id === "eye-info" || category.id === "glasses-story" ? 2 : 3
    );
    diverseRankedResults = dedupeFinalKeywordResults(diverseRankedResults, representationPool, productHeads);
    diverseRankedResults = appendLooseLlmBackfill(diverseRankedResults, representationPool);
    // 같은 명사형 끝맺음(원인/요소/문제 등)이 3개 이상 몰리면 다른 끝맺음 후보로 교체(개수 유지).
    // 전문 깊이 차원이 한쪽에 쏠리지 않게(예: 난시축 4개) 분산 → 그 다음 끝맺음 분산.
    diverseRankedResults = diversifyByDimension(diverseRankedResults, representationPool, category.id);
    diverseRankedResults = diversifyTitleEndings(diverseRankedResults, representationPool);
    // 다양화 단계가 교체로 끼워넣은 항목이 출구 캡(축/토큰/브랜드)을 우회할 수 있으므로
    // 최종 한 번 더 출구 검증을 통과시킨다(부족분은 내부에서 풀로 재충원).
    diverseRankedResults = dedupeFinalKeywordResults(diverseRankedResults, representationPool, productHeads);

    // 개수 안정화: 백필이 "제목 있는 후보"만 받아 10 미만으로 남으면, 실볼륨 시드에 Claude로
    // 제목을 달아 정식 분석(analyzeOptions) 후 채운다(볼륨 모드와 일치). 부족할 때만 발동(graceful).
    if (KEYWORD_AI_EXPANSION_ENABLED && diverseRankedResults.length < TARGET_RESULT_COUNT) {
      try {
        const usedAxis = new Set(
          diverseRankedResults.map((r) => normalizeKeywordKey(r.mainKeyword))
        );
        const seenSeed = new Set<string>();
        const recoverySeedPool: KeywordOption[] = [];
        for (const seed of [...realQuerySeedBatch, ...fallbackBatch]) {
          const key = normalizeKeywordKey(seed.mainKeyword);
          if (usedAxis.has(key) || seenSeed.has(key)) continue;
          if (!isCategoryAppropriateCandidate(category.id, seed)) continue;
          seenSeed.add(key);
          recoverySeedPool.push(seed);
        }
        const need = TARGET_RESULT_COUNT - diverseRankedResults.length;
        const recoverySeeds = recoverySeedPool.slice(0, need * 3);
        if (recoverySeeds.length > 0) {
          const titled = await reviseKeywordTitles(
            buildSeedTitlePrompt(recoverySeeds),
            KEYWORD_TITLE_POLISH_TIMEOUT_MS
          );
          const titleByIndex = new Map(titled.map((t) => [t.index, t.title.trim()]));
          const titledSeeds: KeywordOption[] = recoverySeeds
            .map((seed, i) => ({ ...seed, title: titleByIndex.get(i + 1) ?? "" }))
            .filter(
              (s) =>
                s.title.length >= 12 &&
                s.title.length <= 32 &&
                !/[,，、]/.test(s.title) &&
                !isAwkwardGeneratedTitle(s.title) &&
                titleContainsMainKeyword(s.title, s.mainKeyword)
            );
          if (titledSeeds.length > 0) {
            const recoveredAnalyzed = await analyzeOptions({
              rawOptions: titledSeeds,
              forbiddenList,
              referenceList,
              competitorList,
              demandSignals,
              topic: effectiveTopic,
              productHeads,
              meshKeywordKeys,
            });
            const existingKeys = new Set(
              diverseRankedResults.map((r) => `${r.title}|${r.mainKeyword}`)
            );
            const recovered = recoveredAnalyzed
              .filter((c) => c.validation.isValid && !hasRegisteredStoreOverlap(c))
              .filter((c) => !usedAxis.has(normalizeKeywordKey(c.mainKeyword)))
              .filter((c) => !existingKeys.has(`${c.title}|${c.mainKeyword}`))
              .sort((a, b) => b._priorityScore - a._priorityScore);
            if (recovered.length > 0) {
              diverseRankedResults = dedupeFinalKeywordResults(
                [...diverseRankedResults, ...recovered],
                representationPool,
                productHeads
              );
              signalNotes.push(
                `개수 안정화: 실볼륨 시드 ${recovered.length}개에 제목을 생성해 보강`
              );
            }
          }
        }
      } catch {
        signalNotes.push("개수 안정화(시드 제목 생성) 실패 — 보강 없이 진행");
      }
    }

    // 최종 제목을 Opus로 자연스러움·오타·비문 교정. 키워드 토큰 보존 + 쉼표 금지 +
    // 길이/기계적패턴 통과 시에만 교체하고, 실패 시 원본 제목을 유지한다(graceful).
    if (KEYWORD_AI_EXPANSION_ENABLED && diverseRankedResults.length > 0) {
      try {
        const polished = await reviseKeywordTitles(
          buildTitlePolishPrompt(diverseRankedResults, corpusTitles),
          KEYWORD_TITLE_POLISH_TIMEOUT_MS
        );
        const polishedByIndex = new Map(polished.map((p) => [p.index, p.title.trim()]));
        diverseRankedResults = diverseRankedResults.map((item, i) => {
          const next = polishedByIndex.get(i + 1);
          if (!next) return item;
          if (/[,，、]/.test(next)) return item;
          if (next.length < 12 || next.length > 32) return item;
          if (isAwkwardGeneratedTitle(next)) return item;
          // rule3 정합: 폴리시 제목도 같은 기준(두 단어 인접 + 조사 허용)으로 검사한다.
          // 원형-통째 강제는 "키워드 덩어리 + 절 연결" 비문만 통과시키던 원인이라 완화했다.
          if (!titleContainsMainKeyword(next, item.mainKeyword)) return item;
          // 제목이 바뀌면 검증(rule3 제목-키워드 정합, 길이, forbidden 겹침)이 달라질 수 있으므로
          // 재계산한다. 이게 없으면 폴리시가 분리 제목을 복구해도 isValid가 옛 값(X)으로 남는다.
          const updated = { ...item, title: next };
          return {
            ...updated,
            validation: validateKeywordOption(updated, forbiddenList, referenceList),
          };
        });
      } catch {
        // 제목 교정 실패 시 원본 제목을 그대로 유지한다.
        signalNotes.push("제목 자연화(폴리시) 실패 — 교정 전 제목으로 표시됨");
      }
    }

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
      notes: [...volumeGateNotes, ...signalNotes],
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
