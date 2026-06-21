import type {
  ExposureSignal,
  ExternalSearchSignals,
  RelatedKeywordSignal,
  SearchVolumeSignal,
} from "@/types";
import { generateRelatedKeywords } from "@/lib/nlp/nounExtractor";
import { enrichOpportunitySignal } from "@/lib/keywords/opportunityScoring";
import { createHmac } from "crypto";
import fs from "fs/promises";
import path from "path";

const NAVER_FETCH_TIMEOUT_MS = 8_000;
const NAVER_SEARCHAD_TIMEOUT_MS = 18_000;
const KEYWORD_SIGNAL_CACHE_FILE = path.join(process.cwd(), "data", "keyword-signal-cache.json");
const KEYWORD_SIGNAL_CACHE_VERSION = 1;
const SEARCHAD_CHUNK_SIZE = 5;
// 후보 메인 키워드 전부가 실검색량 조회를 받아야 볼륨 게이트가 의미가 있다.
// (35로는 LLM 후보 상당수가 미조회 상태로 남아 unknown 통과했다.) 월간 캐시가
// 쌓이면 신규 조회 수는 빠르게 줄어든다. 필요 시 환경변수로 조정.
const SEARCHAD_MAX_FRESH_KEYWORDS_PER_RUN = Math.max(
  10,
  Math.min(120, Number(process.env.KEYWORD_SEARCHAD_MAX_FRESH) || 80)
);
const SEARCHAD_CHUNK_DELAY_MS = 1_250;
const SEARCHAD_RATE_LIMIT_RETRY_DELAY_MS = 5_000;
const SEARCHAD_MAX_RETRIES = 1;
const BLOG_COUNT_FETCH_DELAY_MS = 180;
const BLOG_COUNT_MAX_FRESH_KEYWORDS_PER_RUN = 45;

type KeywordSignalCacheEntry = {
  checkedAt: string;
  signal: SearchVolumeSignal;
};

type KeywordSignalCacheFile = {
  version: number;
  months: Record<string, Record<string, KeywordSignalCacheEntry>>;
};

let keywordSignalCache: KeywordSignalCacheFile | null = null;

export class NaverSearchDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverSearchDependencyError";
  }
}

function uniqueTokens(source: string): string[] {
  return Array.from(
    new Set((source.match(/[A-Za-z0-9\u3131-\u318E\uAC00-\uD7A3]{2,}/g) ?? []).map((token) => token.trim()))
  ).slice(0, 8);
}

function normalizeNaverCredential(value: string | undefined): string {
  return (value ?? "").trim();
}

function getKeywordSignalCacheMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function emptyKeywordSignalCache(): KeywordSignalCacheFile {
  return {
    version: KEYWORD_SIGNAL_CACHE_VERSION,
    months: {},
  };
}

