import type { Category, Shop } from "@/types";
import { getShopProductHeads } from "@/lib/keywords/productKeywordCatalog";

export type TopicIntentAxis =
  | "problem"
  | "comparison"
  | "verification"
  | "lifestyle"
  | "visit"
  | "product";

export interface TopicPlan {
  topic: string;
  thesis: string;
  axis: TopicIntentAxis;
  searcherQuestion: string;
  preferredModifiers: string[];
  titleAngles: string[];
  notes: string[];
}

export interface MonthlyCategorySlot {
  slot: number;
  categoryId: string;
  categoryName: string;
  topic: string;
  thesis: string;
  axis: TopicIntentAxis;
  preferredModifiers: string[];
}

type TopicTemplate = {
  axis: TopicIntentAxis;
  topic: string;
  thesis: string;
  searcherQuestion: string;
  preferredModifiers: string[];
  titleAngles: string[];
};

const CATEGORY_TOPIC_TEMPLATES: Record<string, TopicTemplate[]> = {
  progressive: [
    {
      axis: "problem",
      topic: "누진렌즈 적응이 어려운 이유",
      thesis:
        "누진렌즈 불편은 도수 문제로만 보지 말고 시선 습관, 생활거리, 피팅 상태를 함께 확인해야 한다.",
      searcherQuestion: "누진렌즈를 맞췄는데 울렁이고 어지러운 이유가 무엇인가",
      preferredModifiers: ["적응", "울렁임", "시야", "도수", "피팅", "생활거리"],
      titleAngles: ["오래 울렁일 때", "시야가 흔들릴 때", "처음 맞춘 뒤 어색할 때"],
    },
    {
      axis: "comparison",
      topic: "누진렌즈와 돋보기 차이",
      thesis:
        "돋보기와 누진렌즈는 잘 보이는 거리와 쓰는 생활 장면이 다르므로 가격보다 사용 목적부터 나눠야 한다.",
      searcherQuestion: "노안이 왔을 때 돋보기와 누진렌즈 중 무엇을 써야 하나",
      preferredModifiers: ["차이", "시야", "도수", "생활거리", "선택", "검사"],
      titleAngles: ["선택 전 비교 기준", "생활거리별 차이", "처음 고를 때"],
    },
    {
      axis: "verification",
      topic: "누진렌즈 맞추기 전 검사 기준",
      thesis:
        "누진렌즈는 제품명보다 착용자의 거리 습관, 시선 높이, 도수 변화 확인이 맞춤 결과를 좌우한다.",
      searcherQuestion: "누진렌즈를 맞추기 전에 안경원에서 무엇을 확인해야 하나",
      preferredModifiers: ["검사", "도수", "피팅", "선택", "시야", "맞춤"],
      titleAngles: ["방문 전 확인할 점", "검사에서 볼 기준", "실패를 줄이는 순서"],
    },
    {
      axis: "lifestyle",
      topic: "업무 중 누진렌즈 시야가 불편한 이유",
      thesis:
        "실내 업무가 많다면 일반 누진렌즈보다 중간거리와 가까운거리 사용 비중을 먼저 따져야 한다.",
      searcherQuestion: "컴퓨터나 책을 볼 때 누진렌즈가 불편한 이유가 무엇인가",
      preferredModifiers: ["업무", "독서", "시야", "거리", "피로", "실내"],
      titleAngles: ["업무 중 답답할 때", "컴퓨터 볼 때", "실내거리 기준"],
    },
    {
      axis: "visit",
      topic: "부모님 노안안경 선택 전 확인할 점",
      thesis:
        "부모님 노안안경은 선물처럼 고르기보다 생활거리, 기존 안경 습관, 적응 가능성을 먼저 확인해야 한다.",
      searcherQuestion: "부모님 노안안경을 맞추기 전에 무엇을 체크해야 하나",
      preferredModifiers: ["부모님", "노안", "검사", "생활거리", "착용감", "선택"],
      titleAngles: ["맞추기 전 체크", "생활거리 확인", "처음 선택 기준"],
    },
  ],
  lenses: [
    {
      axis: "problem",
      topic: "안경렌즈를 바꿨는데 눈이 피로한 이유",
      thesis:
        "렌즈 교체 후 피로감은 도수, 코팅, 착용 거리, 기존 습관이 함께 영향을 주므로 원인을 나눠 봐야 한다.",
      searcherQuestion: "안경렌즈를 새로 했는데 왜 눈이 피로하고 어색한가",
      preferredModifiers: ["눈피로", "도수", "코팅", "교체", "시야", "검사"],
      titleAngles: ["바꾼 뒤 피로할 때", "도수만 보면 안 되는 이유", "교체 후 확인"],
    },
    {
      axis: "comparison",
      topic: "안경렌즈 압축과 굴절률 차이",
      thesis:
        "압축 렌즈 선택은 얇음만 보지 말고 도수, 테 크기, 무게, 왜곡 가능성을 함께 비교해야 한다.",
      searcherQuestion: "안경렌즈 압축은 몇 번을 해야 하고 무엇이 다른가",
      preferredModifiers: ["압축", "굴절률", "두께", "무게", "도수", "선택"],
      titleAngles: ["선택 전 비교", "두께가 달라지는 기준", "도수별 확인"],
    },
    {
      axis: "verification",
      topic: "안경렌즈 교체 전 확인할 기준",
      thesis:
        "렌즈 교체는 새 제품 선택보다 현재 불편의 원인을 먼저 확인해야 같은 불편이 반복되지 않는다.",
      searcherQuestion: "안경렌즈를 교체하기 전에 안경원에서 무엇을 확인해야 하나",
      preferredModifiers: ["교체", "검사", "도수", "코팅", "선택", "피팅"],
      titleAngles: ["교체 전 체크", "방문 전 기준", "다시 불편하지 않게"],
    },
    {
      axis: "lifestyle",
      topic: "야간 운전 때 안경렌즈가 불편한 이유",
      thesis:
        "야간 운전 불편은 렌즈 기능 하나보다 도수 정확도, 코팅 상태, 눈부심 환경을 함께 봐야 줄일 수 있다.",
      searcherQuestion: "밤에 운전할 때 빛 번짐과 눈부심이 심한 이유가 무엇인가",
      preferredModifiers: ["야간", "운전", "눈부심", "코팅", "시야", "검사"],
      titleAngles: ["야간 시야가 불편할 때", "빛 번짐 확인", "운전 전 체크"],
    },
    {
      axis: "visit",
      topic: "어린이 안경렌즈 선택 전 확인할 점",
      thesis:
        "어린이 렌즈는 기능명보다 시력 변화, 착용 습관, 관리 가능성을 부모가 이해해야 오래 쓸 수 있다.",
      searcherQuestion: "아이 안경렌즈를 고를 때 무엇을 먼저 봐야 하나",
      preferredModifiers: ["어린이", "근시", "검사", "관리", "도수", "선택"],
      titleAngles: ["부모가 볼 기준", "시력검사 후 선택", "관리까지 생각할 때"],
    },
  ],
  frames: [
    {
      axis: "problem",
      topic: "안경테 착용감이 불편한 이유",
      thesis:
        "안경테 불편은 소재보다 얼굴 폭, 코받침, 귀 높이, 렌즈 무게가 함께 만드는 문제다.",
      searcherQuestion: "안경테가 귀나 코를 누르고 흘러내리는 이유가 무엇인가",
      preferredModifiers: ["착용감", "피팅", "코패드", "흘러내림", "무게", "사이즈"],
      titleAngles: ["오래 쓰면 불편할 때", "코와 귀가 눌릴 때", "흘러내릴 때"],
    },
    {
      axis: "comparison",
      topic: "티타늄안경과 울템안경 차이",
      thesis:
        "가벼운 안경테 선택은 소재명보다 얼굴형, 관리 습관, 피팅 가능성을 함께 비교해야 한다.",
      searcherQuestion: "티타늄과 울템 안경테 중 어떤 것이 나에게 맞나",
      preferredModifiers: ["티타늄", "울템", "무게", "소재", "착용감", "관리"],
      titleAngles: ["소재별 차이", "가벼움 비교", "선택 전 기준"],
    },
    {
      axis: "verification",
      topic: "안경테 고르기 전 얼굴형 확인 기준",
      thesis:
        "안경테는 유행보다 얼굴 폭, 브릿지, 렌즈 크기, 착용 목적을 먼저 맞춰야 어색함이 줄어든다.",
      searcherQuestion: "내 얼굴형에는 어떤 안경테가 어울리고 편한가",
      preferredModifiers: ["얼굴형", "사이즈", "브릿지", "선택", "착용감", "피팅"],
      titleAngles: ["얼굴형별 확인", "고르기 전 체크", "사이즈 기준"],
    },
    {
      axis: "lifestyle",
      topic: "장시간 착용해도 편한 안경테 기준",
      thesis:
        "오래 쓰는 안경테는 가벼움뿐 아니라 코와 귀에 걸리는 압력, 렌즈 두께, 생활 자세까지 봐야 한다.",
      searcherQuestion: "하루 종일 써도 편한 안경테는 무엇이 다른가",
      preferredModifiers: ["장시간", "착용감", "무게", "코패드", "피팅", "소재"],
      titleAngles: ["하루 종일 쓸 때", "가벼움보다 중요한 것", "착용감 기준"],
    },
    {
      axis: "visit",
      topic: "안경피팅 받기 전 확인할 점",
      thesis:
        "안경피팅은 단순 조정이 아니라 흘러내림, 코 자국, 귀 통증의 원인을 나눠 맞추는 과정이다.",
      searcherQuestion: "안경이 불편할 때 피팅으로 어디까지 좋아질 수 있나",
      preferredModifiers: ["피팅", "조정", "흘러내림", "코패드", "귀통증", "균형"],
      titleAngles: ["피팅 전 체크", "조정이 필요한 신호", "불편 원인 확인"],
    },
  ],
  contacts: [
    {
      axis: "problem",
      topic: "렌즈 착용 중 건조감이 심한 이유",
      thesis:
        "콘택트렌즈 건조감은 제품 함수율만이 아니라 착용 시간, 눈물 상태, 관리 습관을 함께 봐야 한다.",
      searcherQuestion: "렌즈를 끼면 왜 오후에 건조하고 뻑뻑해지는가",
      preferredModifiers: ["건조", "착용시간", "이물감", "충혈", "관리", "검사"],
      titleAngles: ["오후에 건조할 때", "오래 끼면 불편할 때", "뻑뻑한 이유"],
    },
    {
      axis: "comparison",
      topic: "원데이렌즈와 한달렌즈 차이",
      thesis:
        "렌즈 교체 주기는 비용보다 위생 관리 가능성, 착용 빈도, 눈 상태에 맞춰 선택해야 한다.",
      searcherQuestion: "원데이렌즈와 한달렌즈 중 어떤 것이 눈에 맞나",
      preferredModifiers: ["원데이", "교체", "위생", "관리", "착용시간", "선택"],
      titleAngles: ["교체주기 비교", "위생 기준", "처음 고를 때"],
    },
    {
      axis: "verification",
      topic: "콘택트렌즈 검사 전 확인할 기준",
      thesis:
        "콘택트렌즈는 안경 도수만으로 고르지 말고 각막 상태, 난시, 착용 습관을 검사해야 한다.",
      searcherQuestion: "렌즈를 맞추기 전에 어떤 검사가 필요한가",
      preferredModifiers: ["검사", "도수", "난시", "착용감", "베이스커브", "시력"],
      titleAngles: ["검사 전 체크", "안경도수와 다른 점", "처음 맞출 때"],
    },
    {
      axis: "lifestyle",
      topic: "장시간 렌즈 착용이 불편한 이유",
      thesis:
        "장시간 착용자는 렌즈 종류보다 눈 상태, 사용 시간, 중간 휴식 습관을 먼저 조정해야 한다.",
      searcherQuestion: "출근부터 퇴근까지 렌즈를 끼면 왜 힘든가",
      preferredModifiers: ["장시간", "착용시간", "건조", "충혈", "관리", "검사"],
      titleAngles: ["하루 종일 낄 때", "퇴근 무렵 불편할 때", "착용시간 기준"],
    },
    {
      axis: "visit",
      topic: "난시렌즈 맞추기 전 확인할 점",
      thesis:
        "난시렌즈는 도수뿐 아니라 축 안정성, 회전, 착용감까지 맞아야 선명함이 유지된다.",
      searcherQuestion: "난시렌즈를 껴도 흐리게 보이는 이유가 무엇인가",
      preferredModifiers: ["난시", "도수", "축", "흐림", "검사", "착용감"],
      titleAngles: ["흐리게 보일 때", "처음 맞출 때", "검사 기준"],
    },
  ],
  "eye-info": [
    {
      axis: "problem",
      topic: "눈피로가 오래 가는 이유",
      thesis:
        "눈피로는 화면 사용만이 아니라 도수 변화, 건조감, 조명, 생활 자세가 겹쳐 생길 수 있다.",
      searcherQuestion: "잠을 자도 눈이 피곤한 이유가 무엇인가",
      preferredModifiers: ["눈피로", "원인", "건조", "시력", "검사", "습관"],
      titleAngles: ["오래 피곤할 때", "생활에서 놓치는 원인", "검사 전 확인"],
    },
    {
      axis: "comparison",
      topic: "근시와 난시 차이",
      thesis:
        "흐림의 원인이 근시인지 난시인지에 따라 안경 도수와 렌즈 선택 기준이 달라진다.",
      searcherQuestion: "근시와 난시는 무엇이 다르고 왜 같이 생기나",
      preferredModifiers: ["근시", "난시", "도수", "흐림", "검사", "시력"],
      titleAngles: ["흐림 원인 비교", "검사에서 보는 차이", "도수표 이해"],
    },
    {
      axis: "verification",
      topic: "시력검사 전 확인할 생활 습관",
      thesis:
        "시력검사는 숫자만 재는 과정이 아니라 최근 생활거리, 피로도, 기존 안경 불편까지 함께 확인해야 한다.",
      searcherQuestion: "시력검사를 받을 때 무엇을 말해야 정확히 맞출 수 있나",
      preferredModifiers: ["시력검사", "생활거리", "도수", "눈피로", "검사", "안경"],
      titleAngles: ["검사 전 체크", "도수 맞추기 전", "생활거리 기준"],
    },
    {
      axis: "lifestyle",
      topic: "야간 시야가 흐려지는 이유",
      thesis:
        "야간 시야 불편은 단순 눈부심이 아니라 도수 변화, 난시, 렌즈 상태가 함께 영향을 줄 수 있다.",
      searcherQuestion: "밤에 운전하거나 걸을 때 왜 더 흐리게 보이나",
      preferredModifiers: ["야간", "시야", "흐림", "난시", "도수", "검사"],
      titleAngles: ["밤에 흐릴 때", "운전 전 확인", "빛 번짐 원인"],
    },
    {
      axis: "visit",
      topic: "아이 시력검사 전 부모가 볼 점",
      thesis:
        "아이 시력은 한 번의 숫자보다 생활 신호와 변화 속도를 함께 봐야 관리 방향이 잡힌다.",
      searcherQuestion: "아이 시력이 떨어지는 신호를 부모가 어떻게 알아차릴 수 있나",
      preferredModifiers: ["어린이", "시력검사", "근시", "습관", "관리", "부모"],
      titleAngles: ["부모가 볼 신호", "검사 전 체크", "근시 관리 기준"],
    },
  ],
  "glasses-story": [
    {
      axis: "problem",
      topic: "안경이 자꾸 흘러내리는 이유",
      thesis:
        "안경 흘러내림은 코받침만의 문제가 아니라 테 균형, 귀 높이, 렌즈 무게가 함께 만든다.",
      searcherQuestion: "안경이 계속 내려가고 코에 자국이 남는 이유가 무엇인가",
      preferredModifiers: ["흘러내림", "피팅", "코패드", "착용감", "조정", "무게"],
      titleAngles: ["계속 내려갈 때", "코 자국이 남을 때", "피팅 전 확인"],
    },
    {
      axis: "comparison",
      topic: "안경세척과 안경닦이 관리 차이",
      thesis:
        "안경 관리는 닦는 횟수보다 세척 순서, 닦이 상태, 코팅 손상 가능성을 구분해야 한다.",
      searcherQuestion: "안경을 어떻게 닦아야 흠집과 얼룩이 덜 생기나",
      preferredModifiers: ["세척", "안경닦이", "관리", "코팅", "흠집", "얼룩"],
      titleAngles: ["닦는 습관 비교", "흠집 줄이는 순서", "관리 전 체크"],
    },
    {
      axis: "verification",
      topic: "안경수리 맡기기 전 확인할 점",
      thesis:
        "안경수리는 파손 부위만 보지 말고 테 소재, 나사 상태, 피팅 가능 범위를 먼저 확인해야 한다.",
      searcherQuestion: "안경이 휘거나 나사가 풀렸을 때 수리 가능한지 어떻게 알 수 있나",
      preferredModifiers: ["수리", "나사", "피팅", "파손", "조정", "소재"],
      titleAngles: ["수리 전 체크", "맡기기 전 확인", "조정 가능 범위"],
    },
    {
      axis: "lifestyle",
      topic: "마스크 쓸 때 안경김서림 줄이는 법",
      thesis:
        "김서림은 렌즈 문제가 아니라 공기 흐름, 마스크 밀착, 세척 상태가 함께 만드는 생활 불편이다.",
      searcherQuestion: "마스크나 겨울 외출 때 안경 김서림을 어떻게 줄일 수 있나",
      preferredModifiers: ["김서림", "마스크", "세척", "관리", "겨울", "습기"],
      titleAngles: ["외출할 때 김이 설 때", "마스크 착용 중", "생활 관리 기준"],
    },
    {
      axis: "visit",
      topic: "안경 착용감 조정 전 확인할 신호",
      thesis:
        "착용감 조정은 불편 부위를 정확히 말할수록 코, 귀, 렌즈 중심을 더 빠르게 맞출 수 있다.",
      searcherQuestion: "안경이 불편할 때 어떤 증상을 말해야 피팅이 쉬운가",
      preferredModifiers: ["착용감", "조정", "피팅", "코패드", "귀통증", "균형"],
      titleAngles: ["조정 전 신호", "불편 부위별 기준", "피팅 받을 때"],
    },
  ],
};

