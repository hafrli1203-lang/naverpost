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
// + 도메인 필터: 모호한 시드(돋보기/시야/렌즈교체)가 네이버에서 부동산 임장·갤럭시·정수기 등
//   비안경 제목을 끌어오므로, 수집 단계에서부터 안경 도메인만 캐시에 저장한다(오염 근본 차단).
//   (OPTICAL_DOMAIN 등은 아래에 선언 — 이 함수는 요청 시점에 호출되므로 참조 안전.)
function isUsableCorpusTitle(title: string): boolean {
  if (title.length < 8 || title.length > 40) return false;
  if (/이벤트|할인|최저가|특가|세일|문의|예약|증정|쿠폰|개업|오픈|배송/.test(title)) return false;
  if (/[😀-🙏✨💕❤♥★☆]/u.test(title)) return false;
  if (!OPTICAL_DOMAIN.test(title) || OFF_DOMAIN_CONTEXT.test(title)) return false;
  if (SHOP_BRANCH_ENDING.test(title.trim())) return false;
  return true;
}

// 프롬프트 예시로 주입할 때 우리 정책(의료광고·저품질 회피)에 어긋나는 표현을 거른다.
// 원천 코퍼스에는 후기·가격·지역·매장명이 섞여 있어, 그대로 예시화하면 금지 각도가 역유입된다.
const NON_COMPLIANT_TITLE = /후기|가격|비용|얼마|추천|순위|TOP|베스트|최고|최저|솔직|내돈내산|협찬|체험단/i;

// 약속 명사로 끝맺는 "완성형" 제목. 생성 모델이 [상황]+[약속어] 구조를 모방하도록 앞세운다.
// 주의: 바로 "점"을 넣으면 지점명(대청점·안민점)을 완성형으로 오인하므로 의미 명사형만 둔다.
const PAYLOAD_ENDING = /(차이|차이점|종류|기준|방법|이유|정리|장단점|장점|단점|뜻|순서|포인트|법|가이드)([은는이가을를]?\??)?$/;

// 지점명("~동점/~역점/안경점/대청점")으로 끝나는 매장 나열 제목은 예시로 부적합.
// 단 의미 명사형(장점/단점/이점/관점/초점/시점/공통점/차이점)은 보존한다.
const SHOP_BRANCH_ENDING = /(?<![장단이관초시통])점$/;

// 도메인 키워드(시야·돋보기 등)에 우연히 걸리는 비안경 맥락(부동산 임장·스마트폰 등)을 제외.
const OFF_DOMAIN_CONTEXT = /임장|입지|매물|부동산|아파트|평수|갤럭시|아이폰|정수기|렌탈|화장실|보일러|에어컨|도수치료|화장품/;

// 안경 도메인 제목만 예시로 쓴다. 수집 시드가 광범위해 정수기 렌탈·고양이 화장실·도수치료
// 같은 도메인 외 제목이 섞여 들어오는데(검증에서 확인), 약속어 정렬이 이를 위로 올려 오염시킨다.
const OPTICAL_DOMAIN = /안경|선글라스|썬글라스|렌즈|시력|시야|안구|초점|난시|근시|노안|돋보기|누진|다초점|콘택트|블루라이트|변색|편광|고굴절|압축렌즈|코팅렌즈|검안|아이웨어|뿔테|티타늄|메탈테|무테|코받침|코패드|눈\s|눈이|눈을|눈은|눈물|눈부심|눈건강/;

// read-time 정제: 도메인 외·정책 위반 제거 → 완성형(약속어 마무리) 우선 정렬 → limit.
// 양쪽 호출부(생성·폴리시)가 자동으로 더 나은 in-domain 예시를 받는다.
function refineCorpusTitles(titles: string[], limit: number): string[] {
  const clean = titles.filter(
    (title) =>
      OPTICAL_DOMAIN.test(title) &&
      !OFF_DOMAIN_CONTEXT.test(title) &&
      !NON_COMPLIANT_TITLE.test(title) &&
      !SHOP_BRANCH_ENDING.test(title.trim())
  );
  // 필터가 너무 얇게 남기면(데이터 빈약) 도메인만이라도 지키며 폴백해 어휘 커버리지를 확보한다.
  const pool =
    clean.length >= Math.min(20, titles.length)
      ? clean
      : titles.filter((title) => OPTICAL_DOMAIN.test(title));
  const complete = pool.filter((title) => PAYLOAD_ENDING.test(title.trim()));
  const rest = pool.filter((title) => !PAYLOAD_ENDING.test(title.trim()));
  return [...complete, ...rest].slice(0, limit);
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
    return refineCorpusTitles(cached.titles, limit);
  }

  if (!hasNaverCredentials()) {
    return refineCorpusTitles(cached?.titles ?? [], limit);
  }

  const titles = await harvestCategoryTitles(seedQueries);
  if (titles.length === 0) {
    return refineCorpusTitles(cached?.titles ?? [], limit);
  }

  await saveCorpusFile({
    ...file,
    categories: {
      ...file.categories,
      [categoryId]: { harvestedAt: new Date().toISOString(), titles },
    },
  });
  return refineCorpusTitles(titles, limit);
}