async function readKeywordSignalCache(): Promise<KeywordSignalCacheFile> {
  if (keywordSignalCache) return keywordSignalCache;

  try {
    const raw = await fs.readFile(KEYWORD_SIGNAL_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as KeywordSignalCacheFile;
    keywordSignalCache =
      parsed && parsed.version === KEYWORD_SIGNAL_CACHE_VERSION && parsed.months
        ? parsed
        : emptyKeywordSignalCache();
  } catch {
    keywordSignalCache = emptyKeywordSignalCache();
  }

  return keywordSignalCache;
}

async function writeKeywordSignalCache(cache: KeywordSignalCacheFile): Promise<void> {
  keywordSignalCache = cache;
  await fs.mkdir(path.dirname(KEYWORD_SIGNAL_CACHE_FILE), { recursive: true });
  await fs.writeFile(
    KEYWORD_SIGNAL_CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf-8"
  );
}

async function getCachedMonthlySignals(
  keywords: string[],
  month = getKeywordSignalCacheMonth()
): Promise<Map<string, SearchVolumeSignal>> {
  const cache = await readKeywordSignalCache();
  const monthCache = cache.months[month] ?? {};
  const result = new Map<string, SearchVolumeSignal>();
  for (const keyword of keywords) {
    const key = normalizeKeywordKey(keyword);
    const cached = monthCache[key]?.signal;
    if (cached) result.set(key, cached);
  }
  return result;
}

async function saveMonthlySignals(
  signals: SearchVolumeSignal[],
  month = getKeywordSignalCacheMonth()
): Promise<void> {
  if (signals.length === 0) return;
  const cache = await readKeywordSignalCache();
  const monthCache = cache.months[month] ?? {};
  const checkedAt = new Date().toISOString();

  for (const signal of signals) {
    const key = normalizeKeywordKey(signal.keyword);
    if (!key) continue;
    monthCache[key] = {
      checkedAt,
      signal,
    };
  }

  cache.months[month] = monthCache;
  await writeKeywordSignalCache(cache);
}

function isSearchAdRateLimitError(error: unknown): boolean {
  return error instanceof Error && /\b429\b|Too Many Requests/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasWorkingCredentials(): boolean {
  const clientId = normalizeNaverCredential(process.env.NAVER_CLIENT_ID);
  const clientSecret = normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET);
  return (
    clientId.length > 0 &&
    clientSecret.length > 0 &&
    clientId !== "your_client_id" &&
    clientSecret !== "your_client_secret"
  );
}

function hasWorkingSearchAdCredentials(): boolean {
  const apiKey = normalizeNaverCredential(process.env.NAVER_SEARCHAD_API_KEY);
  const secretKey = normalizeNaverCredential(process.env.NAVER_SEARCHAD_SECRET_KEY);
  const customerId = normalizeNaverCredential(process.env.NAVER_SEARCHAD_CUSTOMER_ID);

  return (
    apiKey.length > 0 &&
    secretKey.length > 0 &&
    customerId.length > 0 &&
    !apiKey.startsWith("your_") &&
    !secretKey.startsWith("your_") &&
    !customerId.startsWith("your_")
  );
}

function getHeaders(): HeadersInit {
  return {
    "X-Naver-Client-Id": normalizeNaverCredential(process.env.NAVER_CLIENT_ID),
    "X-Naver-Client-Secret": normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET),
    "Content-Type": "application/json",
  };
}

function buildSearchAdSignature(params: {
  timestamp: string;
  method: string;
  path: string;
}): string {
  const secretKey = normalizeNaverCredential(process.env.NAVER_SEARCHAD_SECRET_KEY);
  const message = `${params.timestamp}.${params.method}.${params.path}`;
  return createHmac("sha256", secretKey).update(message).digest("base64");
}

function getSearchAdHeaders(method: string, path: string): HeadersInit {
  const timestamp = Date.now().toString();
  return {
    "X-Timestamp": timestamp,
    "X-API-KEY": normalizeNaverCredential(process.env.NAVER_SEARCHAD_API_KEY),
    "X-Customer": normalizeNaverCredential(process.env.NAVER_SEARCHAD_CUSTOMER_ID),
    "X-Signature": buildSearchAdSignature({ timestamp, method, path }),
  };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = NAVER_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCompetitorTitles(
  seeds: string[],
  maxSeeds = 4
): Promise<string[]> {
  if (!hasWorkingCredentials()) return [];

  const collected = new Map<string, string>();
  for (const seed of seeds.slice(0, maxSeeds)) {
    if (!seed.trim()) continue;
    try {
      const { items } = await fetchBlogSearch(seed);
      for (const item of items) {
        const title = item.title.trim();
        if (!title) continue;
        const normalized = title.replace(/\s+/g, " ").toLowerCase();
        if (!collected.has(normalized)) {
          collected.set(normalized, title);
        }
        if (collected.size >= 40) break;
      }
    } catch {
      // single-seed failure should not block competitor fetch
    }
    if (collected.size >= 40) break;
  }

  return Array.from(collected.values());
}

// 노출 추적(blogops/exposure)이 순위 판별에 link/bloggerlink를 쓰므로 export.
// display 기본 10은 기존 호출(경쟁 제목·문서수) 동작을 그대로 유지한다.
export async function fetchBlogSearch(keyword: string, display = 10): Promise<{
  total: number;
  items: Array<{ title: string; description: string; link: string; bloggerlink: string }>;
}> {
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", String(Math.max(1, Math.min(100, display))));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "X-Naver-Client-Id": normalizeNaverCredential(process.env.NAVER_CLIENT_ID),
      "X-Naver-Client-Secret": normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET),
    },
  });

  if (!response.ok) {
    throw new NaverSearchDependencyError(`네이버 블로그 검색 API 호출에 실패했습니다. (${response.status})`);
  }

  const json = (await response.json()) as {
    total?: number;
    items?: Array<{
      title?: string;
      description?: string;
      link?: string;
      bloggerlink?: string;
    }>;
  };

  return {
    total: json.total ?? 0,
    items: (json.items ?? []).map((item) => ({
      title: stripHtml(item.title ?? ""),
      description: stripHtml(item.description ?? ""),
      link: item.link ?? "",
      bloggerlink: item.bloggerlink ?? "",
    })),
  };
}

