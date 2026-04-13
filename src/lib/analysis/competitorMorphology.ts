import { analyzeMorphemes, extractNouns, isEtriConfigured } from "@/lib/nlp/etri";

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
  if (!isEtriConfigured()) {
    return {
      status: "unavailable",
      reason: "ETRI API 키가 설정되지 않았습니다.",
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

  const titleNounCounts = new Map<string, number>();
  const bodyNounCounts = new Map<string, number>();
  const bodyBlogPresence = new Map<string, Set<number>>();

  const results = await Promise.allSettled(
    blogs.map(async (blog, index) => {
      const [titleMorphs, bodyMorphs] = await Promise.all([
        analyzeMorphemes(blog.title),
        analyzeMorphemes(blog.description),
      ]);
      return {
        index,
        titleNouns: extractNouns(titleMorphs),
        bodyNouns: extractNouns(bodyMorphs),
      };
    })
  );

  let successCount = 0;
  for (const outcome of results) {
    if (outcome.status !== "fulfilled") continue;
    successCount += 1;
    const { index, titleNouns, bodyNouns } = outcome.value;

    for (const noun of titleNouns) {
      titleNounCounts.set(noun, (titleNounCounts.get(noun) ?? 0) + 1);
    }
    for (const noun of bodyNouns) {
      bodyNounCounts.set(noun, (bodyNounCounts.get(noun) ?? 0) + 1);
      const presence = bodyBlogPresence.get(noun) ?? new Set<number>();
      presence.add(index);
      bodyBlogPresence.set(noun, presence);
    }
  }

  if (successCount === 0) {
    return {
      status: "unavailable",
      reason: "ETRI 분석 결과가 비어 있습니다.",
      sampleSize: 0,
      commonNouns: [],
      titleNouns: [],
    };
  }

  const commonNouns = Array.from(bodyNounCounts.entries())
    .map(([noun, occurrences]) => ({
      noun,
      occurrences,
      blogCount: bodyBlogPresence.get(noun)?.size ?? 0,
    }))
    .filter((entry) => entry.blogCount >= 2)
    .sort((a, b) => b.blogCount - a.blogCount || b.occurrences - a.occurrences)
    .slice(0, 20);

  const titleNouns = Array.from(titleNounCounts.entries())
    .map(([noun, occurrences]) => ({ noun, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 15);

  return {
    status: "available",
    sampleSize: successCount,
    commonNouns,
    titleNouns,
  };
}
