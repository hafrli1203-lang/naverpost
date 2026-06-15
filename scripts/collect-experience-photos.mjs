// 체험단 블로그 글에서 본문 사진을 수집한다(레퍼런스/창작 용도).
// 사용법: node scripts/collect-experience-photos.mjs [shopId|all]
// 입력: data/experience-urls.json  { "<blogId>": ["https://m.blog.naver.com/...", ...] }
// 출력: data/shop-refs/<shop>/_refs/<blogger>_<n>.jpg  (격리 폴더 — 큐레이션 전까지 자동 사용 안 됨)
//
// 우회/크롤링 회피 없음: 공개 글의 본문 이미지를 일반 UA로 받아온다(사용자가 지정한 URL).

import fs from "fs/promises";
import path from "path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_PER_POST = 12;
const MIN_BYTES = 15000; // 아이콘/썸네일 잡티 제거
const onlyShop = process.argv[2] || "all";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toMobile(u) {
  return u.replace("://blog.naver.com/", "://m.blog.naver.com/");
}
function bloggerId(u) {
  const m = u.match(/m\.blog\.naver\.com\/([^/]+)\//);
  return m ? m[1].replace(/[^A-Za-z0-9_-]/g, "") : "blog";
}

async function extractImageUrls(postUrl) {
  const res = await fetch(toMobile(postUrl), { headers: { "User-Agent": UA } });
  const html = await res.text();
  const raw = [...html.matchAll(/data-lazy-src="(https:\/\/mblogthumb-phinf\.pstatic\.net\/[^"]+)"/g)].map(
    (m) => m[1]
  );
  // 고유 경로(쿼리 제외)로 중복 제거 + 화질 업(w966)
  const seen = new Set();
  const out = [];
  for (const u of raw) {
    const base = u.split("?")[0];
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base + "?type=w966");
    if (out.length >= MAX_PER_POST) break;
  }
  return out;
}

async function download(url, dest, referer) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: referer } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) return 0;
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return 0; // JPEG 매직만
  await fs.writeFile(dest, buf);
  return buf.length;
}

const config = JSON.parse(await fs.readFile("data/experience-urls.json", "utf8"));
const shops = onlyShop === "all" ? Object.keys(config) : [onlyShop];

for (const shop of shops) {
  const urls = config[shop] || [];
  const dir = path.join("data", "shop-refs", shop, "_refs");
  await fs.mkdir(dir, { recursive: true });
  let saved = 0;
  console.log(`\n### ${shop} (${urls.length} posts)`);
  for (const postUrl of urls) {
    const blogger = bloggerId(postUrl);
    let imgs = [];
    try {
      imgs = await extractImageUrls(postUrl);
    } catch (e) {
      console.log(`  ${blogger}: 추출 실패 ${e.message}`);
      continue;
    }
    let n = 0;
    for (let i = 0; i < imgs.length; i++) {
      const dest = path.join(dir, `${blogger}_${i + 1}.jpg`);
      try {
        const bytes = await download(imgs[i], dest, toMobile(postUrl));
        if (bytes > 0) {
          n++;
          saved++;
        }
      } catch {
        /* skip */
      }
      await sleep(120);
    }
    console.log(`  ${blogger}: ${n}장`);
    await sleep(300);
  }
  console.log(`=> ${shop} 총 ${saved}장 -> ${dir}`);
}
console.log("\nDONE");
