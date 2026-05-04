import { NextRequest, NextResponse } from "next/server";
import { generateKeywords } from "@/lib/ai/claude";
import { generateKeywordCandidatesWithGpt } from "@/lib/ai/openaiKeywords";
import { CATEGORIES } from "@/lib/constants";
import { getShopById } from "@/lib/data/shops";
import { fetchBlogTitles } from "@/lib/naver/rssParser";
import {
  fetchCompetitorTitles,
  fetchKeywordDemandSignals,
  getExternalSearchSignals,
  NaverSearchDependencyError,
} from "@/lib/naver/searchSignals";
import {
  buildKeywordDiscoverySeeds,
  buildKeywordStrategyGuide,
  inferShopRegion,
} from "@/lib/keywords/seasonalStrategy";
import { buildTitleGenerationPrompt } from "@/lib/prompts/titlePrompt";
import { listSessions } from "@/lib/storage/sessionStore";
import { analyzeLanguageRisk } from "@/lib/validation/contentSignalAnalyzer";
import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { analyzeNetworkDuplicateRisk } from "@/lib/validation/networkDuplicateAnalyzer";
import { validateKeywordOption } from "@/lib/validation/keywordRules";
import { analyzeTitleBodyAlignment } from "@/lib/validation/titleBodyAlignment";
import type { KeywordOption, KeywordOptionAnalysis, SearchVolumeSignal } from "@/types";

export const maxDuration = 360;
const TARGET_RESULT_COUNT = 10;
const EXTERNAL_SIGNAL_TOP_K = TARGET_RESULT_COUNT;

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
  { label: "adaptation", patterns: [/적응/, /울렁/, /어지러/, /불편/, /실패/] },
  { label: "comparison", patterns: [/비교/, /돋보기/, /무엇/, /선택/] },
  { label: "target", patterns: [/40대/, /50대/, /부모님/, /중년/, /노안/] },
  { label: "driving", patterns: [/운전/, /야간/, /시야/] },
  { label: "office", patterns: [/업무/, /독서/, /사무/, /실내/, /컴퓨터/] },
  { label: "care", patterns: [/관리/, /보관/, /세척/, /착용/] },
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

function hasSameMaterial(a: KeywordOption, b: KeywordOption): boolean {
  const aMaterial = inferMaterialGroup(a);
  const bMaterial = inferMaterialGroup(b);
  return aMaterial.length > 0 && aMaterial === bMaterial;
}

