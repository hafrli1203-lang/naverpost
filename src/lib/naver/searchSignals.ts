import type {
  ExposureSignal,
  ExternalSearchSignals,
  RelatedKeywordSignal,
  SearchVolumeSignal,
} from "@/types";
import { generateRelatedKeywords } from "@/lib/nlp/nounExtractor";
import { createHmac } from "crypto";

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

async function fetchBlogSearch(keyword: string): Promise<{
  total: number;
  items: Array<{ title: string; description: string; link: string; bloggerlink: string }>;
}> {
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "10");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const response = await fetch(url, {
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

  const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
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
  url.searchParams.set("hintKeywords", uniqueKeywords.join(","));
  url.searchParams.set("showDetail", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: getSearchAdHeaders("GET", path),
  });

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

  const requested = new Map(
    uniqueKeywords.map((keyword) => [normalizeKeywordKey(keyword), keyword])
  );

  for (const item of json.keywordList ?? []) {
    const relKeyword = item.relKeyword ?? "";
    const matchedKeyword = requested.get(normalizeKeywordKey(relKeyword));
    if (!matchedKeyword) continue;

    const pc = parseSearchAdCount(item.monthlyPcQcCnt);
    const mobile = parseSearchAdCount(item.monthlyMobileQcCnt);
    const monthlyTotal =
      pc.value !== null || mobile.value !== null
        ? (pc.value ?? 0) + (mobile.value ?? 0)
        : null;

    resultMap.set(normalizeKeywordKey(matchedKeyword), {
      keyword: matchedKeyword,
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

export async function fetchKeywordDemandSignals(
  keywords: string[]
): Promise<SearchVolumeSignal[]> {
  const uniqueKeywords = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))
  );
  const merged = new Map<string, SearchVolumeSignal>();

  for (let i = 0; i < uniqueKeywords.length; i += 5) {
    const chunk = uniqueKeywords.slice(i, i + 5);
    const chunkMap = await fetchSearchAdKeywordStats(chunk);
    for (const [key, signal] of chunkMap.entries()) {
      merged.set(key, signal);
    }
  }

  return uniqueKeywords
    .map((keyword) => merged.get(normalizeKeywordKey(keyword)))
    .filter((signal): signal is SearchVolumeSignal => Boolean(signal));
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

  return keywords
    .map((keyword) => byKeyword.get(normalizeKeywordKey(keyword)))
    .filter((signal): signal is SearchVolumeSignal => Boolean(signal));
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

  const response = await fetch(url, {
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

  const [blogSearch, trendSignals, searchAdStats, autocompleteRelated] = await Promise.all([
    fetchBlogSearch(mainKeyword),
    fetchSearchTrend(tokens),
    fetchSearchAdKeywordStats(autocompleteSeeds),
    buildRelatedFromAutocomplete(autocompleteSeeds),
  ]);
  const searchVolume = mergeSearchTrendAndAdStats(
    trendSignals,
    searchAdStats,
    Array.from(new Set([...autocompleteSeeds, ...tokens]))
  );
  const exposures = buildExposureFromBlogSearch(blogSearch.total);

  if (searchVolume.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 검색량/트렌드 데이터를 확보하지 못해 키워드 분석을 진행할 수 없습니다."
    );
  }

  let relatedKeywords: RelatedKeywordSignal[] = autocompleteRelated;
  const notes: string[] = [
    searchAdStats.size > 0
      ? "네이버 블로그 검색 API, 데이터랩 검색어 트렌드 API, 검색광고 키워드 도구 API로 수집한 실데이터입니다."
      : "네이버 블로그 검색 API와 데이터랩 검색어 트렌드 API로 수집한 실데이터입니다.",
  ];

  if (hasWorkingSearchAdCredentials() && searchAdStats.size === 0) {
    notes.push("검색광고 키워드 도구에서 입력 키워드와 정확히 일치하는 월간 검색량을 찾지 못했습니다.");
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

  if (exposures.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 노출 경쟁 신호를 확보하지 못해 키워드 분석을 진행할 수 없습니다."
    );
  }

  return {
    status: "available",
    provider: searchVolume.some((signal) => signal.monthlyTotalSearches !== undefined)
      ? "naver-openapi+searchad"
      : "naver-openapi",
    checkedAt: new Date().toISOString(),
    searchVolume,
    relatedKeywords,
    exposures,
    notes,
  };
}
