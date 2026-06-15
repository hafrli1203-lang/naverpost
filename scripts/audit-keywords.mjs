// 키워드/제목 품질 자동 점검 (제대로 QA).
// 사용법: node scripts/audit-keywords.mjs [shopId] [baseUrl]
//   예: node scripts/audit-keywords.mjs top50jn http://localhost:3100
// 6개 카테고리를 refresh로 생성한 뒤, 카테고리 누수·비문·rule3·길이·중복·소재쏠림을 점검한다.
// 종료코드: 이슈 0 → 0, 이슈 있으면 1 (CI/수동 게이트로 사용 가능).

const shop = process.argv[2] || "top50jn";
const BASE = process.argv[3] || "http://localhost:3100";
const CATS = ["frames", "lenses", "contacts", "eye-info", "progressive", "glasses-story"];

const FOREIGN = {
  frames: /콘택트|원데이|소프트렌즈|하드렌즈|컬러렌즈|서클렌즈|토릭렌즈|드림렌즈|멀티포컬|누진|다초점|변색렌즈|블루라이트|렌즈건조|렌즈충혈/,
  lenses: /콘택트|원데이|소프트렌즈|하드렌즈|컬러렌즈|서클렌즈|토릭렌즈|드림렌즈|미용렌즈|멀티포컬|선글라스|안경테|뿔테|티타늄|울템|하금테|코패드/,
  contacts: /안경테|뿔테|티타늄|울템|누진|다초점|노안안경|선글라스|고굴절|압축렌즈|코팅렌즈|안경수리|김서림/,
  "eye-info": /콘택트렌즈|원데이|소프트렌즈|하드렌즈|렌즈착용|렌즈세척|안경수리|코패드|뿔테|티타늄/,
  progressive: /콘택트|원데이|렌즈세척|렌즈보관|컬러렌즈|코패드|안경수리|김서림|뿔테|티타늄/,
  "glasses-story": /콘택트렌즈|원데이렌즈|소프트렌즈|하드렌즈|누진렌즈|다초점렌즈/,
};
const NONSENSE = /이름[을에는]\s*(쓰|적|넣|붙)|신호를|넘겨짚|다음 도구|작용감|코팅칠|뜻을 쓰/;
const STOP = new Set(
  "전 후 때 점 곳 법 것 줄 더 또 이 그 저 안 못 봐 볼 할 수 있 좋 전에 먼저 무엇 어떻게 알아둘 살펴볼 챙겨볼 신경 궁금".split(/\s+/)
);

function mainInTitle(title, main) {
  const w = (main || "").trim().split(/\s+/);
  if (w.length < 2) return title.includes((main || "").trim());
  const josa = "(?:에서|으로|보다|처럼|까지|부터|은|는|이|가|을|를|과|와|의|도|만|에|로)?";
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(w.map(esc).join(josa + "\\s*")).test(title);
}
const tokens = (t) => (t.match(/[가-힣]{2,}/g) || []).filter((x) => !STOP.has(x));

async function gen(cat) {
  const r = await fetch(`${BASE}/api/keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopId: shop, categoryId: cat, refresh: true }),
  });
  const j = await r.json();
  const rs = (j && j.data && j.data.results) || j.results || [];
  return rs.map((x) => ({ title: x.title, main: x.mainKeyword, sub1: x.subKeyword1, sub2: x.subKeyword2 }));
}

function audit(cat, rows) {
  const issues = [];
  const seen = new Set();
  const freq = {};
  rows.forEach((r, i) => {
    const s = `${r.title} ${r.main} ${r.sub1} ${r.sub2}`;
    if (FOREIGN[cat] && FOREIGN[cat].test(s)) issues.push(`#${i + 1} 카테고리누수: "${r.title}" (${r.main})`);
    if (NONSENSE.test(r.title)) issues.push(`#${i + 1} 비문: "${r.title}"`);
    if (!mainInTitle(r.title, r.main)) issues.push(`#${i + 1} rule3(메인 미포함): "${r.title}" / ${r.main}`);
    const L = [...r.title].length;
    if (L < 12 || L > 32) issues.push(`#${i + 1} 길이 ${L}: "${r.title}"`);
    const key = r.title.replace(/\s/g, "");
    if (seen.has(key)) issues.push(`#${i + 1} 중복제목: "${r.title}"`);
    else seen.add(key);
    tokens(r.title).forEach((t) => (freq[t] = (freq[t] || 0) + 1));
  });
  Object.entries(freq)
    .filter(([, n]) => n >= 4)
    .forEach(([t, n]) => issues.push(`소재쏠림: "${t}" ${n}개 제목`));
  return issues;
}

let total = 0;
console.log(`[audit-keywords] shop=${shop} base=${BASE}`);
for (const cat of CATS) {
  process.stdout.write(`generating ${cat}... `);
  let rows = [];
  try {
    rows = await gen(cat);
  } catch (e) {
    console.log("FAIL", e.message);
    total += 1;
    continue;
  }
  const issues = audit(cat, rows);
  total += issues.length;
  console.log(`${rows.length}개 ${issues.length === 0 ? "CLEAN" : issues.length + "건"}`);
  issues.forEach((x) => console.log("  " + x));
}
console.log(`\n총 이슈: ${total} ${total === 0 ? "ALL CLEAN ✅" : "❌"}`);
process.exit(total === 0 ? 0 : 1);
