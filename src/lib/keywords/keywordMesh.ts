import type { Category, KeywordOption, Shop } from "@/types";
import { getShopProductHeads } from "@/lib/keywords/productKeywordCatalog";

type MeshCategoryAxes = {
  heads: string[];
  targets: string[];
  features: string[];
  materials: string[];
  situations: string[];
  trendTerms: string[];
  subCores: string[];
};

const GLOBAL_TARGETS = [
  "10대",
  "20대",
  "30대",
  "40대",
  "50대",
  "60대",
  "여자",
  "남자",
  "학생",
  "청소년",
  "직장인",
  "중년",
  "부모님",
  "어머니",
  "아버지",
];

const GLOBAL_FEATURES = [
  "가벼운",
  "튼튼한",
  "편한",
  "편안한",
  "큰사이즈",
  "빅사이즈",
  "오버사이즈",
  "블루라이트차단",
  "운전용",
  "골프",
  "명품",
  "고급",
  "가성비",
  "국산",
  "신상",
  "아시아핏",
  "눌리지않는",
];

const MESH_AXES_BY_CATEGORY: Record<string, MeshCategoryAxes> = {
  frames: {
    heads: ["안경테", "안경", "선글라스"],
    targets: GLOBAL_TARGETS,
    features: GLOBAL_FEATURES,
    materials: [
      "뿔테안경",
      "메탈안경",
      "티타늄안경테",
      "아세테이트안경",
      "TR안경테",
      "반뿔테안경",
      "하금테안경",
      "무테안경",
      "베타티타늄안경",
      "울템안경",
      "플라스틱테",
      "금속테안경",
    ],
    situations: [
      "얼굴형",
      "코받침",
      "다리",
      "크기",
      "소재",
      "재질",
      "특징",
      "관리",
      "보관",
      "사이즈",
      "트렌드",
      "케이스",
      "착용감",
      "피팅",
    ],
    trendTerms: ["요즘", "2026", "실사용", "데일리", "직장인", "학생"],
    subCores: ["착용감", "얼굴형", "피팅", "무게", "코받침", "사이즈"],
  },
  lenses: {
    heads: ["안경렌즈", "안경알", "기능렌즈", "운전렌즈", "사무용렌즈", "어린이렌즈"],
    targets: ["어린이", "학생", "청소년", "직장인", "40대", "50대", "부모님", "운전자"],
    features: [
      "블루라이트차단",
      "눈피로",
      "자외선",
      "야간운전",
      "실내업무",
      "독서",
      "고도수",
      "얇은",
      "가벼운",
      "근시관리",
    ],
    materials: [
      "블루라이트렌즈",
      "변색렌즈",
      "편광렌즈",
      "고굴절렌즈",
      "압축렌즈",
      "코팅렌즈",
      "근시억제렌즈",
      "근시완화렌즈",
      "단초점렌즈",
    ],
    situations: ["도수", "두께", "코팅", "교체", "검사", "눈부심", "시야", "관리", "선택", "착용감"],
    trendTerms: ["요즘", "2026", "실사용", "장시간", "컴퓨터", "스마트폰"],
    subCores: ["도수", "두께", "코팅", "검사", "눈피로", "시야"],
  },
  progressive: {
    heads: ["누진렌즈", "다초점렌즈", "노안안경", "노안렌즈", "사무용렌즈", "실내용누진", "중근용렌즈"],
    targets: ["40대", "50대", "60대", "부모님", "어머니", "아버지", "직장인", "운전자", "처음"],
    features: ["처음", "편한", "어지러운", "울렁임", "업무용", "운전용", "독서용", "실내용"],
    materials: ["누진다초점렌즈", "사무용렌즈", "중근용렌즈", "실내용누진", "돋보기안경"],
    situations: ["적응", "시야", "도수", "검사", "생활거리", "운전", "업무", "독서", "돋보기차이", "착용감"],
    trendTerms: ["요즘", "2026", "실사용", "처음", "부모님", "직장인"],
    subCores: ["적응", "울렁임", "시야", "도수", "검사", "생활거리"],
  },
  contacts: {
    heads: ["콘택트렌즈", "원데이렌즈", "난시렌즈", "컬러렌즈", "하드렌즈", "소프트렌즈", "멀티포컬렌즈"],
    targets: ["학생", "청소년", "직장인", "여자", "남자", "초보", "장시간", "운전자"],
    features: ["건조한", "편한", "장시간", "난시용", "원데이", "투명", "자연스러운", "눈이편한"],
    materials: ["원데이렌즈", "소프트렌즈", "난시렌즈", "컬러렌즈", "토릭렌즈", "멀티포컬렌즈"],
    situations: ["건조", "충혈", "이물감", "흐림", "착용시간", "착용감", "검사", "관리", "난시", "직경"],
    trendTerms: ["요즘", "2026", "실사용", "초보", "출근", "운동"],
    subCores: ["건조", "착용감", "착용시간", "검사", "난시", "관리"],
  },
  "eye-info": {
    heads: ["시력검사", "눈피로", "안구건조", "눈초점", "시력저하", "야간시력", "어린이시력", "어린이근시"],
    targets: ["어린이", "학생", "청소년", "직장인", "40대", "50대", "부모님", "운전자"],
    features: ["스마트폰", "컴퓨터", "독서", "야간운전", "장시간", "건조한", "흐린", "피곤한"],
    materials: ["근시", "난시", "노안", "안압", "눈부심", "눈충혈"],
    situations: ["원인", "증상", "검사", "관리", "습관", "흐림", "피로", "시기"],
    trendTerms: ["요즘", "2026", "개학", "환절기", "겨울", "실내"],
    subCores: ["원인", "검사", "관리", "습관", "도수", "시야"],
  },
  "glasses-story": {
    heads: ["안경수리", "안경세척", "안경관리", "안경보관", "안경피팅", "안경흘러내림", "안경김서림"],
    targets: ["학생", "직장인", "운전자", "부모님", "아이", "운동", "장시간"],
    features: ["자주", "오래", "반복", "불편한", "겨울", "마스크", "운동용", "출근"],
    materials: ["코패드", "안경나사", "안경힌지", "안경닦이", "안경케이스", "안경렌즈"],
    situations: ["원인", "방법", "관리", "교체", "세척", "보관", "피팅", "착용감", "흠집", "얼룩"],
    trendTerms: ["요즘", "2026", "실사용", "겨울", "마스크", "운동"],
    subCores: ["관리", "세척", "피팅", "교체", "착용감", "원인"],
  },
};

