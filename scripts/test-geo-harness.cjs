const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const vm = require("vm");

function loadHarness() {
  const filePath = path.join(process.cwd(), "src", "lib", "geo", "harness.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    process,
    __dirname: path.dirname(filePath),
    __filename: filePath,
  };
  sandbox.exports = sandbox.module.exports;

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return sandbox.module.exports;
}

function makeArticle(overrides) {
  return {
    title: "기본 제목",
    content: "기본 본문입니다.",
    mainKeyword: "기본 키워드",
    subKeyword1: "보조 키워드1",
    subKeyword2: "보조 키워드2",
    shopName: "예시매장",
    category: "예시업종",
    validation: {
      needsRevision: false,
      prohibitedWords: [],
      cautionPhrases: [],
      overusedWords: [],
      missingKeywords: [],
      hasTable: false,
      revisionReasons: [],
    },
    ...overrides,
  };
}

function getSelectedIds(analysis) {
  return analysis.recommendations
    .filter((item) => item.selectedByDefault)
    .map((item) => item.id);
}

function run() {
  const { runGeoHarness, applyGeoRecommendations } = loadHarness();

  const compareArticle = makeArticle({
    title: "HIFU와 인모드, 어떤 경우에 더 잘 맞을까요?",
    content:
      "리프팅 장비를 고를 때는 통증, 회복 부담, 유지 관리 빈도를 같이 봐야 합니다. 같은 처짐이라도 피부 두께와 지방량에 따라 체감이 달라질 수 있습니다.",
    mainKeyword: "HIFU와 인모드",
    subKeyword1: "리프팅 비교",
    subKeyword2: "탄력 관리",
    category: "피부과",
  });
  const compareAnalysis = runGeoHarness(compareArticle);
  assert(compareAnalysis.recommendations.some((item) => item.id === "comparison-table"));

  const costArticle = makeArticle({
    title: "카페 창업 비용, 어떤 기준으로 봐야 할까요?",
    content:
      "카페 창업 비용은 인테리어만 보면 실제 예산과 차이가 커질 수 있습니다. 보증금, 장비, 초기 운영자금까지 함께 보는 편이 좋습니다.",
    mainKeyword: "카페 창업 비용",
    subKeyword1: "카페 창업 예산",
    subKeyword2: "초기 비용",
    category: "카페 컨설팅",
  });
  const costAnalysis = runGeoHarness(costArticle);
  assert(costAnalysis.recommendations.some((item) => item.id === "comparison-table"));

  const templateArticle = makeArticle({
    title: "시력저하 증상은 어떤 기준으로 보면 좋을까요?",
    content: `## 시력저하 증상은 어떤 기준으로 보면 좋을까요?
핵심 답변: 현재 상태, 생활 패턴, 기대하는 변화를 기준으로 보면 이해가 쉽습니다.

시력저하 증상은 서서히 진행되는 경우가 많아 컨디션 문제로 넘기기 쉽습니다.

## FAQ

### 시력저하 증상은 누구에게 먼저 확인이 필요할까요?
핵심 답변: 증상과 생활 패턴을 같이 봐야 합니다.

## 확인 및 안내

이 글은 공개 자료와 현장 상담 관점을 바탕으로 정리했습니다.`,
    mainKeyword: "시력저하 증상",
    subKeyword1: "시력저하 검사",
    subKeyword2: "시력저하 자각",
    shopName: "지니스안경 공주신관점",
    category: "안경원",
  });
  const templateAnalysis = runGeoHarness(templateArticle);
  const templateSelected = getSelectedIds(templateAnalysis);
  assert(templateSelected.includes("remove-template-blocks"));

  const templateApplied = applyGeoRecommendations(templateArticle, templateSelected);
  assert(!templateApplied.optimizedContent.includes("## FAQ"));
  assert(!templateApplied.optimizedContent.includes("## 확인 및 안내"));
  assert(!templateApplied.optimizedContent.includes("핵심 답변:"));
  assert(
    templateApplied.analysisAfter.score >= templateApplied.analysisBefore.score,
    "GEO 적용 후 점수가 낮아지면 안 됩니다."
  );

  const livePatternArticle = makeArticle({
    title: "메탈안경 코팅 벗겨짐 원인과 관리 방법 안내",
    content: `메탈안경 코팅는 어떤 기준으로 보면 좋을까요? 현재 상태, 생활 패턴, 기대하는 변화 기준으로 나눠 보면 훨씬 이해가 쉬워집니다.

안경테 표면이 어느 순간부터 얼룩처럼 변해 있는 걸 발견하면 당황스러우실 수 있어요.

## 확인 및 안내

이 글은 2026-04-18 기준 공개 자료와 현장 상담 관점을 바탕으로 정리했습니다.`,
    mainKeyword: "메탈안경 코팅",
    subKeyword1: "메탈안경 벗겨짐",
    subKeyword2: "메탈안경 관리",
  });
  const livePatternAnalysis = runGeoHarness(livePatternArticle);
  assert(livePatternAnalysis.recommendations.some((item) => item.id === "remove-template-blocks"));
  const livePatternApplied = applyGeoRecommendations(livePatternArticle, ["remove-template-blocks"]);
  assert(!livePatternApplied.optimizedContent.includes("어떤 기준으로 보면 좋을까요?"));
  assert(!livePatternApplied.optimizedContent.includes("## 확인 및 안내"));

  const naturalIntroArticle = makeArticle({
    title: "안경관리 여름철 땀과 자외선으로부터 보호하는 요령",
    content: `요즘 밖에 잠깐만 나가도 이마에서 땀이 줄줄 흐르죠.

이런 불편함이 단순히 기분 탓만은 아니에요. 땀 속 염분과 자외선이 렌즈와 프레임에 영향을 줄 수 있거든요.

그래서 오늘은 여름철 안경관리에서 먼저 챙기면 좋은 세척 습관과 보관 방법을 정리해 보겠습니다.`,
    mainKeyword: "안경관리 여름",
    subKeyword1: "안경 땀 관리",
    subKeyword2: "안경 자외선 관리",
  });
  const naturalIntroApplied = applyGeoRecommendations(naturalIntroArticle, ["remove-template-blocks"]);
  assert(naturalIntroApplied.optimizedContent.includes("요즘 밖에 잠깐만 나가도 이마에서 땀이 줄줄 흐르죠."));
  assert(naturalIntroApplied.optimizedContent.includes("세척 습관과 보관 방법을 정리해 보겠습니다."));

  const priceListArticle = makeArticle({
    title: "26년 4월 안경 & 콘택트렌즈 가격표",
    content: `26년 4월 안경 & 콘택트렌즈 가격표를 정리해 드립니다.

매장에서 많이 찾으시는 품목 위주로 가격대를 먼저 확인하실 수 있도록 준비했습니다.

| 품목 | 가격 |
| :--- | :--- |
| 블루라이트 렌즈 | 49,000원부터 |
| 변색 렌즈 | 89,000원부터 |
| 콘택트렌즈 | 브랜드별 상이 |

가격은 재고와 공급 일정에 따라 달라질 수 있으니 방문 전 한 번 더 확인해 주세요.`,
    mainKeyword: "안경 가격표",
    subKeyword1: "콘택트렌즈 가격",
    subKeyword2: "안경원 가격 안내",
  });
  const priceListAnalysis = runGeoHarness(priceListArticle);
  assert(!priceListAnalysis.recommendations.some((item) => item.id === "remove-template-blocks"));
  const priceListApplied = applyGeoRecommendations(priceListArticle, ["remove-template-blocks"]);
  assert(priceListApplied.optimizedContent.includes("26년 4월 안경 & 콘택트렌즈 가격표를 정리해 드립니다."));
  assert(priceListApplied.optimizedContent.includes("| 블루라이트 렌즈 | 49,000원부터 |"));

  const productIntroArticle = makeArticle({
    title: "공주시 레이벤 선글라스 찾는다면 이번 신제품 보세요",
    content: `이번에 입고된 레이벤 신제품은 프레임 두께와 컬러 밸런스가 좋아서 직접 보시면 더 매력이 잘 느껴집니다.

얼굴형에 따라 느낌이 꽤 달라지기 때문에 같은 모델도 착용해 보면서 비교하시는 편이 좋습니다.

매장에서는 기본 피팅과 렌즈 컬러 상담까지 함께 도와드리고 있으니 편하게 둘러보셔도 괜찮습니다.`,
    mainKeyword: "레이벤 선글라스",
    subKeyword1: "공주시 선글라스",
    subKeyword2: "레이벤 신제품",
  });
  const productIntroAnalysis = runGeoHarness(productIntroArticle);
  assert(!productIntroAnalysis.recommendations.some((item) => item.id === "remove-template-blocks"));
  const productIntroApplied = applyGeoRecommendations(productIntroArticle, ["remove-template-blocks"]);
  assert(productIntroApplied.optimizedContent.includes("이번에 입고된 레이벤 신제품은 프레임 두께와 컬러 밸런스가 좋아서"));
  assert(productIntroApplied.optimizedContent.includes("매장에서는 기본 피팅과 렌즈 컬러 상담까지 함께 도와드리고 있으니"));

  console.log("geo-harness tests passed");
}

run();
