import type { Category, SearchVolumeSignal, Shop } from "@/types";

type MonthSeason = {
  label: string;
  demandNotes: string[];
};

const SHOP_REGION_HINTS: Record<string, string> = {
  top50jn: "장림",
  jinysgongju: "공주",
  attractiger: "김해 장유",
  leesi7007: "대전 충남대",
  kl1854: "심곡",
  peace9486: "진해",
};

const CATEGORY_INTENT_AXES: Record<string, string[]> = {
  progressive: [
    "지역 이용형: 지역명 + 누진다초점/누진렌즈/노안안경",
    "선택 기준형: 등급, 검사, 맞춤 차이를 설명하되 과장 표현은 피함",
    "불안 해소형: 울렁임, 어지러움, 적응 기간, 실패 원인",
    "차이 설명형: 돋보기와 누진다초점, 사무용 렌즈와 누진렌즈",
    "대상 상황형: 40대/50대, 부모님, 운전, 독서, 업무",
  ],
  contacts: [
    "착용 문제형: 건조, 충혈, 이물감, 장시간 착용",
    "관리 방법형: 세척, 보관, 교체 주기, 위생",
    "차이 설명형: 원데이/난시/멀티포컬/하드렌즈",
    "지역 이용형: 지역명 + 렌즈 검사/콘택트렌즈",
  ],
  lenses: [
    "기능 선택형: 블루라이트, 변색, 자외선, 고굴절, 어린이 근시 관리",
    "선택 기준형: 렌즈 등급, 압축, 코팅 차이",
    "상황 해결형: 눈피로, 야간 운전, 실내 업무",
    "지역 이용형: 지역명 + 안경렌즈/렌즈교체",
  ],
  frames: [
    "소재 선택형: 티타늄, 울템, TR, 메탈, 뿔테",
    "착용감 해결형: 가벼운 안경, 흘러내림, 코패드",
    "얼굴형 선택형: 둥근안경, 사각안경, 큰안경",
    "지역 이용형: 지역명 + 안경테 피팅/안경테 선택",
  ],
  "eye-info": [
    "증상 정보형: 안구건조, 눈피로, 시력저하, 야간시력",
    "검사 필요형: 시력검사, 안압, 난시, 근시",
    "생활 관리형: 자외선, 스마트폰, 독서, 운전",
    "지역 이용형: 지역명 + 시력검사/눈피로",
  ],
  "glasses-story": [
    "생활 문제형: 김서림, 흘러내림, 착용감, 보관",
    "관리 방법형: 세척, 수리, 피팅, 코패드",
    "지역 이용형: 지역명 + 안경수리/안경피팅",
    "상황 해결형: 운동, 운전, 마스크, 장시간 착용",
  ],
};

const CATEGORY_CORE_KEYWORDS: Record<string, string[]> = {
  progressive: [
    "누진렌즈",
    "다초점렌즈",
    "누진다초점",
    "누진다초점렌즈",
    "노안안경",
    "노안렌즈",
    "돋보기",
    "돋보기안경",
    "사무용렌즈",
    "실내용누진",
    "중근용렌즈",
    "누진렌즈적응",
  ],
  lenses: [
    "안경렌즈",
    "렌즈교체",
    "안경알",
    "블루라이트렌즈",
    "변색렌즈",
    "압축렌즈",
    "고굴절렌즈",
    "코팅렌즈",
    "편광렌즈",
    "자외선렌즈",
    "단초점렌즈",
    "눈피로렌즈",
    "어린이렌즈",
    "어린이안경렌즈",
    "근시억제렌즈",
    "근시완화렌즈",
    "마이오스마트",
  ],
  frames: [
    "안경테",
    "안경피팅",
    "가벼운안경",
    "티타늄안경",
    "뿔테안경",
    "메탈안경",
    "울템안경",
    "하금테",
    "무테안경",
    "큰안경",
    "안경흘러내림",
    "코패드",
  ],
  contacts: [
    "콘택트렌즈",
    "원데이렌즈",
    "렌즈건조",
    "소프트렌즈",
    "하드렌즈",
    "컬러렌즈",
    "난시렌즈",
    "멀티포컬렌즈",
    "렌즈세척",
    "렌즈충혈",
    "렌즈이물감",
  ],
  "eye-info": [
    "시력검사",
    "눈피로",
    "안구건조",
    "눈초점",
    "시력저하",
    "야간시력",
    "눈충혈",
    "난시",
    "근시",
    "어린이근시",
    "어린이시력",
    "어린이시력관리",
    "원시",
    "노안",
    "안압",
  ],
  "glasses-story": [
    "안경수리",
    "안경세척",
    "안경김서림",
    "안경관리",
    "안경보관",
    "안경조정",
    "코패드교체",
    "안경착용감",
    "안경흘러내림",
    "안경닦이",
    "안경스크래치",
    "안경코받침",
  ],
};