function buildTrendLabel(ratios: number[]): "rising" | "steady" | "falling" | "unknown" {
  if (ratios.length < 4) return "unknown";
  const midpoint = Math.floor(ratios.length / 2);
  const firstHalf = ratios.slice(0, midpoint);
  const secondHalf = ratios.slice(midpoint);
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const diff = average(secondHalf) - average(firstHalf);

  if (diff >= 8) return "rising";
  if (diff <= -8) return "falling";
  return "steady";
}

async function fetchSearchTrend(keywords: string[]): Promise<SearchVolumeSignal[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const body = {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    timeUnit: "date",
    keywordGroups: keywords.map((keyword) => ({
      groupName: keyword,
      keywords: [keyword],
    })),
  };

  const response = await fetchWithTimeout("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new NaverSearchDependencyError(`네이버 데이터랩 API 호출에 실패했습니다. (${response.status})`);
  }

  const json = (await response.json()) as {
    results?: Array<{
      title?: string;
      data?: Array<{ ratio?: number }>;
    }>;
  };

  return (json.results ?? []).map((result) => {
    const ratios = (result.data ?? [])
      .map((item) => item.ratio ?? 0)
      .filter((value) => typeof value === "number");
    const latestRatio = ratios.length > 0 ? ratios[ratios.length - 1] : null;

    return {
      keyword: result.title ?? "",
      trend: buildTrendLabel(ratios),
      rawValue: latestRatio,
      source: "naver-search",
    };
  });
}

export interface MonthlySeasonality {
  keyword: string;
  /** 달력 월(1~12)로 정렬된 데이터랩 상대 비율(0~100). 데이터 없는 달은 0. */
  monthlyRatios: number[];
}

/**
 * 데이터랩 12개월 시즌 곡선 조회 (설계: seasonal-series-planner.md 갭1).
 * 기존 fetchSearchTrend와 같은 API/인증을 쓰되 시간 창을 ~13개월·timeUnit=month로 바꿔
 * "어느 달에 검색이 뜨는지"를 달력 월(1~12) 배열로 정렬해 돌려준다(읽기 전용).
 * 자격증명 없으면 빈 배열(graceful OFF). 실패는 NaverSearchDependencyError.
 */
export async function fetchMonthlySeasonality(
  keywords: string[]
): Promise<MonthlySeasonality[]> {
  const unique = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean)));
  if (unique.length === 0 || !hasWorkingCredentials()) return [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 12);

  const body = {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    timeUnit: "month",
    keywordGroups: unique.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
  };

  const response = await fetchWithTimeout("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new NaverSearchDependencyError(`네이버 데이터랩 API 호출에 실패했습니다. (${response.status})`);
  }

  const json = (await response.json()) as {
    results?: Array<{
      title?: string;
      data?: Array<{ period?: string; ratio?: number }>;
    }>;
  };

  return (json.results ?? []).map((result) => {
    // period(yyyy-mm-dd)에서 달력 월(1~12)을 뽑아 정렬. 같은 달이 둘이면 최신값으로 덮는다.
    const monthlyRatios = new Array<number>(12).fill(0);
    for (const point of result.data ?? []) {
      const month = Number((point.period ?? "").slice(5, 7));
      if (month >= 1 && month <= 12) {
        monthlyRatios[month - 1] = typeof point.ratio === "number" ? point.ratio : 0;
      }
    }
    return { keyword: result.title ?? "", monthlyRatios };
  });
}

function normalizeKeywordKey(keyword: string): string {
  return keyword.replace(/\s+/g, "").trim().toLowerCase();
}

