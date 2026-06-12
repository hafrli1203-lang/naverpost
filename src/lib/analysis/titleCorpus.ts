import fs from "fs/promises";
import path from "path";

/**
 * 실제 업종 제목 말뭉치 (설계: docs/designs/title-corpus.md)
 *
 * 네이버 공식 블로그 검색 API로 카테고리별 실제 상위 제목을 수백 개 수집해
 * 생성·검수 프롬프트의 "용어·표현·분류 기준"으로 쓴다. 손수 만든 동의어 맵·규칙의
 * 두더지잡기를 실데이터 기준으로 대체하는 것이 목적이다.
 */

const CORPUS_FILE = path.join(process.cwd(), "data", "title-corpus.json");
const CORPUS_VERSION = 1;
const CORPUS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TITLES_PER_CATEGORY = 300;
const MAX_QUERIES_PER_HARVEST = 24;
const DISPLAY_PER_QUERY = 30;
const QUERY_DELAY_MS = 120;

type CorpusCategory = {
  harvestedAt: string;
  titles: string[];
};

type CorpusFile = {
  version: number;
  categories: Record<string, CorpusCategory>;
};

let corpusCache: CorpusFile | null = null;

function hasNaverCredentials(): boolean {
  const id = (process.env.NAVER_CLIENT_ID ?? "").trim();
  const secret = (process.env.NAVER_CLIENT_SECRET ?? "").trim();
  return id.length > 0 && secret.length > 0;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// 광고성·정보성 아닌 제목은 표현 기준으로 부적합하다.
function isUsableCorpusTitle(title: string): boolean {
  if (title.length < 8 || title.length > 40) return false;
  if (/이벤트|할인|최저가|특가|세일|문의|예약|증정|쿠폰|개업|오픈|배송/.test(title)) return false;
  if (/[😀-🙏✨💕❤♥★☆]/u.test(title)) return false;
  return true;
}

async function readCorpusFile(): Promise<CorpusFile> {
  if (corpusCache) return corpusCache;
  try {
    const raw = await fs.readFile(CORPUS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CorpusFile;
    corpusCache =
      parsed && parsed.version === CORPUS_VERSION && parsed.categories
        ? parsed
        : { version: CORPUS_VERSION, categories: {} };
  } catch {
    corpusCache = { version: CORPUS_VERSION, categories: {} };
  }
  return corpusCache;
}

async function saveCorpusFile(file: CorpusFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CORPUS_FILE), { recursive: true });
    await fs.writeFile(CORPUS_FILE, JSON.stringify(file, null, 2), "utf-8");
    corpusCache = file;
  } catch {
    // 말뭉치 저장 실패가 키워드 생성을 막으면 안 된다.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchBlogTitles(query: string): Promise<string[]> {
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(DISPLAY_PER_QUERY));
  url.searchParams.set("sort", "sim");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Naver-Client-Id": (process.env.NAVER_CLIENT_ID ?? "").trim(),
      "X-Naver-Client-Secret": (process.env.NAVER_CLIENT_SECRET ?? "").trim(),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`네이버 블로그 검색 실패 (${response.status})`);
  }
  const json = (await response.json()) as { items?: Array<{ title?: string }> };
  return (json.items ?? [])
    .map((item) => stripHtml(item.title ?? ""))
    .filter(Boolean);
}

async function harvestCategoryTitles(seedQueries: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const titles: string[] = [];
  const queries = [...new Set(seedQueries.map((query) => query.trim()).filter(Boolean))].slice(
    0,
    MAX_QUERIES_PER_HARVEST
  );

  for (const query of queries) {
    try {
      const found = await searchBlogTitles(query);
      for (const title of found) {
        const key = title.replace(/\s+/g, "").toLowerCase();
        if (seen.has(key) || !isUsableCorpusTitle(title)) continue;
        seen.add(key);
        titles.push(title);
        if (titles.length >= MAX_TITLES_PER_CATEGORY) return titles;
      }
    } catch {
      // 단일 쿼리 실패는 수집을 중단시키지 않는다.
    }
    await sleep(QUERY_DELAY_MS);
  }
  return titles;
}

/**
 * 카테고리 말뭉치 조회. 캐시가 없거나 30일 경과 시 1회 수집(lazy) 후 캐시.
 * API 실패 시 만료된 캐시라도 있으면 그대로 쓰고, 없으면 빈 배열(graceful).
 */
export async function getCorpusTitles(params: {
  categoryId: string;
  seedQueries: string[];
  limit?: number;
}): Promise<string[]> {
  const { categoryId, seedQueries, limit = 40 } = params;
  const file = await readCorpusFile();
  const cached = file.categories[categoryId];
  const fresh =
    cached && Date.now() - new Date(cached.harvestedAt).getTime() < CORPUS_TTL_MS;

  if (cached && fresh) {
    return cached.titles.slice(0, limit);
  }

  if (!hasNaverCredentials()) {
    return (cached?.titles ?? []).slice(0, limit);
  }

  const titles = await harvestCategoryTitles(seedQueries);
  if (titles.length === 0) {
    return (cached?.titles ?? []).slice(0, limit);
  }

  await saveCorpusFile({
    ...file,
    categories: {
      ...file.categories,
      [categoryId]: { harvestedAt: new Date().toISOString(), titles },
    },
  });
  return titles.slice(0, limit);
}