function isTooSimilarTitle(a: KeywordOption, b: KeywordOption): boolean {
  const similarity = calculateTitleSimilarity(a.title, b.title);
  if (similarity >= 0.72) return true;
  if (similarity >= 0.48 && hasSameMaterial(a, b)) return true;

  const sameMainKeyword = a.mainKeyword.trim() === b.mainKeyword.trim();
  const sameSubKeyword1 = a.subKeyword1.trim() === b.subKeyword1.trim();
  const sameSubKeyword2 = a.subKeyword2.trim() === b.subKeyword2.trim();

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
  "파악",
  "파악하기",
  "필요한",
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

const SEMANTIC_TITLE_TEMPLATES: Record<string, string[]> = {
  안경수리: [
    "{main} 맡기기 전 확인할 부분",
    "{main} 가능한 경우와 어려운 경우",
    "{main} 전에 상태를 보는 기준",
  ],
  안경피팅: [
    "{main} 코패드가 눌릴 때",
    "{main} 흘러내림이 반복될 때",
    "{main} 착용감이 달라졌을 때",
  ],
  안경흘러내림: [
    "{main} 반복될 때 보는 부분",
    "{main} 코패드와 균형 문제",
    "{main} 피팅으로 확인할 부분",
  ],
  안경세척: [
    "{main} 렌즈 얼룩 남을 때",
    "{main} 코팅 손상 줄이는 습관",
    "{main} 물세척 전 확인할 부분",
  ],
  안경보관: [
    "{main} 렌즈 흠집 줄이는 습관",
    "{main} 테 변형 줄이는 방법",
    "{main} 습기 많은 날 주의점",
  ],
  안경김서림: [
    "{main} 겨울에 반복될 때",
    "{main} 마스크 쓸 때 줄이는 방법",
    "{main} 렌즈 관리로 보는 부분",
  ],
  원데이렌즈: [
    "{main} 건조할 때 확인할 점",
    "{main} 오래 낄 때 주의할 부분",
    "{main} 오후에 불편할 때",
  ],
  렌즈건조: [
    "{main} 오후에 심해지는 이유",
    "{main} 착용시간부터 보는 이유",
    "{main} 실내 환경과 관리 기준",
  ],
  안구건조: [
    "{main} 생활 습관에서 볼 부분",
    "{main} 렌즈 착용 때 심한 이유",
    "{main} 계절마다 달라지는 이유",
  ],
  어린이시력: [
    "{main} 근시가 의심될 때",
    "{main} 검사 시기를 보는 이유",
    "{main} 새학기 후 확인할 부분",
  ],
  누진렌즈: [
    "{main} 울렁임이 반복될 때",
    "{main} 시야가 어색할 때",
    "{main} 운전할 때 불편한 이유",
  ],
  노안안경: [
    "{main} 돋보기와 달라지는 부분",
    "{main} 가까운 글씨가 흐릴 때",
    "{main} 부모님 시야 확인할 때",
  ],
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
  if (total <= 3000) return 4;
  return -25;
}

function getDemandSignalScore(signal: SearchVolumeSignal): number {
  return (
    getMonthlyDemandScore(signal.monthlyTotalSearches) +
    getCompetitionScore(signal.competitionLabel)
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
    .filter((word) => word.length >= 2 && !COMMON_TITLE_WORDS.has(word));
}

function stripKoreanParticle(word: string): string {
  if (word === "어린이") return word;
  return word
    .replace(/(으로|부터|까지|처럼|보다)$/g, "")
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
      stripKoreanParticle(core.replace(/[^\uAC00-\uD7A3A-Za-z0-9]/g, "").trim())
    )
    .filter((core) => core.length >= 2 && !COMMON_TITLE_WORDS.has(core))
    .filter((core) => {
      if (seen.has(core)) return false;
      seen.add(core);
      return true;
    });
}

function pickKeywordCores(option: KeywordOption): [string, string] {
  const main = splitKeyword(option.mainKeyword);
  const head = main?.[0] ?? option.mainKeyword.trim().split(/\s+/)[0] ?? "";
  const mainCore = main?.[1] ?? "";
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const subCores = [splitKeyword(option.subKeyword1)?.[1], splitKeyword(option.subKeyword2)?.[1]]
    .filter((core): core is string => Boolean(core));
  const titleCores = extractTitleCoreWords(option.title).filter(
    (word) => word !== head && word !== mainCore && !option.mainKeyword.includes(word)
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

function composeRegionalTitle(mainKeyword: string, core1: string, core2: string): string | null {
  const main = splitKeyword(mainKeyword);
  if (!main) return null;
  const [region, mainCore] = main;

  if (mainCore === "안경점" && core1 === "안경렌즈" && core2 === "안경테") {
    return `${mainKeyword} 안경렌즈와 안경테 고를 때`;
  }
  if (mainCore === "안경") {
    const regionalCores = [core1, core2].filter((core) => core !== "안경점");
    const pickedCore1 = regionalCores[0] ?? "시력검사";
    const pickedCore2 = regionalCores[1] ?? (pickedCore1 === "시력검사" ? "안경렌즈" : "시력검사");
    const title = `${region} 안경 ${joinCores(pickedCore1, pickedCore2)} 볼 때`;
    if (title.length >= 15 && title.length <= 30) return title;
  }
  return null;
}

function renderSemanticTitle(mainKeyword: string, index: number): string | null {
  const head = splitKeyword(mainKeyword)?.[0] ?? "";
  const templates = SEMANTIC_TITLE_TEMPLATES[head];
  if (!templates?.length) return null;

  const ordered = templates.slice(index % templates.length).concat(templates);
  return ordered
    .map((template) => template.replace("{main}", mainKeyword))
    .find((title) => title.length >= 15 && title.length <= 30) ?? null;
}

function composeAlignedTitle(params: {
  mainKeyword: string;
  core1: string;
  core2: string;
  index: number;
}): string {
  const { mainKeyword, core1, core2, index } = params;
  const regionalTitle = composeRegionalTitle(mainKeyword, core1, core2);
  if (regionalTitle) return regionalTitle;
  const semanticTitle = renderSemanticTitle(mainKeyword, index);
  if (semanticTitle) return semanticTitle;

  const mainCore = splitKeyword(mainKeyword)?.[1] ?? "";
  const situationalTemplates = /적응|착용|관리|운전|선택/.test(mainCore)
    ? [`${mainKeyword} 중 불편할 때`, `${mainKeyword} 전 확인할 부분`]
    : [];
  const templates = [
    ...situationalTemplates,
    `${mainKeyword} ${core1} 확인할 점`,
    `${mainKeyword} 불편할 때 보는 부분`,
    `${mainKeyword} 관리할 때 볼 부분`,
    `${mainKeyword} 달라지는 이유`,
  ];
  const preferred = templates.slice(index % templates.length).concat(templates);
  return (
    preferred.find((title) => title.length >= 15 && title.length <= 30) ??
    `${mainKeyword} ${core1}`.slice(0, 30)
  );
}

function getSeasonalFallbackOptions(params: {
  categoryId: string;
  region: string;
  month: number;
}): KeywordOption[] {
  const { categoryId, region, month } = params;
  const keywordRegion = region.trim().split(/\s+/).at(-1) ?? region;
  const options: KeywordOption[] = [];

  if ((month === 3 || month === 9) && (categoryId === "eye-info" || categoryId === "lenses")) {
    options.push(
      {
        title: `${region} 어린이시력 검사 새학기 근시 확인`,
        mainKeyword: `${keywordRegion} 어린이시력`,
        subKeyword1: `${keywordRegion} 시력검사`,
        subKeyword2: `${keywordRegion} 어린이근시`,
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
        title: `${region} 어린이시력 검사 근시 확인할 때`,
        mainKeyword: `${keywordRegion} 어린이시력`,
        subKeyword1: `${keywordRegion} 시력검사`,
        subKeyword2: `${keywordRegion} 어린이근시`,
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
      title: `${region} 노안안경 부모님 시야 확인할 때`,
      mainKeyword: `${keywordRegion} 노안안경`,
      subKeyword1: `${keywordRegion} 노안렌즈`,
      subKeyword2: `${keywordRegion} 시력검사`,
    });
  }

  if (month >= 6 && month <= 8) {
    if (categoryId === "contacts") {
      options.push(
        {
          title: `${region} 렌즈건조 여름 착용과 관리`,
          mainKeyword: `${keywordRegion} 렌즈건조`,
          subKeyword1: `${keywordRegion} 렌즈착용`,
          subKeyword2: `${keywordRegion} 렌즈관리`,
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
        title: `${region} 변색렌즈 자외선 많은 날 기준`,
        mainKeyword: `${keywordRegion} 변색렌즈`,
        subKeyword1: `${keywordRegion} 자외선렌즈`,
        subKeyword2: `${keywordRegion} 안경렌즈`,
      });
    }
  }

  if (month >= 10 || month <= 2) {
    if (categoryId === "glasses-story") {
      options.push({
        title: `${region} 안경김서림 겨울 관리 방법`,
        mainKeyword: `${keywordRegion} 안경김서림`,
        subKeyword1: `${keywordRegion} 안경관리`,
        subKeyword2: `${keywordRegion} 안경세척`,
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

function isAwkwardGeneratedTitle(title: string): boolean {
  return (
    /이 있을 때|가 있을 때|소재와 선택 기준|가입도|주방|수치|재방문/.test(title) ||
    /다른 점|보는 것|파악하기|확인하는 방법|확인하는 법|진행 확인/.test(title) ||
    /안경수리.*(코패드|피팅).*달라지는 이유/.test(title) ||
    /안경수리 기준.*코패드/.test(title) ||
    /방법 원인과|관리와 코팅|피팅과 코패드/.test(title) ||
    /확인 확인|기준 기준|선택 선택/.test(title)
  );
}

const FALLBACK_KEYWORD_SETS: Record<
  string,
  Array<{ main: string; sub1: string; sub2: string; title: string }>
> = {
  progressive: [
    { main: "누진렌즈 적응", sub1: "누진렌즈 울렁임", sub2: "누진렌즈 시야", title: "누진렌즈 적응이 어려울 때 볼 부분" },
    { main: "누진다초점 렌즈", sub1: "누진다초점 적응", sub2: "누진다초점 시야", title: "누진다초점 렌즈 처음 쓸 때 차이" },
    { main: "노안안경 선택", sub1: "노안안경 돋보기", sub2: "노안안경 시야", title: "노안안경 선택 전 살펴볼 부분" },
    { main: "다초점렌즈 적응", sub1: "다초점렌즈 울렁임", sub2: "다초점렌즈 운전", title: "다초점렌즈 적응 중 불편한 이유" },
    { main: "돋보기 불편", sub1: "돋보기 시야", sub2: "돋보기 노안", title: "돋보기 불편할 때 확인할 시야 차이" },
    { main: "누진렌즈 운전", sub1: "누진렌즈 야간", sub2: "누진렌즈 시야", title: "누진렌즈 운전 야간과 시야 기준" },
    { main: "누진렌즈 도수", sub1: "누진렌즈 검사", sub2: "누진렌즈 시야", title: "누진렌즈 도수 검사와 시야 차이" },
    { main: "누진다초점 안경", sub1: "누진다초점 적응", sub2: "누진다초점 시야", title: "누진다초점 안경 적응과 시야 기준" },
    { main: "노안안경 도수", sub1: "노안안경 검사", sub2: "노안안경 시야", title: "노안안경 도수 검사와 시야 차이" },
    { main: "노안안경 착용감", sub1: "노안안경 돋보기", sub2: "노안안경 시야", title: "노안안경 착용감 돋보기와 시야 차이" },
    { main: "중근용렌즈 선택", sub1: "중근용렌즈 실내", sub2: "중근용렌즈 업무", title: "중근용렌즈 선택 실내와 업무 기준" },
    { main: "사무용렌즈 선택", sub1: "사무용렌즈 컴퓨터", sub2: "사무용렌즈 시야", title: "사무용렌즈 선택 컴퓨터와 시야 기준" },
    { main: "실내용누진 선택", sub1: "실내용누진 업무", sub2: "실내용누진 시야", title: "실내용누진 선택 업무와 시야 기준" },
  ],
  lenses: [
    { main: "렌즈교체 기준", sub1: "렌즈교체 시기", sub2: "렌즈교체 코팅", title: "렌즈교체 기준을 봐야 하는 경우" },
    { main: "안경렌즈 압축", sub1: "안경렌즈 두께", sub2: "안경렌즈 무게", title: "안경렌즈 압축할 때 달라지는 부분" },
    { main: "블루라이트렌즈 선택", sub1: "블루라이트렌즈 코팅", sub2: "블루라이트렌즈 눈피로", title: "블루라이트렌즈 선택 전 볼 부분" },
    { main: "근시억제렌즈 기준", sub1: "근시억제렌즈 어린이", sub2: "근시억제렌즈 검사", title: "근시억제렌즈 기준을 알아볼 때" },
    { main: "근시완화렌즈 기준", sub1: "근시완화렌즈 어린이", sub2: "근시완화렌즈 검사", title: "근시완화렌즈 기준을 확인할 부분" },
  ],
  frames: [
    { main: "안경피팅 기준", sub1: "안경피팅 코패드", sub2: "안경피팅 착용감", title: "안경피팅 코패드가 눌릴 때" },
    { main: "안경흘러내림 원인", sub1: "안경흘러내림 코패드", sub2: "안경흘러내림 피팅", title: "안경흘러내림 원인부터 살펴보기" },
    { main: "가벼운안경 선택", sub1: "가벼운안경 소재", sub2: "가벼운안경 착용감", title: "가벼운안경 선택할 때 보는 부분" },
  ],
  contacts: [
    { main: "렌즈충혈 원인", sub1: "렌즈충혈 착용", sub2: "렌즈충혈 건조", title: "렌즈충혈 원인을 살펴봐야 할 때" },
    { main: "렌즈건조 원인", sub1: "렌즈건조 착용", sub2: "렌즈건조 관리", title: "렌즈건조 원인과 착용 습관" },
    { main: "난시렌즈 선택", sub1: "난시렌즈 착용", sub2: "난시렌즈 검사", title: "난시렌즈 선택 전 확인할 부분" },
  ],
  "eye-info": [
    { main: "안구건조 원인", sub1: "안구건조 증상", sub2: "안구건조 관리", title: "안구건조 원인을 살펴봐야 할 때" },
    { main: "눈초점 흐림", sub1: "눈초점 피로", sub2: "눈초점 검사", title: "눈초점 흐림이 반복될 때" },
    { main: "어린이시력 관리", sub1: "어린이시력 검사", sub2: "어린이시력 근시", title: "어린이시력 관리에서 볼 부분" },
  ],
  "glasses-story": [
    { main: "안경김서림 원인", sub1: "안경김서림 관리", sub2: "안경김서림 렌즈", title: "안경김서림 원인과 관리 방법" },
    { main: "안경세척 방법", sub1: "안경세척 렌즈", sub2: "안경세척 코팅", title: "안경세척 방법을 바꿔야 할 때" },
    { main: "안경수리 기준", sub1: "안경수리 나사", sub2: "안경수리 테", title: "안경수리 맡기기 전 확인할 부분" },
  ],
};

function buildFallbackKeywordOptions(params: {
  region: string;
  categoryId: string;
  demandSignals: SearchVolumeSignal[];
}): KeywordOption[] {
  const region = params.region || inferRegionFromShopName("");
  const keywordRegion = region.trim().split(/\s+/).at(-1) ?? region;
  const month = new Date().getMonth() + 1;
  const regionalOptions: KeywordOption[] = [
    {
      title: `${region} 안경 맞출 때 먼저 보는 기준`,
      mainKeyword: `${keywordRegion} 안경`,
      subKeyword1: `${keywordRegion} 안경점`,
      subKeyword2: `${keywordRegion} 시력검사`,
    },
    {
      title: `${region} 안경점 렌즈와 테 고르는 기준`,
      mainKeyword: `${keywordRegion} 안경점`,
      subKeyword1: `${keywordRegion} 안경렌즈`,
      subKeyword2: `${keywordRegion} 안경테`,
    },
  ];

  const demandOptions = params.demandSignals
    .filter((signal) => {
      const total = signal.monthlyTotalSearches ?? 0;
      return total > 0 && total <= 1000 && signal.keyword.trim().split(/\s+/).length <= 2;
    })
    .sort((a, b) => getDemandSignalScore(b) - getDemandSignalScore(a))
    .slice(0, 6)
    .map((signal) => {
      const parts = signal.keyword.trim().split(/\s+/);
      const head = parts[0] ?? signal.keyword.trim();
      const main =
        parts.length >= 2 ? `${parts[0]} ${parts[1]}` : `${signal.keyword.trim()} 기준`;
      return {
        title: `${main} 알아볼 때 확인할 부분`,
        mainKeyword: main,
        subKeyword1: `${head} 기준`,
        subKeyword2: `${head} 관리`,
      };
    });

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

  return [...seasonalOptions, ...regionalOptions, ...demandOptions, ...categoryOptions].slice(0, 28);
}

function alignTitleWithKeywords(option: KeywordOption, index: number): KeywordOption {
  const main = splitKeyword(option.mainKeyword);
  if (!main) return option;

  const [head] = main;
  const [core1, core2] = pickKeywordCores(option);
  const subKeyword1 = `${head} ${core1}`;
  const subKeyword2 = `${head} ${core2}`;

  if (
    option.title.includes(option.mainKeyword) &&
    option.title.length >= 15 &&
    option.title.length <= 30 &&
    !isAwkwardGeneratedTitle(option.title)
  ) {
    return {
      ...option,
      subKeyword1,
      subKeyword2,
    };
  }

  return {
    ...option,
    subKeyword1,
    subKeyword2,
    title: composeAlignedTitle({
      mainKeyword: option.mainKeyword,
      core1,
      core2,
      index,
    }),
  };
}

function normalizeGeneratedOptions(options: KeywordOption[]): KeywordOption[] {
  return options
    .map((option) => ({
      title: option.title.trim().replace(/\s+/g, " "),
      mainKeyword: option.mainKeyword.trim().replace(/\s+/g, " "),
      subKeyword1: option.subKeyword1.trim().replace(/\s+/g, " "),
      subKeyword2: option.subKeyword2.trim().replace(/\s+/g, " "),
    }))
    .map((option, index) => alignTitleWithKeywords(option, index))
    .filter((option) => {
      if (!option.title.includes(option.mainKeyword)) return false;
      return true;
    })
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
아래 후보는 이미 네이버 검색량과 지역성을 기준으로 코드가 압축한 후보입니다.
새 키워드를 크게 발명하지 말고, 후보를 바탕으로 10개만 선별·정리하세요.

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

[규칙]
- 제목 15~30자.
- 메인 키워드는 제목 첫머리 또는 앞쪽에 원형 그대로 반드시 포함.
- 메인/서브 키워드는 정확히 2단어 조합.
- 서브 키워드 2개는 본문 확장 소재입니다. 제목에 억지로 모두 넣지 마세요.
- 예: title="누진렌즈 울렁임 원인과 적응 기준" / main="누진렌즈 울렁임" / sub1="누진렌즈 원인" / sub2="누진렌즈 적응"
- 예: title="장림 안경점 안경렌즈와 안경테 고를 때" / main="장림 안경점" / sub1="장림 안경렌즈" / sub2="장림 안경테"
- 제목은 메인 키워드와 독자의 상황이 자연스럽게 읽혀야 합니다.
- 같은 소재 반복 금지.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 의료 단정 금지. 근시억제/근시완화는 정보형 기준 문장으로만 다룰 것.
- 사람이 직접 쓴 제목처럼 자연스럽게 작성. 키워드 나열식 금지.
- 지역 키워드는 방문 전환형 후보에 자연스럽게 사용하되 모든 제목에 억지로 넣지 말 것.
- 큰 도시는 시 전체보다 구/동/역세권·생활권 지역명을 우선할 것. 예: 부산 전체보다 장림/서면, 대전 전체보다 둔산동/유성.
- 시즌 키워드는 현재 월과 카테고리가 맞을 때만 제목 각도로 반영할 것. 억지로 계절어를 붙이지 말 것.
- 좋은 구조: 지역/생활권 + 핵심키워드 + 시즌·상황 + 확인 기준.
- "A와 B 선택 기준", "A B C 기준", "소재와 선택 기준", "확인 기준과 관리", "살펴보기"처럼 기계적인 제목 금지.
- "안경피팅과 코패드 달라지는 이유", "관리와 코팅 확인할 점"처럼 두 소재를 억지로 붙인 제목 금지.
- 실제 검색어로 어색한 조합 금지: 주방, 가입도, 수치, 재방문 같은 단어를 억지로 붙이지 말 것.
- 제목에 넣기 어려운 서브 키워드는 만들지 말고, 제목에 자연스럽게 들어갈 수 있는 서브 키워드로 바꿀 것.
- 좋은 제목 예:
  - 누진렌즈 울렁임 원인과 적응 기준
  - 장림 안경점 안경렌즈와 안경테 고를 때
  - 근시억제렌즈 어린이 검사 시기
  - 안경피팅 코패드와 착용감 차이
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

function pickDiverseKeywordResults<T extends KeywordOption & { _priorityScore: number }>(
  rankedResults: T[]
): T[] {
  const selected: T[] = [];

  for (const candidate of rankedResults) {
    if (selected.length >= TARGET_RESULT_COUNT) break;
    const materialCount = selected.filter((picked) => hasSameMaterial(candidate, picked)).length;
    if (
      materialCount === 0 &&
      selected.every((picked) => !isTooSimilarTitle(candidate, picked))
    ) {
      selected.push(candidate);
    }
  }

  if (selected.length >= TARGET_RESULT_COUNT) {
    return selected;
  }

  for (const candidate of rankedResults) {
    if (selected.includes(candidate)) continue;
    if (selected.length >= TARGET_RESULT_COUNT) break;
    const hasExactDuplicate = selected.some(
      (picked) =>
        normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
        (picked.mainKeyword === candidate.mainKeyword &&
          picked.subKeyword1 === candidate.subKeyword1 &&
          picked.subKeyword2 === candidate.subKeyword2)
    );
    if (hasExactDuplicate) continue;

    const weakestSimilarity = Math.max(
      ...selected.map((picked) => calculateTitleSimilarity(candidate.title, picked.title))
    );
    const materialCount = selected.filter((picked) => hasSameMaterial(candidate, picked)).length;

    if (weakestSimilarity < 0.9 && materialCount < 2) {
      selected.push(candidate);
    }
  }

  if (selected.length < TARGET_RESULT_COUNT) {
    for (const candidate of rankedResults) {
      if (selected.includes(candidate)) continue;
      if (selected.length >= TARGET_RESULT_COUNT) break;
      const hasExactDuplicate = selected.some(
        (picked) =>
          normalizeTitleForComparison(picked.title) === normalizeTitleForComparison(candidate.title) ||
          (picked.mainKeyword === candidate.mainKeyword &&
            picked.subKeyword1 === candidate.subKeyword1 &&
            picked.subKeyword2 === candidate.subKeyword2)
      );
      if (!hasExactDuplicate) {
        selected.push(candidate);
      }
    }
  }

  if (selected.length === 0) return rankedResults.slice(0, TARGET_RESULT_COUNT);
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

function findDemandSignalForKeyword(
  keyword: string,
  demandSignals: SearchVolumeSignal[]
): SearchVolumeSignal | undefined {
  const normalized = keyword.replace(/\s+/g, "").toLowerCase();
  return demandSignals.find(
    (signal) => signal.keyword.replace(/\s+/g, "").toLowerCase() === normalized
  );
}

type AnalyzedKeyword = KeywordOption & {
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
      if (seeds.length >= 12) return seeds;
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

  return getMonthlyDemandScore(bestTotal) + bestTrend + bestCompetition;
}

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
  demandSignals?: SearchVolumeSignal[];
}): Promise<AnalyzedKeyword[]> {
  const { rawOptions, forbiddenList, referenceList, competitorList, demandSignals = [] } = params;

  return Promise.all(
    rawOptions.map(async (option) => {
      const validation = validateKeywordOption(option, forbiddenList, referenceList);
      const analysis = await buildKeywordAnalysis({
        option,
        forbiddenList,
        referenceList,
        competitorList,
      });
      const demandSignal = findDemandSignalForKeyword(option.mainKeyword, demandSignals);
      return {
        ...option,
        analysis,
        validation,
        _priorityScore:
          getKeywordPriorityScore({ validation, analysis }) +
          (demandSignal ? getDemandSignalScore(demandSignal) : 0),
      };
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId, topic } = body as {
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

    const discoverySeeds = buildKeywordDiscoverySeeds({
      shop,
      category,
      topic,
    });

    let demandSignals: SearchVolumeSignal[] = [];
    try {
      demandSignals = await fetchKeywordDemandSignals(discoverySeeds);
    } catch {
      // 검색광고 월간 검색량 조회 실패 시에도 기존 네이버 검색/트렌드 기반 생성은 계속한다.
    }

    const strategyGuide = buildKeywordStrategyGuide({
      shop,
      category,
      topic,
      demandSignals,
    });

    const fallbackBatch = buildFallbackKeywordOptions({
      region: inferShopRegion(shop),
      categoryId: category.id,
      demandSignals,
    });

    let baseCandidates = fallbackBatch;
    try {
      const gptCandidates = await generateKeywordCandidatesWithGpt({
        shopName: shop.name,
        region: inferShopRegion(shop),
        categoryName: category.name,
        topic,
        demandSignals,
        strategyGuide,
        fallbackCandidates: fallbackBatch,
      });
      if (gptCandidates && gptCandidates.length > 0) {
        const seen = new Set<string>();
        baseCandidates = normalizeGeneratedOptions([...gptCandidates, ...fallbackBatch]).filter((candidate) => {
          const key = `${candidate.title}|${candidate.mainKeyword}`.trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    } catch {
      // GPT 후보 확장 실패 시 로컬 후보만 사용한다.
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
    try {
      firstBatch = normalizeGeneratedOptions(await generateKeywords(firstPrompt, 90_000));
    } catch {
      firstBatch = normalizeGeneratedOptions(baseCandidates);
      usedFallbackBatch = true;
    }

    const firstBatchSeen = new Set<string>();
    firstBatch = [...firstBatch, ...normalizeGeneratedOptions(baseCandidates)].filter((candidate) => {
      const key = `${candidate.title}|${candidate.mainKeyword}`;
      if (firstBatchSeen.has(key)) return false;
      firstBatchSeen.add(key);
      return true;
    }).slice(0, TARGET_RESULT_COUNT * 4);

    if (!Array.isArray(firstBatch) || firstBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: "키워드 후보를 생성하지 못했습니다. 입력 조건을 다시 확인해주세요." },
        { status: 500 }
      );
    }

    try {
      const candidateCompetitorList = await fetchCompetitorTitles(
        collectCandidateSearchSeeds(firstBatch),
        10
      );
      competitorList = Array.from(new Set([...competitorList, ...candidateCompetitorList]));
    } catch {
      // 후보 키워드별 상위 제목 조회 실패 시 기존 카테고리 기반 경쟁 제목만 사용한다.
    }

    const analyzed = await analyzeOptions({
      rawOptions: firstBatch,
      forbiddenList,
      referenceList,
      competitorList,
      demandSignals,
    });

    let cleanCandidates = analyzed.filter(isCleanCandidate);

    if (!usedFallbackBatch && cleanCandidates.length < 4) {
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
        const retryBatch = await generateKeywords(retryPrompt, 180_000);
        if (Array.isArray(retryBatch) && retryBatch.length > 0) {
          const retryAnalyzed = await analyzeOptions({
            rawOptions: retryBatch,
            forbiddenList,
            referenceList,
            competitorList,
            demandSignals,
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
    let rankedResults: AnalyzedKeyword[] = [...cleanCandidates]
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .slice(0, TARGET_RESULT_COUNT);

    if (rankedResults.length < TARGET_RESULT_COUNT) {
      const selectedKeys = new Set(
        rankedResults.map((item) => `${item.title}|${item.mainKeyword}`)
      );
      const backfill = analyzed
        .filter((item) => !selectedKeys.has(`${item.title}|${item.mainKeyword}`))
        .filter((item) => item.validation.isValid)
        .sort((a, b) => b._priorityScore - a._priorityScore)
        .slice(0, TARGET_RESULT_COUNT - rankedResults.length);
      rankedResults = [...rankedResults, ...backfill];
    }

    if (rankedResults.length < TARGET_RESULT_COUNT) {
      const selectedKeys = new Set(
        rankedResults.map((item) => `${item.title}|${item.mainKeyword}`)
      );
      const emergencyBackfill = analyzed
        .filter((item) => !selectedKeys.has(`${item.title}|${item.mainKeyword}`))
        .sort((a, b) => b._priorityScore - a._priorityScore)
        .slice(0, TARGET_RESULT_COUNT - rankedResults.length);
      rankedResults = [...rankedResults, ...emergencyBackfill];
    }

    const diverseRankedResults = pickDiverseKeywordResults(rankedResults);
    const topForExternalSignals = diverseRankedResults.slice(0, EXTERNAL_SIGNAL_TOP_K);

    const externalSignalEntries: Array<
      readonly [string, KeywordOptionAnalysis["externalSignals"] | undefined]
    > = [];
    for (const item of topForExternalSignals) {
      try {
        const externalSignals = await getExternalSearchSignals({
          title: item.title,
          mainKeyword: item.mainKeyword,
          subKeyword1: item.subKeyword1,
          subKeyword2: item.subKeyword2,
        });
        externalSignalEntries.push([item.title, externalSignals] as const);
      } catch {
        externalSignalEntries.push([item.title, undefined] as const);
      }
    }

    const externalSignalMap = new Map(externalSignalEntries);

    const demandRankedResults = [...diverseRankedResults].sort((a, b) => {
      const aScore = a._priorityScore + getExternalDemandScore(externalSignalMap.get(a.title));
      const bScore = b._priorityScore + getExternalDemandScore(externalSignalMap.get(b.title));
      return bScore - aScore;
    });

    const results = demandRankedResults.map((item) => {
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
