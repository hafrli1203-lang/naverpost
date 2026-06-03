import type { KeywordOption } from "@/types";

export interface KeywordCombinerParams {
  categoryId: string;
  region?: string;
  coreHeads: string[];
  modifiers?: string[];
  coreModifiersByHead?: Record<string, string[]>;
  maxModifiersPerHead?: number;
  maxCandidates?: number;
}

const DEFAULT_MAX_MODIFIERS_PER_HEAD = 6;
const DEFAULT_MAX_CANDIDATES = 60;

const FALLBACK_MODIFIERS_BY_CATEGORY: Record<string, string[]> = {
  progressive: ["적응", "울렁임", "시야", "도수", "운전", "검사", "처음", "업무"],
  lenses: ["선택", "교체", "두께", "압축", "코팅", "도수", "눈피로", "자외선"],
  frames: ["착용감", "피팅", "얼굴형", "무게", "소재", "코패드", "흘러내림", "사이즈"],
  contacts: ["건조", "충혈", "이물감", "흐림", "검사", "착용감", "착용시간", "난시"],
  "eye-info": ["원인", "증상", "검사", "관리", "습관", "피로", "흐림", "운전"],
  "glasses-story": ["원인", "방법", "관리", "교체", "세척", "보관", "피팅", "착용감"],
};

const GENERIC_MODIFIERS = [
  "적응",
  "울렁임",
  "시야",
  "도수",
  "관리",
  "착용감",
  "원인",
  "검사",
];

const SUBKEYWORD_FALLBACK_MODIFIERS = [
  "원인",
  "관리",
  "검사",
  "선택",
  "착용감",
  "시야",
  "도수",
  "방법",
];

const VISIT_INTENT_MODIFIERS = [
  "처음",
  "검사",
  "도수",
  "착용감",
  "시야",
  "불편",
  "적응",
  "선택",
];

const HEAD_SEMANTIC_MODIFIERS: Array<{ patterns: RegExp[]; modifiers: string[] }> = [
  {
    patterns: [/운전렌즈|야간|눈부심/],
    modifiers: ["야간", "시야", "눈부심", "도수", "검사", "선택", "불편"],
  },
  {
    patterns: [/실내렌즈|사무용렌즈|중근용렌즈|실내용누진/],
    modifiers: ["업무", "독서", "거리", "시야", "도수", "선택", "피로"],
  },
  {
    patterns: [/누진|다초점/],
    modifiers: ["처음", "적응", "울렁임", "시야", "도수", "검사", "운전"],
  },
  {
    patterns: [/노안렌즈|노안안경/],
    modifiers: ["도수", "시야", "검사", "돋보기", "처음", "착용감", "생활거리"],
  },
  {
    patterns: [/돋보기안경/],
    modifiers: ["도수", "시야", "검사", "착용감", "가까운글씨", "노안"],
  },
  {
    patterns: [/안경피팅|안경흘러내림|코패드|안경코받침/],
    modifiers: ["착용감", "흘러내림", "코패드", "귀통증", "조정", "균형"],
  },
  {
    patterns: [/안경테|티타늄|울템|뿔테|메탈|하금테|무테|반무테|큰안경|둥근안경|사각안경/],
    modifiers: ["착용감", "무게", "얼굴형", "소재", "피팅", "관리", "사이즈"],
  },
  {
    patterns: [/원데이|콘택트|소프트|하드|난시렌즈|컬러렌즈|멀티포컬|토릭|렌즈건조|렌즈충혈|렌즈이물감|렌즈흐림|렌즈착용/],
    modifiers: ["건조", "착용감", "착용시간", "검사", "난시", "충혈", "관리"],
  },
];

function normalizeKeywordPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKeywordKey(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function isSingleToken(value: string): boolean {
  return normalizeKeywordPart(value).split(/\s+/).length === 1;
}

function isValidTwoWordKeyword(value: string): boolean {
  const parts = normalizeKeywordPart(value).split(/\s+/);
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

function uniqueWords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeKeywordPart(value);
    const key = normalizeKeywordKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildModifierPool(categoryId: string, modifiers?: string[]): string[] {
  return uniqueWords([
    ...(modifiers ?? []),
    ...(FALLBACK_MODIFIERS_BY_CATEGORY[categoryId] ?? []),
    ...GENERIC_MODIFIERS,
  ]).filter(isSingleToken);
}

function getHeadSemanticModifiers(head: string): string[] {
  return HEAD_SEMANTIC_MODIFIERS.find((group) =>
    group.patterns.some((pattern) => pattern.test(head))
  )?.modifiers ?? [];
}

function buildHeadModifierPool(params: {
  categoryId: string;
  head: string;
  modifiers?: string[];
  coreModifiersByHead?: Record<string, string[]>;
}): string[] {
  const direct = params.coreModifiersByHead?.[params.head] ?? [];
  const semantic = getHeadSemanticModifiers(params.head);
  const category = FALLBACK_MODIFIERS_BY_CATEGORY[params.categoryId] ?? [];
  return uniqueWords([
    ...direct,
    ...semantic,
    ...VISIT_INTENT_MODIFIERS,
    ...(params.modifiers ?? []),
    ...category,
    ...GENERIC_MODIFIERS,
  ]).filter(isSingleToken);
}

function isWeakHeadModifierPair(head: string, modifier: string): boolean {
  const key = `${head} ${modifier}`;
  if (/운전렌즈 업무|운전렌즈 독서|운전렌즈 실내/.test(key)) return true;
  if (/실내렌즈 운전|사무용렌즈 운전|중근용렌즈 운전/.test(key)) return true;
  if (/돋보기안경 울렁임|노안렌즈 운전|노안렌즈 업무/.test(key)) return true;
  if (/렌즈건조 난시|렌즈충혈 난시|렌즈이물감 난시/.test(key)) return true;
  if (normalizeKeywordKey(head).includes(normalizeKeywordKey(modifier))) return true;
  return false;
}

function pickSubKeywordModifiers(
  head: string,
  modifierPool: string[],
  mainModifier: string
): [string, string] {
  const normalizedHead = normalizeKeywordKey(head);
  const pool = uniqueWords([...modifierPool, ...SUBKEYWORD_FALLBACK_MODIFIERS]).filter(
    (modifier) => {
      const normalizedModifier = normalizeKeywordKey(modifier);
      return (
        normalizedModifier !== normalizeKeywordKey(mainModifier) &&
        !normalizedHead.includes(normalizedModifier)
      );
    }
  );
  return [pool[0] ?? "관리", pool[1] ?? "검사"];
}

export function combineKeywords(params: KeywordCombinerParams): KeywordOption[] {
  void params.region;

  const maxModifiersPerHead = Math.max(
    1,
    params.maxModifiersPerHead ?? DEFAULT_MAX_MODIFIERS_PER_HEAD
  );
  const maxCandidates = Math.max(1, params.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
  const heads = uniqueWords(params.coreHeads).filter(isSingleToken);
  const categoryModifierPool = buildModifierPool(params.categoryId, params.modifiers);
  const options: KeywordOption[] = [];
  const seen = new Set<string>();

  for (const head of heads) {
    const modifierPool = buildHeadModifierPool({
      categoryId: params.categoryId,
      head,
      modifiers: params.modifiers,
      coreModifiersByHead: params.coreModifiersByHead,
    });
    const modifiersForHead = modifierPool
      .filter((modifier) => normalizeKeywordKey(head) !== normalizeKeywordKey(modifier))
      .filter((modifier) => !normalizeKeywordKey(head).includes(normalizeKeywordKey(modifier)))
      .filter((modifier) => !isWeakHeadModifierPair(head, modifier))
      .slice(0, maxModifiersPerHead);

    for (const modifier of modifiersForHead) {
      const mainKeyword = `${head} ${modifier}`;
      if (!isValidTwoWordKeyword(mainKeyword)) continue;

      const key = normalizeKeywordKey(mainKeyword);
      if (seen.has(key)) continue;
      seen.add(key);

      const [sub1Modifier, sub2Modifier] = pickSubKeywordModifiers(
        head,
        [...modifierPool, ...categoryModifierPool],
        modifier
      );
      const subKeyword1 = `${head} ${sub1Modifier}`;
      const subKeyword2 = `${head} ${sub2Modifier}`;

      if (!isValidTwoWordKeyword(subKeyword1) || !isValidTwoWordKeyword(subKeyword2)) continue;

      options.push({
        title: "",
        mainKeyword,
        subKeyword1,
        subKeyword2,
      });

      if (options.length >= maxCandidates) return options;
    }
  }

  return options;
}
