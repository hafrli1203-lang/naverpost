import type {
  ExposureSignal,
  ExternalSearchSignals,
  RelatedKeywordSignal,
  SearchVolumeSignal,
} from "@/types";

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

function getHeaders(): HeadersInit {
  return {
    "X-Naver-Client-Id": normalizeNaverCredential(process.env.NAVER_CLIENT_ID),
    "X-Naver-Client-Secret": normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET),
    "Content-Type": "application/json",
  };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
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

function buildRelatedFromBlogItems(
  title: string,
  items: Array<{ title: string; description: string }>
): RelatedKeywordSignal[] {
  const seedTokens = new Set(uniqueTokens(title.toLowerCase()));
  const collected = new Set<string>();

  for (const item of items) {
    const tokens = uniqueTokens(`${item.title} ${item.description}`);
    for (const token of tokens) {
      if (!seedTokens.has(token.toLowerCase())) {
        collected.add(token);
      }
      if (collected.size >= 10) break;
    }
    if (collected.size >= 10) break;
  }

  return Array.from(collected).map((keyword) => ({
    keyword,
    relationType: "related-search",
    source: "naver-search",
  }));
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

  const [blogSearch, searchVolume] = await Promise.all([
    fetchBlogSearch(mainKeyword),
    fetchSearchTrend(tokens),
  ]);
  const relatedKeywords = buildRelatedFromBlogItems(title, blogSearch.items);
  const exposures = buildExposureFromBlogSearch(blogSearch.total);

  if (searchVolume.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 검색량/트렌드 데이터를 확보하지 못해 키워드 분석을 진행할 수 없습니다."
    );
  }

  if (relatedKeywords.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 연관 검색 신호를 확보하지 못해 키워드 분석을 진행할 수 없습니다."
    );
  }

  if (exposures.length === 0) {
    throw new NaverSearchDependencyError(
      "네이버 노출 경쟁 신호를 확보하지 못해 키워드 분석을 진행할 수 없습니다."
    );
  }

  return {
    status: "available",
    provider: "naver-openapi",
    checkedAt: new Date().toISOString(),
    searchVolume,
    relatedKeywords,
    exposures,
    notes: [
      "네이버 블로그 검색 API와 데이터랩 검색어 트렌드 API 기준으로 수집한 실데이터입니다.",
      "검색량, 연관 검색 신호, 노출 경쟁 신호를 모두 확보한 뒤에만 결과를 반환합니다.",
    ],
  };
}