function parseSearchAdCount(value: string | number | undefined): {
  value: number | null;
  label?: string;
} {
  if (typeof value === "number") {
    return { value };
  }
  if (!value) {
    return { value: null };
  }

  const label = String(value);
  const numeric = Number(label.replace(/[^0-9.]/g, ""));
  return {
    value: Number.isFinite(numeric) ? numeric : null,
    label,
  };
}

async function fetchSearchAdKeywordStats(
  keywords: string[]
): Promise<Map<string, SearchVolumeSignal>> {
  const uniqueKeywords = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))
  );

  const resultMap = new Map<string, SearchVolumeSignal>();
  if (uniqueKeywords.length === 0 || !hasWorkingSearchAdCredentials()) {
    return resultMap;
  }

  const path = "/keywordstool";
  const url = new URL(`https://api.searchad.naver.com${path}`);
  const hintKeywords = Array.from(
    new Set(uniqueKeywords.map((keyword) => keyword.replace(/\s+/g, "")).filter(Boolean))
  );
  if (hintKeywords.length === 0) return resultMap;
  url.searchParams.set("hintKeywords", hintKeywords.join(","));
  url.searchParams.set("showDetail", "1");

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: getSearchAdHeaders("GET", path),
    },
    NAVER_SEARCHAD_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new NaverSearchDependencyError(
      `네이버 검색광고 키워드 도구 API 호출에 실패했습니다. (${response.status})`
    );
  }

  const json = (await response.json()) as {
    keywordList?: Array<{
      relKeyword?: string;
      monthlyPcQcCnt?: string | number;
      monthlyMobileQcCnt?: string | number;
      monthlyAvePcCtr?: string | number;
      monthlyAveMobileCtr?: string | number;
      compIdx?: string;
    }>;
  };

  for (const item of json.keywordList ?? []) {
    const relKeyword = item.relKeyword ?? "";
    if (!relKeyword.trim()) continue;

    const pc = parseSearchAdCount(item.monthlyPcQcCnt);
    const mobile = parseSearchAdCount(item.monthlyMobileQcCnt);
    const monthlyTotal =
      pc.value !== null || mobile.value !== null
        ? (pc.value ?? 0) + (mobile.value ?? 0)
        : null;

    resultMap.set(normalizeKeywordKey(relKeyword), {
      keyword: relKeyword.trim(),
      monthlyPcSearches: pc.value,
      monthlyMobileSearches: mobile.value,
      monthlyTotalSearches: monthlyTotal,
      monthlyPcSearchesLabel: pc.label,
      monthlyMobileSearchesLabel: mobile.label,
      competitionLabel: item.compIdx,
      monthlyAveragePcCtr:
        typeof item.monthlyAvePcCtr === "number"
          ? item.monthlyAvePcCtr
          : Number(item.monthlyAvePcCtr) || null,
      monthlyAverageMobileCtr:
        typeof item.monthlyAveMobileCtr === "number"
          ? item.monthlyAveMobileCtr
          : Number(item.monthlyAveMobileCtr) || null,
      source: "naver-search",
    });
  }

  return resultMap;
}