function getMonthSeason(month: number): MonthSeason {
  if (month >= 3 && month <= 5) {
    return {
      label: "봄/가정의 달",
      demandNotes: [
        "신학기·야외활동·가정의 달 선물 수요를 고려",
        "부모님 노안, 시력검사, 자외선, 렌즈 교체 소재가 자연스러움",
      ],
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      label: "여름",
      demandNotes: [
        "자외선·선글라스·변색렌즈·눈건조·렌즈 위생 수요를 고려",
        "휴가철 운전, 야외활동, 땀과 김서림 소재가 자연스러움",
      ],
    };
  }
  if (month >= 9 && month <= 11) {
    return {
      label: "가을/업무 집중",
      demandNotes: [
        "독서·업무·운전·환절기 눈건조 수요를 고려",
        "누진렌즈 적응, 사무용 렌즈, 시력검사 소재가 자연스러움",
      ],
    };
  }
  return {
    label: "겨울/연말",
    demandNotes: [
      "연말 검진·부모님 선물·김서림·실내 업무 수요를 고려",
      "건조한 계절의 눈피로, 렌즈 관리, 안경 김서림 소재가 자연스러움",
    ],
  };
}

export function inferShopRegion(shop: Shop): string {
  const known = SHOP_REGION_HINTS[shop.id];
  if (known) return known;

  const normalized = shop.name
    .replace(/으뜸50안경|지니스안경|안경원|안경|점/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.split(" ")[0] || shop.name;
}

function getRegionalKeywordExamples(region: string, category: Category): string[] {
  const examplesByCategory: Record<string, string[]> = {
    progressive: [
      `${region} 다초점렌즈`,
      `${region} 누진렌즈`,
      `${region} 누진다초점`,
      `${region} 노안안경`,
    ],
    contacts: [
      `${region} 콘택트렌즈`,
      `${region} 원데이렌즈`,
      `${region} 난시렌즈`,
      `${region} 렌즈검사`,
    ],
    lenses: [
      `${region} 안경렌즈`,
      `${region} 렌즈교체`,
      `${region} 안경알`,
      `${region} 블루라이트렌즈`,
      `${region} 어린이안경`,
      `${region} 근시억제렌즈`,
    ],
    frames: [
      `${region} 안경테`,
      `${region} 안경피팅`,
      `${region} 가벼운안경`,
      `${region} 코패드`,
    ],
    "eye-info": [
      `${region} 시력검사`,
      `${region} 눈피로`,
      `${region} 안구건조`,
      `${region} 눈초점`,
    ],
    "glasses-story": [
      `${region} 안경수리`,
      `${region} 안경피팅`,
      `${region} 안경세척`,
      `${region} 안경김서림`,
    ],
  };

  return examplesByCategory[category.id] ?? [`${region} ${category.name}`];
}

export function buildKeywordDiscoverySeeds(params: {
  shop: Shop;
  category: Category;
  topic?: string;
}): string[] {
  const { shop, category, topic } = params;
  const region = inferShopRegion(shop);
  const commonLocal = [
    `${region} 안경`,
    `${region} 안경점`,
    `${region} 안경원`,
    `${region} 시력검사`,
    `${region} 안경렌즈`,
    `${region} 안경테`,
  ];

  const byCategory: Record<string, string[]> = {
    progressive: [
      `${region} 다초점렌즈`,
      `${region} 누진렌즈`,
      `${region} 누진다초점`,
      `${region} 노안안경`,
      `${region} 돋보기`,
      `${region} 돋보기안경`,
      "누진렌즈 적응",
      "누진렌즈 울렁임",
      "노안 안경",
      "노안 렌즈",
      "돋보기 불편",
      "돋보기 안경",
      "사무용 렌즈",
      "실내용 누진",
      "중근용 렌즈",
      "가까운 글씨",
      "눈 초점",
    ],
    contacts: [
      `${region} 콘택트렌즈`,
      `${region} 렌즈`,
      `${region} 원데이렌즈`,
      `${region} 난시렌즈`,
      `${region} 컬러렌즈`,
      "렌즈 건조",
      "렌즈 충혈",
      "렌즈 이물감",
      "난시 렌즈",
      "멀티포컬 렌즈",
      "렌즈 세척",
      "하드 렌즈",
      "소프트 렌즈",
    ],
    lenses: [
      `${region} 렌즈교체`,
      `${region} 안경알`,
      `${region} 안경렌즈`,
      `${region} 변색렌즈`,
      `${region} 어린이렌즈`,
      `${region} 근시완화렌즈`,
      "안경렌즈 압축",
      "안경렌즈 코팅",
      "블루라이트렌즈",
      "변색렌즈",
      "어린이 시력관리",
      "어린이 근시",
      "근시억제 렌즈",
      "근시완화 렌즈",
      "마이오스마트 렌즈",
      "안경알 교체",
      "단초점 렌즈",
      "자외선 렌즈",
      "고굴절 렌즈",
      "편광 렌즈",
      "눈피로 렌즈",
    ],
    frames: [
      `${region} 안경테`,
      `${region} 안경피팅`,
      `${region} 안경흘러내림`,
      `${region} 코패드`,
      "가벼운 안경",
      "티타늄 안경",
      "뿔테 안경",
      "메탈 안경",
      "울템 안경",
      "하금테",
      "무테 안경",
      "큰 안경",
      "안경 흘러내림",
      "코패드 자국",
    ],
    "eye-info": [
      `${region} 시력검사`,
      "눈 피로",
      "안구 건조",
      "시력 저하",
      "야간 시력",
      "눈 초점",
      "눈 충혈",
      "어린이 시력",
      "어린이 근시",
      "어린이 시력관리",
      "안압",
      "난시",
      "근시",
      "원시",
      "노안",
    ],
    "glasses-story": [
      `${region} 안경수리`,
      `${region} 안경피팅`,
      `${region} 안경세척`,
      `${region} 코패드교체`,
      "안경 김서림",
      "안경 세척",
      "안경 흘러내림",
      "코패드 교체",
      "안경 보관",
      "안경 관리",
      "안경 조정",
      "안경 착용감",
      "안경 스크래치",
      "안경 코받침",
    ],
  };

  const topicSeeds = topic?.trim()
    ? topic
        .split(/[,\n/]+/)
        .map((seed) => seed.trim())
        .filter(Boolean)
    : [];

  return Array.from(
    new Set([
      ...getRegionalKeywordExamples(region, category),
      ...commonLocal,
      ...(CATEGORY_CORE_KEYWORDS[category.id] ?? []),
      ...(byCategory[category.id] ?? []),
      ...topicSeeds,
    ])
  ).slice(0, 30);
}

function formatDemandSignal(signal: SearchVolumeSignal): string {
  const total =
    typeof signal.monthlyTotalSearches === "number"
      ? `${signal.monthlyTotalSearches.toLocaleString("ko-KR")}회`
      : "확인됨";
  const competition = signal.competitionLabel ? ` / 경쟁 ${signal.competitionLabel}` : "";
  return `- ${signal.keyword}: 월간 ${total}${competition}`;
}

function buildDemandGuide(signals: SearchVolumeSignal[]): string {
  if (signals.length === 0) {
    return "- 검색광고 월간 검색량은 아직 확보되지 않았으므로 지역형·증상형 롱테일을 우선한다.";
  }

  const targetSignals = [...signals]
    .filter((signal) => {
      const total = signal.monthlyTotalSearches ?? 0;
      return total > 0 && total <= 1000;
    })
    .sort((a, b) => (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0))
    .slice(0, 10);

  const fallbackSignals = [...signals]
    .sort((a, b) => (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0))
    .slice(0, 10);

  const selected = targetSignals.length > 0 ? targetSignals : fallbackSignals;
  return selected.map(formatDemandSignal).join("\n");
}

export function buildKeywordStrategyGuide(params: {
  shop: Shop;
  category: Category;
  topic?: string;
  now?: Date;
  demandSignals?: SearchVolumeSignal[];
}): string {
  const { shop, category, topic } = params;
  const now = params.now ?? new Date();
  const month = now.getMonth() + 1;
  const season = getMonthSeason(month);
  const region = inferShopRegion(shop);
  const intentAxes = CATEGORY_INTENT_AXES[category.id] ?? [
    "지역 이용형: 지역명 + 핵심 카테고리",
    "정보 탐색형: 원인, 기준, 방법, 관리",
    "비교 선택형: 종류, 차이, 선택 기준",
  ];

  const topicLine = topic?.trim()
    ? `- 사용자가 입력한 희망 주제: ${topic.trim()}`
    : "- 사용자가 별도 희망 주제를 입력하지 않았으므로 검색 의도와 시즌성을 우선한다.";
  const regionalExamples = getRegionalKeywordExamples(region, category);
  const coreKeywords = CATEGORY_CORE_KEYWORDS[category.id] ?? [category.name];
  const demandGuide = buildDemandGuide(params.demandSignals ?? []);

  return `────────────────────────────────────
[검색 수요 우선 전략]
────────────────────────────────────
${topicLine}
- 현재 기준 월: ${month}월 (${season.label})
- 지역명 후보: ${region}
- 카테고리는 글 관리용 분류일 뿐, 키워드 탐색 범위를 막는 기준이 아니다.
- 검색자는 카테고리명이 아니라 지역명, 증상, 상황, 선택 기준으로 검색한다.
- 지역형 롱테일은 실제 이용 의도가 강하므로 최소 4개 이상 포함한다.
- 전국형 키워드는 검색량은 크지만 경쟁이 높으므로 정보성 소재로만 2~3개 섞는다.
- 모든 후보는 "소재"와 "검색 의도"가 서로 달라야 한다.
- 현재 블로그 지수가 낮으므로 월간 검색량 10~1,000 구간을 우선한다.
- 월간 검색량이 1,000을 넘는 키워드는 단독 정면 승부보다 지역·증상·상황어와 결합한다.
- 카테고리 핵심 키워드는 아래 풀에서 넓게 고르되 같은 단어만 반복하지 않는다.
- 핵심 키워드 풀: ${coreKeywords.join(" / ")}

[검색광고 월간 검색량 참고]
${demandGuide}

[SEO/AEO/GEO 동시 기준]
- SEO: 제목 앞쪽에 실제 검색어 원형을 포함한다.
- AEO: 본문에서 바로 답할 수 있는 질문 의도(언제, 이유, 차이, 방법, 기준)가 살아야 한다.
- GEO: 원인·기준·상황·주의점을 문단별로 분명히 설명할 수 있는 소재를 고른다.
- 제목은 질문형으로 억지 작성하지 말고, 본문 소제목에서 질문 의도를 살릴 수 있는 키워드를 고른다.

[이번 달 시즌성 참고]
${season.demandNotes.map((note) => `- ${note}`).join("\n")}

[의도 축 분산]
${intentAxes.map((axis) => `- ${axis}`).join("\n")}

[소재 중복 방지]
- 같은 소재를 다른 말로 반복하지 않는다.
- 예: "처음 맞추기", "사용 전 확인", "맞추기 전 확인"은 같은 소재로 본다.
- 예: "등급 차이", "선택 기준", "맞춤 차이"는 같은 소재로 본다.
- 예: "울렁임", "어지러움", "적응 어려움"은 같은 소재로 본다.
- 10개 후보는 지역이용/선택기준/적응/차이설명/대상/관리/검사/계절 소재가 고르게 나뉘어야 한다.

[지역 키워드 작성]
- 지역형 메인 키워드는 가능한 한 ${regionalExamples
    .map((example) => `"${example}"`)
    .join(", ")}처럼 2단어 조합으로 만든다.
- 지역명만 바꾼 비슷한 제목을 만들지 말고, 지역형 안에서도 소재를 다르게 한다.`;
}
