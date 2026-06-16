// Ad-hoc test: 다른 매장 + 다른 어체 본문 생성 → 워싱 흐름 검증
// 사용자 요청에 따라 임시 작성. 검증 후 삭제 가능.

const BASE = "http://localhost:3000";

const keyword = {
  title: "안경렌즈 코팅 종류와 일상에서 살피는 관리 기준",
  mainKeyword: "안경렌즈 코팅",
  subKeyword1: "안경렌즈 관리",
  subKeyword2: "안경렌즈 세척",
};

const articleBody = {
  keyword,
  shopId: "top50jn",
  categoryId: "lenses",
  topic: "안경렌즈 코팅 종류와 일상 관리 기준",
  articleType: "info",
  charCount: 2000,
  tone: "standard",
};

console.log("[1/2] POST /api/article — 표준 어체, 으뜸50안경 장림시장점");
const t1 = Date.now();
const articleRes = await fetch(`${BASE}/api/article`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(articleBody),
});
const articleJson = await articleRes.json();
console.log(`  → ${articleRes.status} in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
if (!articleJson.success) {
  console.error("  ✗ failed:", articleJson.error);
  process.exit(1);
}
const article = articleJson.data;
console.log(`  ✓ ${article.content.length}자 생성`);
console.log("\n=== 본문 (생성 직후) ===\n");
console.log(article.content);

console.log("\n[2/2] POST /api/article/wash — 워싱");
const t2 = Date.now();
const washRes = await fetch(`${BASE}/api/article/wash`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ article, charCount: 2000 }),
});
const washJson = await washRes.json();
console.log(`  → ${washRes.status} in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
if (!washJson.success) {
  console.error("  ✗ failed:", washJson.error);
  process.exit(1);
}
const washed = washJson.data;
console.log(`  ✓ 워싱 후 ${washed.content.length}자`);
console.log("  washReport:", JSON.stringify(washed.washReport, null, 2));

console.log("\n=== 본문 (워싱 후) ===\n");
console.log(washed.content);