const PROHIBITED_AXIS_TERMS = /추천|가격|비용|후기|할인|무료|예약|상담|문의|쇼핑몰|환불/;

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeKey(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function compactAxisTerm(value: string): string {
  return value.replace(/\s+/g, "").replace(/[.·,/|()[\]-]/g, "").trim();
}

function isUsableAxisTerm(value: string): boolean {
  const compact = compactAxisTerm(value);
  return compact.length >= 2 && compact.length <= 12 && !PROHIBITED_AXIS_TERMS.test(compact);
}

function makeOption(params: {
  head: string;
  mainCore: string;
  subCores: string[];
  titleCore?: string;
}): KeywordOption | null {
  const head = compactAxisTerm(params.head);
  const mainCore = compactAxisTerm(params.mainCore);
  if (!isUsableAxisTerm(head) || !isUsableAxisTerm(mainCore)) return null;
  if (normalizeKey(head).includes(normalizeKey(mainCore))) return null;
  if (/안경닦이|안경케이스|안경나사|안경힌지/.test(head) && /원인|방법/.test(mainCore)) {
    return null;
  }

  const subCores = unique(params.subCores.map(compactAxisTerm))
    .filter(isUsableAxisTerm)
    .filter((core) => core !== mainCore && !normalizeKey(head).includes(normalizeKey(core)));
  const sub1 = subCores[0] ?? "착용감";
  const sub2 = subCores[1] ?? "검사";
  const mainKeyword = `${head} ${mainCore}`;
  return {
    title: "",
    mainKeyword,
    subKeyword1: `${head} ${sub1}`,
    subKeyword2: `${head} ${sub2}`,
  };
}

function makeQualifiedHeadOption(params: {
  qualifier: string;
  head: string;
  subCores: string[];
  titleCore?: string;
}): KeywordOption | null {
  const qualifier = compactAxisTerm(params.qualifier);
  const head = compactAxisTerm(params.head);
  if (!isUsableAxisTerm(qualifier) || !isUsableAxisTerm(head)) return null;
  if (normalizeKey(qualifier) === normalizeKey(head)) return null;

  const subCores = unique(params.subCores.map(compactAxisTerm))
    .filter(isUsableAxisTerm)
    .filter((core) => !normalizeKey(head).includes(normalizeKey(core)));
  const sub1 = subCores[0] ?? "착용감";
  const sub2 = subCores[1] ?? "검사";
  const mainKeyword = `${qualifier} ${head}`;

  return {
    title: "",
    mainKeyword,
    subKeyword1: `${head} ${sub1}`,
    subKeyword2: `${head} ${sub2}`,
  };
}

function buildTargetHeadOptions(axes: MeshCategoryAxes): KeywordOption[] {
  const options: KeywordOption[] = [];
  for (const target of axes.targets.slice(0, 12)) {
    for (const head of axes.heads.slice(0, 4)) {
      const option = makeQualifiedHeadOption({
        qualifier: target,
        head,
        subCores: axes.subCores,
      });
      if (option) options.push(option);
    }
  }
  return options;
}

function featureToMainCore(feature: string): string | null {
  if (/건조한/.test(feature)) return "건조";
  if (/편한|편안한|눈이편한|자연스러운/.test(feature)) return "착용감";
  if (/장시간/.test(feature)) return "착용시간";
  if (/난시용/.test(feature)) return "난시";
  if (/원데이/.test(feature)) return "원데이";
  if (/투명/.test(feature)) return "투명";
  return null;
}

function buildFeatureHeadOptions(axes: MeshCategoryAxes): KeywordOption[] {
  const options: KeywordOption[] = [];
  for (const feature of axes.features.slice(0, 14)) {
    for (const head of axes.heads.slice(0, 3)) {
      const mainCore = featureToMainCore(feature);
      const option = mainCore
        ? makeOption({
            head,
            mainCore,
            subCores: axes.subCores,
          })
        : makeQualifiedHeadOption({
            qualifier: feature,
            head,
            subCores: axes.subCores,
          });
      if (option) options.push(option);
    }
  }
  return options;
}

function buildMaterialOptions(axes: MeshCategoryAxes): KeywordOption[] {
  const options: KeywordOption[] = [];
  for (const material of axes.materials.slice(0, 18)) {
    for (const situation of axes.situations.slice(0, 3)) {
      const option = makeOption({
        head: material,
        mainCore: situation,
        subCores: axes.subCores,
      });
      if (option) options.push(option);
    }
  }
  return options;
}

// 트렌드/시의성 축: "요즘/2026/데일리/신상" 같은 실제 검색 수식어 × head.
// 어색하거나 0볼륨 조합은 다운스트림 게이트(카테고리 적합·볼륨)가 거른다.
const REAL_TREND_QUALIFIERS = new Set(["요즘", "2026", "데일리", "신상", "첫"]);

function buildTrendOptions(axes: MeshCategoryAxes): KeywordOption[] {
  const options: KeywordOption[] = [];
  const qualifiers = axes.trendTerms
    .map(compactAxisTerm)
    .filter((term) => REAL_TREND_QUALIFIERS.has(term));
  for (const qualifier of qualifiers.slice(0, 4)) {
    for (const head of axes.heads.slice(0, 4)) {
      const option = makeQualifiedHeadOption({
        qualifier,
        head,
        subCores: axes.subCores,
      });
      if (option) options.push(option);
    }
  }
  return options;
}

function buildShopProductAxisTerms(shop: Shop, category: Category): string[] {
  return getShopProductHeads({ shop, category })
    .map(compactAxisTerm)
    .filter(isUsableAxisTerm)
    .slice(0, 10);
}

function buildShopProductOptions(shop: Shop, category: Category, axes: MeshCategoryAxes): KeywordOption[] {
  return buildShopProductAxisTerms(shop, category)
    .map((head) =>
      makeOption({
        head,
        mainCore: axes.situations[0] ?? "선택",
        subCores: axes.subCores,
      })
    )
    .filter((option): option is KeywordOption => Boolean(option));
}

// 안경이야기는 관리·수리 군집에 쏠리기 쉽다(mesh head/situation이 관리어 중심).
// 스타일·경험·상황 군집을 1급 시드로 추가해 후보 풀의 소재 다양성을 확보한다.
// 중립어만 사용(후기·가격·비교·추천·TOP 배제), 모두 2단어. 어색·0볼륨은 게이트가 거른다.
const GLASSES_STORY_LIFESTYLE_OPTIONS: KeywordOption[] = [
  { title: "", mainKeyword: "얼굴형안경 고르기", subKeyword1: "얼굴형안경 스타일", subKeyword2: "얼굴형안경 종류" },
  { title: "", mainKeyword: "안경코디 스타일", subKeyword1: "안경코디 인상", subKeyword2: "안경코디 얼굴형" },
  { title: "", mainKeyword: "첫안경 적응", subKeyword1: "첫안경 맞춤", subKeyword2: "첫안경 준비" },
  { title: "", mainKeyword: "어린이안경 적응", subKeyword1: "어린이안경 관리", subKeyword2: "어린이안경 선택" },
  { title: "", mainKeyword: "안경맞춤 과정", subKeyword1: "안경맞춤 순서", subKeyword2: "안경맞춤 검안" },
  { title: "", mainKeyword: "안경교체 시기", subKeyword1: "안경교체 수명", subKeyword2: "안경교체 기준" },
  { title: "", mainKeyword: "안경트렌드 종류", subKeyword1: "안경트렌드 스타일", subKeyword2: "안경트렌드 데일리" },
];

export function buildKeywordMeshOptions(params: {
  shop: Shop;
  category: Category;
  maxCandidates?: number;
}): KeywordOption[] {
  const axes = MESH_AXES_BY_CATEGORY[params.category.id];
  if (!axes) return [];

  const options = [
    ...buildShopProductOptions(params.shop, params.category, axes),
    ...buildMaterialOptions(axes),
    ...buildTargetHeadOptions(axes),
    ...buildFeatureHeadOptions(axes),
    ...buildTrendOptions(axes),
    ...(params.category.id === "glasses-story" ? GLASSES_STORY_LIFESTYLE_OPTIONS : []),
  ];

  const seen = new Set<string>();
  return options
    .filter((option) => {
      const key = `${option.mainKeyword}|${option.subKeyword1}|${option.subKeyword2}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, params.maxCandidates ?? 120);
}

export function buildKeywordMeshSeeds(params: {
  shop: Shop;
  category: Category;
  maxSeeds?: number;
}): string[] {
  return unique(
    buildKeywordMeshOptions({
      shop: params.shop,
      category: params.category,
      maxCandidates: params.maxSeeds ?? 80,
    }).flatMap((option) => [
      option.mainKeyword,
      option.mainKeyword.replace(/\s+/g, ""),
      option.subKeyword1,
    ])
  ).slice(0, params.maxSeeds ?? 80);
}
