import type { Category, KeywordOption, Shop } from "@/types";

type ProductCatalogEntry = {
  head: string;
  categories: string[];
  aliases?: string[];
  modifiers: string[];
};

const PRODUCT_CATALOG: ProductCatalogEntry[] = [
  {
    head: "마이오스마트",
    categories: ["lenses", "eye-info"],
    aliases: ["마이오스마트렌즈", "어린이근시억제렌즈"],
    modifiers: ["어린이", "근시", "검사", "관리", "도수", "착용감"],
  },
  {
    head: "에실로렌즈",
    categories: ["lenses", "progressive"],
    aliases: ["에실로", "바리락스"],
    modifiers: ["누진렌즈", "시야", "도수", "검사", "선택", "안경렌즈"],
  },
  {
    head: "자이스렌즈",
    categories: ["lenses", "progressive"],
    aliases: ["자이스", "자이스 안경렌즈"],
    modifiers: ["시야", "도수", "누진렌즈", "검사", "선택", "안경렌즈"],
  },
  {
    head: "호야렌즈",
    categories: ["lenses", "progressive"],
    aliases: ["호야", "호야 안경렌즈"],
    modifiers: ["두께", "도수", "누진렌즈", "검사", "선택", "안경렌즈"],
  },
  {
    head: "니콘렌즈",
    categories: ["lenses", "progressive"],
    aliases: ["니콘", "니콘 안경렌즈"],
    modifiers: ["코팅", "도수", "누진렌즈", "검사", "선택", "안경렌즈"],
  },
  {
    head: "케미렌즈",
    categories: ["lenses"],
    aliases: ["케미", "케미광학"],
    modifiers: ["코팅", "압축", "도수", "교체", "선택", "안경렌즈"],
  },
  {
    head: "토카이렌즈",
    categories: ["lenses"],
    aliases: ["토카이"],
    modifiers: ["고굴절", "두께", "도수", "검사", "선택", "안경렌즈"],
  },
  {
    head: "로우로우안경",
    categories: ["frames"],
    aliases: ["로우로우", "제일 가벼운안경테 로우로우"],
    modifiers: ["가벼움", "착용감", "무게", "피팅", "얼굴형", "선택"],
  },
  {
    head: "카린안경",
    categories: ["frames"],
    aliases: ["카린", "카린 안경테", "카린 선글라스"],
    modifiers: ["안경테", "선글라스", "얼굴형", "착용감", "디자인", "선택"],
  },
  {
    head: "나인어코드",
    categories: ["frames"],
    aliases: ["나인어코드안경", "멋쟁이 안경 나인어코드"],
    modifiers: ["안경테", "디자인", "얼굴형", "착용감", "선택", "피팅"],
  },
  {
    head: "카페인안경",
    categories: ["frames"],
    aliases: ["카페인", "포인트안경 카페인", "카페인 안경"],
    modifiers: ["안경테", "디자인", "얼굴형", "착용감", "선택", "피팅"],
  },
  {
    head: "BYWP안경",
    categories: ["frames"],
    aliases: ["BYWP", "독일 명품 BYWP", "BYWP 안경"],
    modifiers: ["안경테", "디자인", "얼굴형", "착용감", "무게", "피팅"],
  },
  {
    head: "레이벤선글라스",
    categories: ["frames", "lenses"],
    aliases: ["레이벤", "레이벤 선글라스"],
    modifiers: ["선글라스", "렌즈교체", "착용감", "얼굴형", "피팅", "자외선", "선택"],
  },
  {
    head: "아큐브렌즈",
    categories: ["contacts"],
    aliases: ["아큐브", "아큐브 오아시스", "아큐브 모이스트"],
    modifiers: ["원데이", "건조", "난시", "착용감", "착용시간", "검사"],
  },
  {
    head: "알콘렌즈",
    categories: ["contacts"],
    aliases: ["알콘", "데일리스", "토탈원"],
    modifiers: ["원데이", "건조", "착용감", "착용시간", "난시", "검사"],
  },
  {
    head: "쿠퍼비전렌즈",
    categories: ["contacts"],
    aliases: ["쿠퍼", "쿠퍼비전", "바이오피니티"],
    modifiers: ["난시", "멀티포컬", "착용감", "건조", "검사", "착용시간"],
  },
  {
    head: "바슈롬렌즈",
    categories: ["contacts"],
    aliases: ["바슈롬"],
    modifiers: ["원데이", "난시", "착용감", "건조", "관리", "검사"],
  },
];