const DEFAULT_TEMPLATES = CATEGORY_TOPIC_TEMPLATES["eye-info"];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasOverlap(a: string, b: string): boolean {
  const aa = a.replace(/\s+/g, "").toLowerCase();
  const bb = b.replace(/\s+/g, "").toLowerCase();
  return aa.length > 0 && bb.includes(aa);
}

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const normalized = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function interleaveTopicAxes(templates: TopicTemplate[]): TopicTemplate[] {
  const axisOrder: TopicIntentAxis[] = [
    "product",
    "problem",
    "comparison",
    "verification",
    "lifestyle",
    "visit",
  ];
  const buckets = new Map<TopicIntentAxis, TopicTemplate[]>();
  for (const template of templates) {
    buckets.set(template.axis, [...(buckets.get(template.axis) ?? []), template]);
  }

  const result: TopicTemplate[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const axis of axisOrder) {
      const bucket = buckets.get(axis) ?? [];
      const next = bucket.shift();
      if (!next) continue;
      result.push(next);
      added = true;
    }
  }
  return result;
}

function buildUserTopicPlan(userTopic: string, category: Category): TopicPlan {
  const topic = normalizeText(userTopic).slice(0, 80);
  return {
    topic,
    thesis: topic,
    axis: "verification",
    searcherQuestion: `${topic}에 대해 검색한 사람이 무엇을 확인하려는가`,
    preferredModifiers: [
      ...new Set([
        ...(topic.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []),
        ...category.subcategories,
      ]),
    ].slice(0, 8),
    titleAngles: ["확인할 점", "선택 기준", "불편한 이유"],
    notes: ["사용자가 직접 입력한 주제를 우선했습니다."],
  };
}

