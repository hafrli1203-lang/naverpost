const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const vm = require("vm");

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;

  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadTsModule(relPath) {
  const filePath = path.join(process.cwd(), relPath);
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

async function run() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const { buildGeoRewritePrompt } = loadTsModule("src/lib/prompts/geoRewritePrompt.ts");
  const { rewriteArticleForGeo } = loadTsModule("src/lib/ai/claude.ts");
  const { runGeoHarness } = loadTsModule("src/lib/geo/harness.ts");

  const article = {
    title: "안경테 스크래치 발생 원인과 수명 늘리는 법",
    content:
      "안경테 스크래치는 마른 천으로 반복해서 닦거나 보관 습관이 거칠 때 더 빨리 생길 수 있습니다. 표면 손상을 늦추려면 세척 방식과 보관 방식을 같이 점검하는 편이 좋습니다.\n\n일상에서 안경테 수명을 좌우하는 요인은 생각보다 단순합니다. 닦는 습관, 보관 위치, 땀과 피지 노출처럼 사소해 보이는 요소가 누적되면서 표면 상태가 달라질 수 있습니다.\n\n지니스안경 김해장유점\n오시면 안경 상태를 직접 살펴보고 편안하게 이야기 나누실 수 있어요.\n(지도 정보가 들어갈 자리)",
    mainKeyword: "안경테 스크래치 원인",
    subKeyword1: "안경테 수명",
    subKeyword2: "안경 관리",
    shopName: "지니스안경 김해장유점",
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
  };

  const before = runGeoHarness(article, "aggressive");
  const prompt = buildGeoRewritePrompt({ article, targetScore: 90 });
  const attempts = Number(process.env.GEO_AI_ATTEMPTS || "3");
  let best = null;

  for (let i = 0; i < attempts; i += 1) {
    const rewritten = await rewriteArticleForGeo(prompt);
    const cleaned = rewritten.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
    const analysis = runGeoHarness({ ...article, content: cleaned }, "aggressive");

    if (!best || analysis.score > best.analysis.score) {
      best = {
        content: cleaned,
        analysis,
      };
    }
  }

  const cleaned = best.content;
  const after = best.analysis;
  fs.writeFileSync(
    path.join(process.cwd(), "tmp-geo-ai-output.txt"),
    cleaned,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        before: before.score,
        after: after.score,
        attempts,
        beforeCategories: before.categories,
        afterCategories: after.categories,
        preview: cleaned.replace(/\s+/g, " ").slice(0, 280),
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