const CATEGORY_DEFAULT_PRODUCTS: Record<string, string[]> = {
  progressive: ["에실로렌즈", "자이스렌즈", "호야렌즈", "니콘렌즈"],
  lenses: ["마이오스마트", "에실로렌즈", "자이스렌즈", "호야렌즈", "니콘렌즈", "케미렌즈", "토카이렌즈"],
  frames: ["로우로우안경", "카린안경", "나인어코드", "레이벤선글라스"],
  contacts: ["아큐브렌즈", "알콘렌즈", "쿠퍼비전렌즈", "바슈롬렌즈"],
  "eye-info": ["마이오스마트"],
  "glasses-story": ["레이벤선글라스"],
};

const GENERIC_PRODUCT_MODIFIERS: Record<string, string[]> = {
  progressive: ["누진렌즈", "시야", "도수", "적응", "검사", "선택"],
  lenses: ["안경렌즈", "도수", "코팅", "두께", "교체", "선택"],
  frames: ["안경테", "착용감", "얼굴형", "무게", "피팅", "선택"],
  contacts: ["원데이", "건조", "난시", "착용감", "착용시간", "검사"],
  "eye-info": ["근시", "검사", "관리", "도수", "습관", "어린이"],
  "glasses-story": ["렌즈교체", "관리", "피팅", "세척", "착용감", "선택"],
};

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, "").replace(/[.·,/|()[\]-]/g, "").toLowerCase();
}

function normalizeHead(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[.·,/|()[\]-]/g, "")
    .replace(/안경테선글라스/g, "안경")
    .replace(/^제일가벼운안경테/g, "")
    .replace(/^가벼운안경테/g, "")
    .replace(/^멋쟁이안경/g, "")
    .replace(/^포인트안경/g, "")
    .replace(/^독일명품/g, "")
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalizeKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function entryMatchesCategory(entry: ProductCatalogEntry, categoryId: string): boolean {
  return entry.categories.includes(categoryId);
}

function matchCatalogEntry(raw: string, categoryId: string): ProductCatalogEntry | undefined {
  const key = normalizeKey(raw);
  return PRODUCT_CATALOG.find((entry) => {
    if (!entryMatchesCategory(entry, categoryId)) return false;
    const aliases = [entry.head, ...(entry.aliases ?? [])].map(normalizeKey);
    return aliases.some((alias) => key.includes(alias) || alias.includes(key));
  });
}

function extractFreeformProductHeads(values: string[], categoryId: string): string[] {
  return values
    .flatMap((value) => value.split(/\n|,|\/|·|\|/g))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .map((value) => matchCatalogEntry(value, categoryId)?.head ?? normalizeHead(value))
    .filter((value) => value.length >= 2 && value.length <= 12)
    .filter((value) => isFreeformHeadAllowedForCategory(value, categoryId))
    .filter((value) => !/맞춤|상담|진행|무료|교체$|추천|솔루션|니즈|선택으로|정밀측정|가맹점$/.test(value));
}

function isFreeformHeadAllowedForCategory(head: string, categoryId: string): boolean {
  if (categoryId === "contacts") {
    return /콘택트|렌즈|아큐브|알콘|쿠퍼|바슈롬|바이오피니티|데일리스|토탈원|원데이|난시|컬러|하드|소프트|멀티포컬|토릭/.test(head);
  }
  if (categoryId === "frames") {
    return /안경|안경테|선글라스|로우로우|카린|나인어코드|레이벤|울템|티타늄|메탈|하금테|뿔테|무테|BYWP|카페인/.test(head);
  }
  if (categoryId === "lenses") {
    return /렌즈|마이오스마트|에실로|자이스|호야|니콘|케미|토카이|안경알|블루라이트|변색|고굴절|압축|코팅|편광|근시/.test(head);
  }
  if (categoryId === "progressive") {
    return /누진|다초점|노안|사무용|실내용|중근용|에실로|자이스|호야|니콘|바리락스/.test(head);
  }
  return true;
}

