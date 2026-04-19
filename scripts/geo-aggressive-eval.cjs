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
    title: "안경 글 샘플",
    content: "안경 글 샘플 본문입니다.",
    mainKeyword: "안경 샘플",
    subKeyword1: "안경 비교",
    subKeyword2: "안경 관리",
    shopName: "지니스안경 테스트점",
    category: "안경원",
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

function summarizeCase(name, article, runGeoHarness, applyGeoRecommendations) {
  const safeBefore = runGeoHarness(article, "safe");
  const aggressiveBefore = runGeoHarness(article, "aggressive");
  const selected = aggressiveBefore.recommendations
    .filter((item) => item.selectedByDefault)
    .map((item) => item.id);
  const aggressiveApplied = applyGeoRecommendations(article, selected, "aggressive");

  return {
    name,
    safeScore: safeBefore.score,
    aggressiveScoreBefore: aggressiveBefore.score,
    aggressiveScoreAfter: aggressiveApplied.analysisAfter.score,
    appliedRecommendationIds: aggressiveApplied.appliedRecommendationIds,
    changed: aggressiveApplied.optimizedContent !== article.content,
    preview:
      aggressiveApplied.optimizedContent
        .replace(/\s+/g, " ")
        .slice(0, 140),
  };
}

function run() {
  const { runGeoHarness, applyGeoRecommendations } = loadHarness();

  const cases = [
    makeArticle({
      title: "렌즈 압축률 1.60과 1.67 차이 비교",
      content:
        "렌즈 압축률 1.60과 1.67 차이를 고민하는 분들이 많습니다. 두 옵션은 두께와 무게, 가격 차이를 같이 봐야 합니다. 도수와 테 크기에 따라 체감이 달라질 수 있습니다.",
      mainKeyword: "렌즈 압축률 1.60 1.67 차이",
      subKeyword1: "렌즈 압축률 비교",
      subKeyword2: "안경렌즈 선택",
    }),
    makeArticle({
      title: "누진다초점 적응 실패 어지러움 줄이는 법",
      content:
        "누진다초점 안경을 처음 쓰면 어지러움과 초점 이동 불편이 생길 수 있습니다. 시선 이동 습관과 도수 적응 기간을 같이 봐야 합니다. 일상에서 적응 속도를 높이는 방법을 정리해보겠습니다.",
      mainKeyword: "누진다초점 적응 실패",
      subKeyword1: "누진다초점 어지러움",
      subKeyword2: "누진다초점 적응",
    }),
    makeArticle({
      title: "안경 스크래치 발생 원인과 수명 관리 팁",
      content:
        "안경 스크래치는 마른 천으로 반복해서 닦거나 보관 습관이 거칠 때 더 빨리 생길 수 있습니다. 표면 손상을 늦추려면 세척 방식과 보관 방식을 같이 점검하는 편이 좋습니다.",
      mainKeyword: "안경 스크래치 원인",
      subKeyword1: "안경 수명 관리",
      subKeyword2: "안경 관리 팁",
    }),
  ];

  const results = cases.map((article, index) =>
    summarizeCase(`case-${index + 1}`, article, runGeoHarness, applyGeoRecommendations)
  );

  console.log(JSON.stringify(results, null, 2));
}

run();