async function fetchSearchAdKeywordStatsWithRetry(
  keywords: string[]
): Promise<Map<string, SearchVolumeSignal>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SEARCHAD_MAX_RETRIES; attempt += 1) {
    try {
      return await fetchSearchAdKeywordStats(keywords);
    } catch (error) {
      lastError = error;
      if (!isSearchAdRateLimitError(error) || attempt >= SEARCHAD_MAX_RETRIES) {
        throw error;
      }
      await sleep(SEARCHAD_RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new NaverSearchDependencyError("네이버 검색광고 키워드 도구 API 호출에 실패했습니다.");
}

function sortDemandSignalsForRequestedKeywords(
  merged: Map<string, SearchVolumeSignal>,
  uniqueKeywords: string[]
): SearchVolumeSignal[] {
  const requestedKeys = new Set(uniqueKeywords.map(normalizeKeywordKey));
  const requestedSignals = uniqueKeywords
    .map((keyword) => merged.get(normalizeKeywordKey(keyword)))
    .filter((signal): signal is SearchVolumeSignal => Boolean(signal));
  const requestedSignalKeys = new Set(
    requestedSignals.map((signal) => normalizeKeywordKey(signal.keyword))
  );
  const relatedSignals = Array.from(merged.values())
    .filter((signal) => !requestedKeys.has(normalizeKeywordKey(signal.keyword)))
    .filter((signal) => !requestedSignalKeys.has(normalizeKeywordKey(signal.keyword)))
    .sort((a, b) => (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0))
    .slice(0, Math.max(0, 120 - requestedSignals.length));

  return [...requestedSignals, ...relatedSignals];
}

export async function fetchKeywordDemandSignals(
  keywords: string[]
): Promise<SearchVolumeSignal[]> {
  const uniqueKeywords = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))
  );
  const merged = await getCachedMonthlySignals(uniqueKeywords);

  const missingKeywords = uniqueKeywords
    .filter((keyword) => !merged.has(normalizeKeywordKey(keyword)))
    .slice(0, SEARCHAD_MAX_FRESH_KEYWORDS_PER_RUN);

  if (!hasWorkingSearchAdCredentials() || missingKeywords.length === 0) {
    return sortDemandSignalsForRequestedKeywords(merged, uniqueKeywords);
  }

  for (let i = 0; i < missingKeywords.length; i += SEARCHAD_CHUNK_SIZE) {
    const chunk = missingKeywords.slice(i, i + SEARCHAD_CHUNK_SIZE);
    let chunkMap: Map<string, SearchVolumeSignal>;
    try {
      chunkMap = await fetchSearchAdKeywordStatsWithRetry(chunk);
    } catch (error) {
      if (isSearchAdRateLimitError(error)) break;
      break;
    }

    for (const [key, signal] of chunkMap.entries()) {
      merged.set(key, signal);
    }
    await saveMonthlySignals(Array.from(chunkMap.values()));

    if (i + SEARCHAD_CHUNK_SIZE < missingKeywords.length) {
      await sleep(SEARCHAD_CHUNK_DELAY_MS);
    }
  }

  return sortDemandSignalsForRequestedKeywords(merged, uniqueKeywords);
}

async function fetchSearchAdKeywordStatsFromMonthlyCache(
  keywords: string[]
): Promise<Map<string, SearchVolumeSignal>> {
  const signals = await fetchKeywordDemandSignals(keywords);
  const map = new Map<string, SearchVolumeSignal>();
  for (const signal of signals) {
    map.set(normalizeKeywordKey(signal.keyword), signal);
  }
  return map;
}

export async function fetchKeywordOpportunitySignals(
  keywords: string[]
): Promise<SearchVolumeSignal[]> {
  const uniqueKeywords = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))
  );
  if (uniqueKeywords.length === 0) return [];

  const demandSignals = await fetchKeywordDemandSignals(uniqueKeywords);
  const blogCountMap = new Map<string, number | null>();
  const missingBlogKeywords: string[] = [];

  for (const signal of demandSignals) {
    const key = normalizeKeywordKey(signal.keyword);
    if (typeof signal.blogDocumentCount === "number") {
      blogCountMap.set(key, signal.blogDocumentCount);
    } else {
      missingBlogKeywords.push(signal.keyword);
    }
  }

  const freshBlogKeywords = missingBlogKeywords.slice(0, BLOG_COUNT_MAX_FRESH_KEYWORDS_PER_RUN);
  for (let i = 0; i < freshBlogKeywords.length; i += 1) {
    const keyword = freshBlogKeywords[i];
    try {
      const blogSearch = await fetchBlogSearch(keyword);
      blogCountMap.set(normalizeKeywordKey(keyword), blogSearch.total);
    } catch {
      blogCountMap.set(normalizeKeywordKey(keyword), null);
    }
    if (i + 1 < freshBlogKeywords.length) {
      await sleep(BLOG_COUNT_FETCH_DELAY_MS);
    }
  }

  const enrichedSignals = demandSignals.map((signal) =>
    enrichOpportunitySignal({
      ...signal,
      blogDocumentCount:
        blogCountMap.get(normalizeKeywordKey(signal.keyword)) ??
        signal.blogDocumentCount ??
        null,
    })
  );
  await saveMonthlySignals(enrichedSignals);
  return enrichedSignals;
}

