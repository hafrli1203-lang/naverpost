import type {
  ExposureSignal,
  ExternalSearchSignals,
  RelatedKeywordSignal,
  SearchVolumeSignal,
} from "@/types";

function unavailableSignals(reason: string): ExternalSearchSignals {
  return {
    status: "unavailable",
    provider: "naver-search-placeholder",
    notes: [reason],
  };
}

function uniqueTokens(source: string): string[] {
  return Array.from(
    new Set(
      (source.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) => token.trim())
    )
  ).slice(0, 8);
}

function buildPlaceholderRelatedKeywords(tokens: string[]): RelatedKeywordSignal[] {
  return tokens.map((keyword) => ({
    keyword,
    relationType: "unknown",
    source: "manual-input",
  }));
}

function buildPlaceholderVolumes(tokens: string[]): SearchVolumeSignal[] {
  return tokens.map((keyword) => ({
    keyword,
    trend: "unknown",
    rawValue: null,
    source: "manual-input",
  }));
}

function buildPlaceholderExposure(): ExposureSignal[] {
  return [
    {
      area: "integrated",
      rank: null,
      competitionLabel: "unknown",
      source: "manual-input",
    },
  ];
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
    "X-Naver-Client-Secret": normalizeNaverCredential(
      process.env.NAVER_CLIENT_SECRET
    ),
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
      "X-Naver-Client-Secret": normalizeNaverCredential(
        process.env.NAVER_CLIENT_SECRET
      ),
    },
  });

  if (!response.ok) {
    throw new Error(`Naver blog search failed: ${response.status}`);
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
  const avg = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const diff = avg(secondHalf) - avg(firstHalf);

  if (diff >= 8) return "rising";
  if (diff <= -8) return "falling";
  return "steady";
}

async function fetchSearchTrend(
  keywords: string[]
): Promise<SearchVolumeSignal[]> {
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
    throw new Error(`Naver datalab search failed: ${response.status}`);
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
      competitionLabel:
        total >= 10000 ? "high" : total >= 1000 ? "medium" : "low",
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
    relationType: "unknown",
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
    return unavailableSignals(
      "네이버 검색 실데이터 연동 정보가 아직 설정되지 않아 외부 신호는 플레이스홀더 상태로 유지합니다."
    );
  }

  const tokens = uniqueTokens(`${title} ${mainKeyword} ${subKeyword1} ${subKeyword2}`);

  try {
    const [blogSearch, searchVolume] = await Promise.all([
      fetchBlogSearch(mainKeyword),
      fetchSearchTrend(tokens.slice(0, 5)),
    ]);

    return {
      status: "available",
      provider: "naver-openapi",
      checkedAt: new Date().toISOString(),
      searchVolume:
        searchVolume.length > 0 ? searchVolume : buildPlaceholderVolumes(tokens),
      relatedKeywords:
        blogSearch.items.length > 0
          ? buildRelatedFromBlogItems(title, blogSearch.items)
          : buildPlaceholderRelatedKeywords(tokens),
      exposures: buildExposureFromBlogSearch(blogSearch.total),
      notes: [
        "블로그 검색 API와 데이터랩 검색어 트렌드 API 기준으로 수집한 실제 신호입니다.",
        "자동완성, 스마트블록, 인기글, 통합검색 노출 영역 파서는 아직 연결되지 않았습니다.",
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "네이버 외부 신호 수집 중 알 수 없는 오류가 발생했습니다.";

    return {
      status: "unavailable",
      provider: "naver-openapi",
      checkedAt: new Date().toISOString(),
      searchVolume: buildPlaceholderVolumes(tokens),
      relatedKeywords: buildPlaceholderRelatedKeywords(tokens),
      exposures: buildPlaceholderExposure(),
      notes: [
        "네이버 외부 신호 호출을 시도했지만 실제 응답을 확보하지 못했습니다.",
        message,
      ],
    };
  }
}
