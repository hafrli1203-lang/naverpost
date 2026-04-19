const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

function transpileModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
}

function loadRouteModule() {
  const routePath = path.join(process.cwd(), "src", "app", "api", "article", "geo", "route.ts");
  const code = transpileModule(routePath);

  const advancedJobs = new Map();

  const mockApplyGeoRecommendations = (article, selectedIds) => ({
    appliedRecommendationIds: selectedIds,
    optimizedContent: `${article.content}\n\n## GEO 정리\n\n| 항목 | 설명 |\n| :--- | :--- |\n| 기준 | 요약 |\n`,
    analysisBefore: {
      score: 60,
      grade: "good",
      summary: "before",
      categories: [],
      recommendations: [],
      previewTitle: article.title,
      previewDescription: article.content.slice(0, 60),
      citationDensityLabel: "낮음",
      citationDensityCount: 0,
    },
    analysisAfter: {
      score: selectedIds.includes("direct-answer-lead") ? 68 : 64,
      grade: "good",
      summary: "after",
      categories: [],
      recommendations: [],
      previewTitle: article.title,
      previewDescription: article.content.slice(0, 60),
      citationDensityLabel: "보통",
      citationDensityCount: 1,
    },
  });

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    process,
    console,
    crypto: { randomUUID: () => "job-test-123" },
    setTimeout,
    clearTimeout,
    require: (specifier) => {
      if (specifier === "next/server") {
        return {
          NextRequest: class {},
          NextResponse: {
            json(data, init) {
              return {
                status: init?.status ?? 200,
                body: data,
              };
            },
          },
        };
      }
      if (specifier === "@/lib/ai/claude") {
        return {
          rewriteArticleForGeo: async () =>
            "안경렌즈 스크래치는 세척 방식과 보관 습관에 따라 빨라질 수 있습니다.\n\n## 관리 기준\n\n| 항목 | 설명 |\n| :--- | :--- |\n| 기준 | 점검 |\n",
        };
      }
      if (specifier === "@/lib/geo/harness") {
        return {
          applyGeoRecommendations: mockApplyGeoRecommendations,
          runGeoHarness: (article) => ({
            score: article.content.includes("GEO 정리") ? 68 : 60,
            grade: "good",
            summary: "mock",
            categories: [],
            recommendations: [],
            previewTitle: article.title,
            previewDescription: article.content.slice(0, 60),
            citationDensityLabel: "보통",
            citationDensityCount: 1,
          }),
        };
      }
      if (specifier === "@/lib/prompts/geoRewritePrompt") {
        return {
          buildGeoRewritePrompt: () => "mock prompt",
        };
      }
      if (specifier === "@/lib/validation/prohibitedWords") {
        return {
          PROHIBITED_WORDS: [],
          CAUTION_PHRASES: [],
        };
      }
      if (specifier === "@/lib/validation/repetitionCheck") {
        return {
          findOverusedWords: () => [],
        };
      }
      if (specifier === "@/lib/validation/contentSignalAnalyzer") {
        return {
          analyzeLanguageRisk: () => ({
            profanity: [],
            abuse: [],
            adult: [],
            commercial: [],
            emphasis: [],
            advertising: [],
            issues: [],
          }),
        };
      }
      if (specifier === "@/lib/validation/titleBodyAlignment") {
        return {
          analyzeTitleBodyAlignment: () => ({
            titleKeywordCoverage: [],
            missingTitleKeywordCoverage: [],
            hasTableText: true,
            hasQuoteText: false,
            hasCaptionText: false,
            hasAttachmentText: false,
            alignmentNotes: [],
            issues: [],
          }),
        };
      }
      if (specifier === "@/types") {
        return {};
      }
      throw new Error(`Unsupported import: ${specifier}`);
    },
  };

  vm.runInNewContext(code, sandbox, { filename: routePath });
  return sandbox.module.exports;
}

function mockRequest(body) {
  return {
    async json() {
      return body;
    },
  };
}

async function main() {
  const { POST } = loadRouteModule();

  const article = {
    title: "안경렌즈 스크래치 발생 원인과 수명 단축 관계",
    content:
      "안경렌즈 스크래치가 생기면 빛 번짐이 심해질 수 있습니다.\n\n| 항목 | 설명 |\n| :--- | :--- |\n| 원인 | 마찰 |\n",
    mainKeyword: "안경렌즈 스크래치",
    subKeyword1: "안경렌즈 수명",
    subKeyword2: "안경렌즈 관리",
    shopName: "지니스안경 김해장유점",
    category: "안경원",
    validation: {
      needsRevision: false,
      prohibitedWords: [],
      cautionPhrases: [],
      overusedWords: [],
      missingKeywords: [],
      hasTable: true,
      revisionReasons: [],
    },
  };

  const analyze = await POST(mockRequest({ mode: "analyze", article }));
  if (analyze.status !== 200 || analyze.body?.success !== true) {
    throw new Error("analyze route failed");
  }

  const apply = await POST(
    mockRequest({
      mode: "apply",
      article,
      selectedRecommendationIds: ["remove-template-blocks", "comparison-table"],
    })
  );
  if (apply.status !== 200 || apply.body?.data?.optimization?.analysisAfter?.score < 60) {
    throw new Error("apply route failed");
  }

  const startAdvanced = await POST(
    mockRequest({
      mode: "start-advanced",
      article,
      selectedRecommendationIds: ["remove-template-blocks", "comparison-table", "direct-answer-lead"],
    })
  );
  if (
    startAdvanced.status !== 200 ||
    startAdvanced.body?.success !== true ||
    !startAdvanced.body?.data?.jobId
  ) {
    throw new Error("start-advanced route failed");
  }

  await new Promise((resolve) => setTimeout(resolve, 10));

  const status = await POST(
    mockRequest({
      mode: "advanced-status",
      jobId: startAdvanced.body.data.jobId,
    })
  );
  if (status.status !== 200 || status.body?.success !== true || !status.body?.data?.status) {
    throw new Error("advanced-status route failed");
  }

  const invalidStatus = await POST(
    mockRequest({
      mode: "advanced-status",
      jobId: "missing-job",
    })
  );
  if (invalidStatus.status !== 404) {
    throw new Error("advanced-status missing-job should return 404");
  }

  console.log("geo-route tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