function mergeSearchTrendAndAdStats(
  trendSignals: SearchVolumeSignal[],
  adStats: Map<string, SearchVolumeSignal>,
  keywords: string[]
): SearchVolumeSignal[] {
  const byKeyword = new Map<string, SearchVolumeSignal>();

  for (const signal of trendSignals) {
    byKeyword.set(normalizeKeywordKey(signal.keyword), signal);
  }

  for (const [key, adSignal] of adStats.entries()) {
    const trendSignal = byKeyword.get(key);
    byKeyword.set(key, {
      ...trendSignal,
      ...adSignal,
      trend: trendSignal?.trend,
      rawValue: trendSignal?.rawValue,
      source: "naver-search",
    });
  }

  const selected = keywords
    .map((keyword) => byKeyword.get(normalizeKeywordKey(keyword)))
    .filter((signal): signal is SearchVolumeSignal => Boolean(signal));
  const selectedKeys = new Set(selected.map((signal) => normalizeKeywordKey(signal.keyword)));
  const relatedAdSignals = Array.from(adStats.values())
    .filter((signal) => !selectedKeys.has(normalizeKeywordKey(signal.keyword)))
    .sort((a, b) => (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0))
    .slice(0, 8);

  return [...selected, ...relatedAdSignals];
}

function buildExposureFromBlogSearch(total: number): ExposureSignal[] {
  return [
    {
      area: "blog-tab",
      rank: null,
      competitionLabel: total >= 10000 ? "high" : total >= 1000 ? "medium" : "low",
      source: "naver-search",
    },
  ];
}

async function fetchAutocomplete(keyword: string): Promise<string[]> {
  const url = new URL("https://ac.search.naver.com/nx/ac");
  url.searchParams.set("q", keyword);
  url.searchParams.set("con", "0");
  url.searchParams.set("frm", "nv");
  url.searchParams.set("ans", "2");
  url.searchParams.set("r_format", "json");
  url.searchParams.set("r_enc", "UTF-8");
  url.searchParams.set("r_unicode", "0");
  url.searchParams.set("t_koreng", "1");
  url.searchParams.set("run", "2");
  url.searchParams.set("rev", "4");
  url.searchParams.set("q_enc", "UTF-8");
  url.searchParams.set("st", "100");

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Referer: "https://search.naver.com/",
    },
  });

  if (!response.ok) {
    throw new NaverSearchDependencyError(
      `네이버 자동완성 호출에 실패했습니다. (${response.status})`
    );
  }

  const json = (await response.json()) as {
    items?: Array<Array<Array<string | number> | string>>;
  };

  const suggestions = new Set<string>();
  const groups = json.items ?? [];
  for (const group of groups) {
    for (const entry of group) {
      const word = Array.isArray(entry) ? entry[0] : entry;
      if (typeof word === "string" && word.trim().length > 0) {
        suggestions.add(word.trim());
      }
    }
  }

  return Array.from(suggestions);
}

async function buildRelatedFromAutocomplete(
  seedKeywords: string[]
): Promise<RelatedKeywordSignal[]> {
  const seen = new Set<string>();
  const collected: RelatedKeywordSignal[] = [];
  const seedLower = new Set(seedKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean));

  for (const seed of seedKeywords) {
    if (!seed.trim()) continue;
    let suggestions: string[] = [];
    try {
      suggestions = await fetchAutocomplete(seed);
    } catch {
      continue;
    }
    for (const suggestion of suggestions) {
      const key = suggestion.toLowerCase();
      if (seen.has(key) || seedLower.has(key)) continue;
      seen.add(key);
      collected.push({
        keyword: suggestion,
        relationType: "autocomplete",
        source: "naver-search",
      });
      if (collected.length >= 15) return collected;
    }
  }

  return collected;
}