export function getCategoryProductHeads(categoryId: string): string[] {
  return CATEGORY_DEFAULT_PRODUCTS[categoryId] ?? [];
}

export function getShopProductHeads(params: {
  shop: Shop;
  category: Category;
}): string[] {
  const source = [
    ...(params.shop.mainProducts ?? []),
    ...(params.shop.serviceStrengths ?? []),
  ];
  const catalogMatches = source
    .map((value) => matchCatalogEntry(value, params.category.id)?.head)
    .filter((value): value is string => Boolean(value));
  const freeform = extractFreeformProductHeads(params.shop.mainProducts ?? [], params.category.id);

  return unique([
    ...catalogMatches,
    ...freeform,
    ...getCategoryProductHeads(params.category.id),
  ]).slice(0, 14);
}

export function getProductModifiers(params: {
  categoryId: string;
  heads: string[];
}): string[] {
  const matchedModifiers = params.heads.flatMap((head) => {
    const entry = PRODUCT_CATALOG.find((item) => item.head === head);
    return entry?.modifiers ?? [];
  });
  return unique([
    ...matchedModifiers,
    ...(GENERIC_PRODUCT_MODIFIERS[params.categoryId] ?? []),
  ]).slice(0, 18);
}

export function getProductModifiersByHead(params: {
  categoryId: string;
  heads: string[];
}): Record<string, string[]> {
  const fallback = GENERIC_PRODUCT_MODIFIERS[params.categoryId] ?? ["선택", "검사", "착용감"];
  return Object.fromEntries(
    params.heads.map((head) => {
      const entry = PRODUCT_CATALOG.find((item) => item.head === head);
      return [head, unique([...(entry?.modifiers ?? []), ...fallback]).slice(0, 8)];
    })
  );
}

function pickProductSubModifiers(params: {
  categoryId: string;
  mainModifier: string;
  modifiers: string[];
}): [string, string] {
  const fallback = GENERIC_PRODUCT_MODIFIERS[params.categoryId] ?? ["선택", "검사"];
  const pool = unique([...params.modifiers, ...fallback])
    .filter((modifier) => modifier !== params.mainModifier);
  const discomfort = /착용감|건조|시야|흐림|불편|울렁임|도수/.test(params.mainModifier);
  const preferred = discomfort
    ? pool.filter((modifier) => !/선택|차이|디자인|렌즈교체|안경테|선글라스|안경렌즈|원데이/.test(modifier))
    : pool;
  const selected = preferred.length >= 2 ? preferred : pool;
  return [selected[0] ?? "선택", selected[1] ?? "검사"];
}

export function buildProductKeywordOptions(params: {
  shop: Shop;
  category: Category;
  maxPerHead?: number;
}): KeywordOption[] {
  const heads = getShopProductHeads({ shop: params.shop, category: params.category });
  const modifiersByHead = getProductModifiersByHead({
    categoryId: params.category.id,
    heads,
  });
  const maxPerHead = params.maxPerHead ?? 3;
  const options: KeywordOption[] = [];
  const seen = new Set<string>();

  for (const head of heads) {
    const modifiers = modifiersByHead[head] ?? [];
    for (const modifier of modifiers.slice(0, maxPerHead)) {
      if (normalizeKey(head).includes(normalizeKey(modifier))) continue;
      const mainKeyword = `${head} ${modifier}`;
      const key = normalizeKey(mainKeyword);
      if (seen.has(key)) continue;
      seen.add(key);

      const [sub1, sub2] = pickProductSubModifiers({
        categoryId: params.category.id,
        mainModifier: modifier,
        modifiers,
      });
      options.push({
        title: "",
        mainKeyword,
        subKeyword1: `${head} ${sub1}`,
        subKeyword2: `${head} ${sub2}`,
      });
    }
  }

  return options.slice(0, 40);
}
