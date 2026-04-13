import { extractCompetitorNouns } from "@/lib/nlp/nounExtractor";

export interface CompetitorMorphologyResult {
  status: "available" | "unavailable";
  reason?: string;
  sampleSize: number;
  commonNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
  titleNouns: Array<{ noun: string; occurrences: number }>;
}

interface BlogItem {
  title: string;
  description: string;
  link: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

async function fetchTopBlogs(keyword: string): Promise<BlogItem[]> {
  const clientId = (process.env.NAVER_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.NAVER_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return [];

  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "10");
  url.searchParams.set("sort", "sim");

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!response.ok) return [];

  const json = (await response.json()) as {
    items?: Array<{ title?: string; description?: string; link?: string }>;
  };

  return (json.items ?? []).map((item) => ({
    title: stripHtml(item.title ?? ""),
    description: stripHtml(item.description ?? ""),
    link: item.link ?? "",
  }));
}

export async function analyzeCompetitorMorphology(
  keyword: string
): Promise<CompetitorMorphologyResult> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      status: "unavailable",
      reason: "ANTHROPIC_API_KEY 미설정",
      sampleSize: 0,
      commonNouns: [],
      titleNouns: [],
    };
  }

  let blogs: BlogItem[];
  try {
    blogs = await fetchTopBlogs(keyword);
  } catch {
    return {
      status: "unavailable",
      reason: "네이버 블로그 검색 호출 실패",
      sampleSize: 0,
      commonNouns: [],
      titleNouns: [],
    };
  }

  if (blogs.length === 0) {
    return {
      status: "unavailable",
      reason: "상위 노출 블로그를 찾지 못했습니다.",
      sampleSize: 0,
      commonNouns: [],
      titleNouns: [],
    };
  }

  try {
    const { titleNouns, commonNouns } = await extractCompetitorNouns(
      blogs.map((blog) => ({ title: blog.title, description: blog.description }))
    );

    if (titleNouns.length === 0 && commonNouns.length === 0) {
      return {
        status: "unavailable",
        reason: "명사 추출 결과가 비어 있습니다.",
        sampleSize: blogs.length,
        commonNouns: [],
        titleNouns: [],
      };
    }

    return {
      status: "available",
      sampleSize: blogs.length,
      commonNouns: commonNouns.slice(0, 20),
      titleNouns: titleNouns.slice(0, 15),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "Claude 명사 추출 호출 실패",
      sampleSize: blogs.length,
      commonNouns: [],
      titleNouns: [],
    };
  }
}