function buildProductTopicPlan(params: {
  productHead: string;
  category: Category;
}): TopicPlan {
  const categoryId = params.category.id;
  const head = params.productHead;
  if (categoryId === "contacts") {
    return {
      topic: `${head} 착용 전 확인할 점`,
      thesis: `${head}는 브랜드명보다 착용 시간, 건조감, 난시 여부, 검사 결과가 맞아야 편하게 쓸 수 있다.`,
      axis: "product",
      searcherQuestion: `${head}를 선택하기 전에 내 눈에 맞는지 무엇을 확인해야 하나`,
      preferredModifiers: ["착용감", "건조", "난시", "검사", "착용시간", "원데이"],
      titleAngles: ["착용 전 확인", "건조감이 있을 때", "검사 기준"],
      notes: ["매장 상품/브랜드 축을 자동 주제로 반영했습니다."],
    };
  }
  if (categoryId === "frames") {
    return {
      topic: `${head} 선택 전 착용감 기준`,
      thesis: `${head}는 디자인만 보지 말고 얼굴형, 무게, 코와 귀의 압박, 피팅 가능성을 함께 봐야 한다.`,
      axis: "product",
      searcherQuestion: `${head}를 고를 때 디자인 말고 무엇을 확인해야 하나`,
      preferredModifiers: ["착용감", "얼굴형", "무게", "피팅", "안경테", "선택"],
      titleAngles: ["착용감 기준", "얼굴형에 맞을 때", "피팅 전 확인"],
      notes: ["매장 상품/브랜드 축을 자동 주제로 반영했습니다."],
    };
  }
  if (categoryId === "progressive") {
    return {
      topic: `${head} 누진렌즈 선택 전 기준`,
      thesis: `${head} 같은 브랜드 렌즈도 생활거리, 도수 변화, 적응 가능성에 따라 체감이 달라지므로 검사 기준이 먼저다.`,
      axis: "product",
      searcherQuestion: `${head} 누진렌즈가 내 생활거리와 도수에 맞는지 어떻게 판단하나`,
      preferredModifiers: ["누진렌즈", "시야", "도수", "적응", "검사", "선택"],
      titleAngles: ["누진렌즈 선택 전", "시야가 낯설 때", "검사 기준"],
      notes: ["매장 상품/브랜드 축을 자동 주제로 반영했습니다."],
    };
  }
  return {
    topic: `${head} 선택 전 확인할 기준`,
    thesis: `${head}는 이름보다 도수, 코팅, 두께, 사용 환경이 맞아야 실제 착용 만족도가 높아진다.`,
    axis: "product",
    searcherQuestion: `${head}를 선택하기 전에 어떤 기준을 확인해야 하나`,
    preferredModifiers: ["안경렌즈", "도수", "코팅", "두께", "검사", "선택"],
    titleAngles: ["선택 전 기준", "도수별 차이", "교체 전 확인"],
    notes: ["매장 상품/브랜드 축을 자동 주제로 반영했습니다."],
  };
}

