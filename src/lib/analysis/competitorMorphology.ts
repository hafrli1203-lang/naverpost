import { extractCompetitorNouns } from "@/lib/nlp/nounExtractor";

export interface CompetitorMorphologyResult {
  status: "available" | "unavailable";
  reason?: string;
  sampleSize: number;
  bodySampleSize: number;
  commonNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
  titleNouns: Array<{ noun: string; occurrences: number }>;
  bodyNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
  bodyHighlights: string[];
  titleAngles: string[];
  contentBlocks: string[];
  cautionPoints: string[];
}

interface BlogItem {
  title: string;
  description: string;
  link: string;
}

const BODY_FETCH_LIMIT = 5;
const BODY_TEXT_LIMIT = 1200;

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeBlogLink(link: string): string {
  try {
    const url = new URL(link);
    if (url.hostname === "m.blog.naver.com") {
      return url.toString();
    }

    if (url.hostname === "blog.naver.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return `https://m.blog.naver.com/PostView.naver?blogId=${segments[0]}&logNo=${segments[1]}`;
      }
      const logNo = url.searchParams.get("logNo");
      const blogId = url.searchParams.get("blogId");
      if (blogId && logNo) {
        return `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
      }
    }

    return link;
  } catch {
    return link;
  }
}

function extractBodyCandidates(html: string): string[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const patterns = [
    /<div[^>]+class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]+class="[^"]*post_ct[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]+id="post-view\d*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]+class="[^"]*post-view[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
  ];

  const candidates: string[] = [];
  for (const pattern of patterns) {
    const matches = cleaned.matchAll(pattern);
    for (const match of matches) {
      const text = decodeHtmlEntities(stripHtml(match[1] ?? ""));
      if (text.length >= 160) {
        candidates.push(text);
      }
    }
  }

  const ogDescriptionMatch = cleaned.match(
    /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i
  );
  if (ogDescriptionMatch?.[1]) {
    candidates.push(decodeHtmlEntities(ogDescriptionMatch[1]));
  }

  return candidates;
}

function chooseBestBodyText(candidates: string[]): string {
  const best = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
  return best.slice(0, BODY_TEXT_LIMIT).trim();
}

function countMatches(texts: string[], pattern: RegExp): number {
  return texts.filter((text) => pattern.test(text)).length;
}

function analyzeExposurePatterns(blogs: Array<BlogItem & { body: string }>): {
  titleAngles: string[];
  contentBlocks: string[];
  cautionPoints: string[];
} {
  const titles = blogs.map((blog) => blog.title);
  const bodies = blogs.map((blog) => blog.body).filter((body) => body.trim().length > 0);
  const titleAngles: string[] = [];
  const contentBlocks: string[] = [];
  const cautionPoints: string[] = [];

  const guideTitleCount = countMatches(
    titles,
    /(방법|정리|가이드|팁|추천|코스|체크리스트|총정리)/i
  );
  const reviewTitleCount = countMatches(
    titles,
    /(후기|리뷰|방문|체험|솔직|내돈내산)/i
  );
  const comparisonTitleCount = countMatches(
    titles,
    /(비교|차이|추천|선택|장단점|vs)/i
  );
  const questionTitleCount = countMatches(
    titles,
    /(\?|왜|어떻게|무엇|될까|좋을까|맞을까)/i
  );

  if (guideTitleCount >= 3) {
    titleAngles.push("상위 제목은 방법·정리형 표현이 자주 보입니다.");
  }
  if (reviewTitleCount >= 3) {
    titleAngles.push("상위 제목은 후기·체험형 톤이 강합니다.");
  }
  if (comparisonTitleCount >= 3) {
    titleAngles.push("상위 제목은 비교·선택형 각도를 자주 씁니다.");
  }
  if (questionTitleCount >= 3) {
    titleAngles.push("상위 제목은 질문형 표현을 꽤 자주 사용합니다.");
  }

  const faqBodyCount = countMatches(bodies, /(faq|자주 묻는 질문|q\.)/i);
  const checklistBodyCount = countMatches(
    bodies,
    /(1\.|2\.|3\.|첫째|둘째|셋째|체크|순서|단계)/i
  );
  const trustBodyCount = countMatches(
    bodies,
    /(가격|비용|영업시간|운영시간|예약|위치|주소|주차|전화|문의)/i
  );
  const comparisonBodyCount = countMatches(
    bodies,
    /(비교|차이|장점|단점|추천 대상|선택 기준|구분)/i
  );
  const averageBodyLength = bodies.length
    ? Math.round(bodies.reduce((sum, body) => sum + body.length, 0) / bodies.length)
    : 0;

  if (checklistBodyCount >= 2) {
    contentBlocks.push("본문에 단계형 안내나 체크리스트 블록을 넣는 편이 유리합니다.");
  }
  if (trustBodyCount >= 2) {
    contentBlocks.push("가격·위치·운영 정보처럼 확인 가능한 실무 정보를 본문에 분명히 넣는 흐름이 많습니다.");
  }
  if (comparisonBodyCount >= 2) {
    contentBlocks.push("비교 문단이나 선택 기준 블록이 있으면 상위글 구조와 더 가까워집니다.");
  }
  if (faqBodyCount >= 2) {
    contentBlocks.push("FAQ처럼 자주 묻는 질문 블록이 반복적으로 등장합니다.");
  }

  if (averageBodyLength >= 900) {
    cautionPoints.push("상위글 본문 밀도가 높은 편이라 짧은 글보다 정보량 확보가 중요합니다.");
  }
  if (guideTitleCount === 0 && reviewTitleCount === 0 && comparisonTitleCount === 0) {
    cautionPoints.push("제목을 과하게 꾸미기보다 핵심 키워드를 바로 드러내는 편이 더 안전합니다.");
  }
  if (trustBodyCount === 0) {
    cautionPoints.push("추상적인 설명만 많아지면 경쟁력이 떨어질 수 있어 확인 가능한 정보가 필요합니다.");
  }

  return { titleAngles, contentBlocks, cautionPoints };
}

async function fetchBlogBody(link: string): Promise<string> {
  const url = normalizeBlogLink(link);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    return "";
  }

  const html = await response.text();
  return chooseBestBodyText(extractBodyCandidates(html));
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

  let blogs: BlogItem[];
  try {
    blogs = await fetchTopBlogs(keyword);
  } catch {
    return {
      status: "unavailable",
      reason: "Failed to fetch top Naver blogs.",
      sampleSize: 0,
      bodySampleSize: 0,
      commonNouns: [],
      titleNouns: [],
      bodyNouns: [],
      bodyHighlights: [],
      titleAngles: [],
      contentBlocks: [],
      cautionPoints: [],
    };
  }

  if (blogs.length === 0) {
    return {
      status: "unavailable",
      reason: "No top-ranking Naver blog samples were found.",
      sampleSize: 0,
      bodySampleSize: 0,
      commonNouns: [],
      titleNouns: [],
      bodyNouns: [],
      bodyHighlights: [],
      titleAngles: [],
      contentBlocks: [],
      cautionPoints: [],
    };
  }

  const blogsWithBodies = await Promise.all(
    blogs.slice(0, BODY_FETCH_LIMIT).map(async (blog) => ({
      ...blog,
      body: await fetchBlogBody(blog.link).catch(() => ""),
    }))
  );

  const bodySampleSize = blogsWithBodies.filter((blog) => blog.body.trim().length > 0).length;
  const samples = [
    ...blogsWithBodies,
    ...blogs.slice(BODY_FETCH_LIMIT).map((blog) => ({ ...blog, body: "" })),
  ];
  const exposurePatterns = analyzeExposurePatterns(samples);

  try {
    const { titleNouns, commonNouns, bodyNouns, bodyHighlights } = await extractCompetitorNouns(
      samples.map((blog) => ({
        title: blog.title,
        description: blog.description,
        body: blog.body,
      }))
    );

    if (
      titleNouns.length === 0 &&
      commonNouns.length === 0 &&
      bodyNouns.length === 0 &&
      bodyHighlights.length === 0
    ) {
      return {
        status: "unavailable",
        reason: "Competitor morphology analysis returned no usable signals.",
        sampleSize: blogs.length,
        bodySampleSize,
        commonNouns: [],
        titleNouns: [],
        bodyNouns: [],
        bodyHighlights: [],
        titleAngles: exposurePatterns.titleAngles,
        contentBlocks: exposurePatterns.contentBlocks,
        cautionPoints: exposurePatterns.cautionPoints,
      };
    }

    return {
      status: "available",
      sampleSize: blogs.length,
      bodySampleSize,
      commonNouns: commonNouns.slice(0, 20),
      titleNouns: titleNouns.slice(0, 15),
      bodyNouns: bodyNouns.slice(0, 20),
      bodyHighlights: bodyHighlights.slice(0, 5),
      titleAngles: exposurePatterns.titleAngles.slice(0, 4),
      contentBlocks: exposurePatterns.contentBlocks.slice(0, 4),
      cautionPoints: exposurePatterns.cautionPoints.slice(0, 3),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "Claude morphology analysis failed.",
      sampleSize: blogs.length,
      bodySampleSize,
      commonNouns: [],
      titleNouns: [],
      bodyNouns: [],
      bodyHighlights: [],
      titleAngles: exposurePatterns.titleAngles,
      contentBlocks: exposurePatterns.contentBlocks,
      cautionPoints: exposurePatterns.cautionPoints,
    };
  }
}