export async function getExternalSearchSignals(params: {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
}): Promise<ExternalSearchSignals> {
  const { title, mainKeyword, subKeyword1, subKeyword2 } = params;

  if (!hasWorkingCredentials()) {
    throw new NaverSearchDependencyError(
      "네이버 API 설정이 없어 실데이터 기반 키워드 분석을 진행할 수 없습니다."
    );
  }

  const tokens = uniqueTokens(`${title} ${mainKeyword} ${subKeyword1} ${subKeyword2}`).slice(0, 5);

  if (tokens.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 실데이터 조회에 사용할 키워드 토큰을 만들지 못했습니다."
    );
  }

  const autocompleteSeeds = Array.from(
    new Set(
      [mainKeyword, subKeyword1, subKeyword2]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

  const [blogSearchResult, trendResult, searchAdResult, autocompleteResult] =
    await Promise.allSettled([
      fetchBlogSearch(mainKeyword),
      fetchSearchTrend(tokens),
      fetchSearchAdKeywordStatsFromMonthlyCache(autocompleteSeeds),
      buildRelatedFromAutocomplete(autocompleteSeeds),
    ]);
  const blogSearch =
    blogSearchResult.status === "fulfilled"
      ? blogSearchResult.value
      : { total: 0, items: [] };
  const trendSignals = trendResult.status === "fulfilled" ? trendResult.value : [];
  const searchAdStats =
    searchAdResult.status === "fulfilled"
      ? searchAdResult.value
      : new Map<string, SearchVolumeSignal>();
  const autocompleteRelated =
    autocompleteResult.status === "fulfilled" ? autocompleteResult.value : [];
  const searchVolume = mergeSearchTrendAndAdStats(
    trendSignals,
    searchAdStats,
    Array.from(new Set([...autocompleteSeeds, ...tokens]))
  );
  const exposures = buildExposureFromBlogSearch(blogSearch.total);

  const searchVolumeWithOpportunity = searchVolume.map((signal) =>
    enrichOpportunitySignal({
      ...signal,
      blogDocumentCount:
        normalizeKeywordKey(signal.keyword) === normalizeKeywordKey(mainKeyword)
          ? blogSearch.total
          : signal.blogDocumentCount,
    })
  );

  let relatedKeywords: RelatedKeywordSignal[] = autocompleteRelated;
  const notes: string[] = [];

  if (blogSearchResult.status === "rejected") notes.push("네이버 블로그 검색 신호 수집에 실패했습니다.");
  if (trendResult.status === "rejected") notes.push("데이터랩 트렌드 신호 수집에 실패했습니다.");
  if (searchAdResult.status === "rejected") {
    const reason =
      searchAdResult.reason instanceof Error
        ? searchAdResult.reason.message
        : "알 수 없는 오류";
    notes.push(`검색광고 월간 검색량 수집에 실패했습니다: ${reason}`);
  }
  if (autocompleteResult.status === "rejected") notes.push("자동완성 연관어 수집에 실패했습니다.");

  notes.push(
    searchAdStats.size > 0
      ? "검색광고 키워드 도구의 월간 검색량과 네이버 블로그 문서수 신호를 후보 점수에 반영했습니다."
      : "검색광고 월간 검색량은 비어 있어 블로그/트렌드 보조 신호만 반영했습니다."
  );

  if (hasWorkingSearchAdCredentials() && searchAdStats.size === 0) {
    notes.push("검색광고 키워드 도구에서 월간 검색량을 찾지 못했습니다.");
  }

  if (relatedKeywords.length === 0) {
    try {
      const fallback = await generateRelatedKeywords(autocompleteSeeds, title);
      relatedKeywords = fallback.map((keyword) => ({
        keyword,
        relationType: "related-search",
        source: "claude-haiku",
      }));
      notes.push(
        "자동완성 신호를 확보하지 못해 Claude Haiku 추론 연관어로 보완했습니다."
      );
    } catch {
      notes.push("자동완성과 Haiku 보완 모두 실패하여 연관 검색 신호가 비어 있습니다.");
    }
  } else {
    notes.push("자동완성 엔드포인트로 연관 검색 신호를 수집했습니다.");
  }

  return {
    status: searchVolumeWithOpportunity.length > 0 || exposures.length > 0 ? "available" : "unavailable",
    provider: searchVolumeWithOpportunity.some((signal) => signal.monthlyTotalSearches !== undefined)
      ? "naver-openapi+searchad+opportunity"
      : "naver-openapi",
    checkedAt: new Date().toISOString(),
    searchVolume: searchVolumeWithOpportunity,
    relatedKeywords,
    exposures,
    notes,
  };
}
