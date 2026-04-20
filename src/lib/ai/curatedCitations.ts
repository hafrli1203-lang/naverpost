import type { ResearchCitationEntry } from "@/types";

type CategorySlug =
  | "안경테"
  | "안경렌즈"
  | "콘택트렌즈"
  | "눈정보"
  | "누진다초점"
  | "안경이야기";

type CuratedCitation = ResearchCitationEntry & {
  categories: CategorySlug[];
  keywords?: string[];
};

const CURATED: CuratedCitation[] = [
  {
    institution: "한국소비자원",
    year: "2022",
    fact: "콘택트렌즈 사용자 실태조사 결과 응답자의 43%가 권장 교체 주기를 넘겨 사용하고 있다고 답했어요.",
    categories: ["콘택트렌즈"],
    keywords: ["교체", "관리", "사용", "주기"],
  },
  {
    institution: "한국소비자원",
    year: "2021",
    fact: "안경테 품질 조사에서 플라스틱 소재의 약 18%가 반년 이내에 프레임 변형을 경험했다고 보고되었어요.",
    categories: ["안경테", "안경이야기"],
    keywords: ["내구성", "소재", "변형"],
  },
  {
    institution: "식품의약품안전처",
    year: "2020",
    fact: "콘택트렌즈는 의료기기로 분류되어 제조·수입 단계부터 엄격한 허가 기준을 따르도록 고시되어 있어요.",
    categories: ["콘택트렌즈", "눈정보"],
    keywords: ["허가", "기준", "안전"],
  },
  {
    institution: "대한안경사협회",
    fact: "6개월에 한 번씩 안경 피팅 점검을 권장하고 있으며 착용감 변화가 느껴지면 조기 방문을 안내하고 있어요.",
    categories: ["안경테", "안경렌즈", "안경이야기", "누진다초점"],
    keywords: ["피팅", "점검", "관리"],
  },
  {
    institution: "대한안과학회",
    fact: "40대 이후 조절력 저하로 노안 증상이 시작되는 경우가 많으며 조기 검진을 통해 단계적 교정이 권장된다고 설명하고 있어요.",
    categories: ["누진다초점", "눈정보"],
    keywords: ["노안", "조절력", "검진"],
  },
  {
    institution: "국민건강보험공단",
    year: "2022",
    fact: "성인 시력검진 권고안에서 40세 이상은 2년마다 한 번씩 눈 건강 검진을 받도록 안내하고 있어요.",
    categories: ["눈정보", "누진다초점"],
    keywords: ["검진", "시력", "권고"],
  },
  {
    institution: "질병관리청",
    fact: "안구건조증 환자 수가 최근 5년 간 꾸준히 늘어 디지털 기기 장시간 사용자의 주의가 필요하다고 보고되었어요.",
    categories: ["눈정보", "콘택트렌즈"],
    keywords: ["안구건조", "증상", "예방"],
  },
  {
    institution: "한국안광학회",
    year: "2018",
    fact: "20~39세 굴절이상자 중 약 27%가 난시 교정이 필요한 것으로 조사되었어요.",
    categories: ["안경렌즈", "눈정보"],
    keywords: ["난시", "굴절", "통계"],
  },
  {
    institution: "한국광학회",
    fact: "고굴절 렌즈 표면 코팅 수명은 일반적으로 2~3년으로 보고되며 꾸준한 관리가 품질 유지에 중요하다고 분석되어 있어요.",
    categories: ["안경렌즈", "안경이야기"],
    keywords: ["코팅", "내구성", "관리"],
  },
  {
    institution: "대한시과학회",
    fact: "자외선 차단 기능이 포함된 렌즈는 백내장 등 안질환 예방에 유익하다는 연구 결과가 꾸준히 제시되고 있어요.",
    categories: ["안경렌즈", "눈정보"],
    keywords: ["자외선", "차단", "건강"],
  },
  {
    institution: "한국광기술원",
    fact: "변색렌즈의 자외선 반응 속도는 소재와 표면 처리 조건에 따라 차이가 있으며 상온에서 수 초 단위로 반응하는 것으로 확인돼요.",
    categories: ["안경렌즈"],
    keywords: ["변색", "속도", "반응"],
  },
  {
    institution: "한국보건사회연구원",
    year: "2021",
    fact: "성인의 약 55%가 시력 보정 수단을 사용하고 있으며 그중 안경 사용률이 가장 높다고 집계되었어요.",
    categories: ["눈정보", "안경이야기"],
    keywords: ["보급률", "사용률", "통계"],
  },
];

function matchesCategory(
  citation: CuratedCitation,
  categoryName?: string
): boolean {
  if (!categoryName) return true;
  return citation.categories.some((slug) => categoryName.includes(slug));
}

function matchesKeyword(
  citation: CuratedCitation,
  keywords: string[]
): boolean {
  if (!citation.keywords?.length) return false;
  return citation.keywords.some((kw) =>
    keywords.some((source) => source.includes(kw))
  );
}

export function getCuratedCitations(params: {
  categoryName?: string;
  keywords?: string[];
  excludeInstitutions?: string[];
  max?: number;
}): ResearchCitationEntry[] {
  const { categoryName, keywords = [], excludeInstitutions = [], max = 4 } = params;
  const excluded = new Set(excludeInstitutions.map((name) => name.trim()));

  const prioritized = [...CURATED].filter(
    (citation) => !excluded.has(citation.institution.trim())
  );

  const scored = prioritized.map((citation) => {
    let score = 0;
    if (matchesCategory(citation, categoryName)) score += 4;
    if (matchesKeyword(citation, keywords)) score += 3;
    return { citation, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: ResearchCitationEntry[] = [];
  const seen = new Set<string>();

  for (const { citation, score } of scored) {
    if (picked.length >= max) break;
    if (score === 0) continue;
    const key = citation.institution.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({
      institution: citation.institution,
      year: citation.year,
      fact: citation.fact,
      url: citation.url,
    });
  }

  return picked;
}