export function planBlogTopics(params: {
  shop: Shop;
  category: Category;
  userTopic?: string;
  existingTitles?: string[];
  maxCount?: number;
}): TopicPlan[] {
  const userTopic = normalizeText(params.userTopic ?? "");
  if (userTopic) {
    return [buildUserTopicPlan(userTopic, params.category)];
  }

  const productPlans = getShopProductHeads({
    shop: params.shop,
    category: params.category,
  })
    .slice(0, 3)
    .map((productHead) => buildProductTopicPlan({ productHead, category: params.category }));
  const templates = interleaveTopicAxes([
    ...productPlans,
    ...(CATEGORY_TOPIC_TEMPLATES[params.category.id] ?? DEFAULT_TEMPLATES),
  ]);
  const monthKey = getMonthKey();
  const offset = hashText(`${params.shop.id}:${params.category.id}:${monthKey}`);
  const existingTitles = params.existingTitles ?? [];
  const rotated = rotate(templates, offset);
  const filtered = rotated.filter(
    (template) => !existingTitles.some((title) => hasOverlap(template.topic, title))
  );
  const chosen = filtered.length > 0 ? filtered : rotated;

  return chosen.slice(0, params.maxCount ?? 5).map((template) => ({
    ...template,
    notes: [
      "PathPost식 전체 주제/논지 입력을 카테고리 기반으로 자동 확정했습니다.",
      "문제형, 비교형, 검사형, 생활상황형, 방문판단형 축을 순환해 반복 소재를 줄입니다.",
    ],
  }));
}

export function planBlogTopic(params: {
  shop: Shop;
  category: Category;
  userTopic?: string;
  existingTitles?: string[];
}): TopicPlan {
  return planBlogTopics({ ...params, maxCount: 1 })[0] ?? buildUserTopicPlan(params.category.name, params.category);
}

export function planMonthlyCategorySlots(params: {
  shop: Shop;
  categories: Category[];
  existingTitles?: string[];
  slotCount?: number;
}): MonthlyCategorySlot[] {
  const preferredOrder = [
    "lenses",
    "frames",
    "progressive",
    "contacts",
    "eye-info",
    "glasses-story",
  ];
  const byId = new Map(params.categories.map((category) => [category.id, category]));
  const orderedCategories = [
    ...preferredOrder
      .map((categoryId) => byId.get(categoryId))
      .filter((category): category is Category => Boolean(category)),
    ...params.categories.filter((category) => !preferredOrder.includes(category.id)),
  ];
  const monthKey = getMonthKey();
  const rotatedCategories = rotate(
    orderedCategories,
    hashText(`${params.shop.id}:${monthKey}:category-mix`)
  );
  const slotCount = params.slotCount ?? 10;
  const categoryUseCounts = new Map<string, number>();

  return Array.from({ length: slotCount }, (_, index) => {
    const category = rotatedCategories[index % rotatedCategories.length];
    const useCount = categoryUseCounts.get(category.id) ?? 0;
    categoryUseCounts.set(category.id, useCount + 1);
    const topicPlans = planBlogTopics({
      shop: params.shop,
      category,
      existingTitles: params.existingTitles,
      maxCount: 6,
    });
    const topicPlan = topicPlans[useCount % Math.max(1, topicPlans.length)];
    return {
      slot: index + 1,
      categoryId: category.id,
      categoryName: category.name,
      topic: topicPlan.topic,
      thesis: topicPlan.thesis,
      axis: topicPlan.axis,
      preferredModifiers: topicPlan.preferredModifiers,
    };
  });
}
