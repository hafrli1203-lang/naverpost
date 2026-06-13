import { getShops } from "@/lib/data/shops";

/**
 * 기발행 글 백필 (설계: docs/designs/blogops-backfill.md)
 * 매장 RSS의 발행 글을 BlogOps posts에 등록한다. BlogOps가 (매장, 제목) 멱등이라
 * 재실행해도 중복이 생기지 않는다.
 */

const REQUEST_TIMEOUT_MS = 8_000;

export type ShopBackfillResult = {
  shopId: string;
  clientId?: string;
  found: number;
  registered: number;
  reason?: string;
};

function getBlogOpsBaseUrl(): string | null {
  const url = (process.env.BLOGOPS_API_URL ?? "").trim();
  return url.length > 0 ? url.replace(/\/$/, "") : null;
}

type RssPost = { title: string; link: string; publishedAt: string };

function parseRssPosts(xml: string): RssPost[] {
  const items = xml.split("<item>").slice(1);
  const posts: RssPost[] = [];
  for (const item of items) {
    const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]?.trim() ?? "";
    const link = item.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/)?.[1]?.trim() ?? "";
    const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? "";
    if (!title) continue;
    const parsed = pubDate ? new Date(pubDate) : null;
    const publishedAt =
      parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
    posts.push({ title, link, publishedAt });
  }
  return posts;
}

// "지역 안경점 | 키워드 문장" 형식이면 '|' 뒤가 생성기 제목(키워드 선행)이다.
function extractCoreTitle(title: string): string {
  const parts = title.split("|");
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

function guessMainKeyword(coreTitle: string): string {
  const words = coreTitle.split(/\s+/).filter(Boolean);
  return words.length >= 2 ? `${words[0]} ${words[1]}` : coreTitle;
}

async function fetchClientIdByBlogUrl(baseUrl: string, blogUrl: string): Promise<string | null> {
  const res = await fetch(`${baseUrl}/clients`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const clients = (await res.json()) as Array<{ id?: string; blog_url?: string }>;
  return clients.find((c) => c.blog_url === blogUrl)?.id ?? null;
}

async function backfillShop(
  baseUrl: string,
  shop: { id: string; blogId: string; rssUrl: string }
): Promise<ShopBackfillResult> {
  const clientId = await fetchClientIdByBlogUrl(
    baseUrl,
    `https://blog.naver.com/${shop.blogId}`
  );
  if (!clientId) {
    return { shopId: shop.id, found: 0, registered: 0, reason: "BlogOps에 매장 미등록" };
  }

  let xml: string;
  try {
    const res = await fetch(shop.rssUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`RSS ${res.status}`);
    xml = await res.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : "RSS 조회 실패";
    return { shopId: shop.id, clientId, found: 0, registered: 0, reason: message };
  }

  const posts = parseRssPosts(xml);
  let registered = 0;
  for (const post of posts) {
    const core = extractCoreTitle(post.title);
    try {
      const res = await fetch(`${baseUrl}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          title: post.title,
          url: post.link,
          published_at: post.publishedAt,
          category: "발행글(RSS)",
          main_keyword: guessMainKeyword(core),
          sub_keywords: [],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) registered += 1;
    } catch {
      // 항목 단위 실패는 건너뛰고 집계만 남긴다.
    }
  }

  return { shopId: shop.id, clientId, found: posts.length, registered };
}

export async function backfillPublishedPosts(
  shopIds?: string[]
): Promise<{ enabled: boolean; results: ShopBackfillResult[] }> {
  const baseUrl = getBlogOpsBaseUrl();
  if (!baseUrl) return { enabled: false, results: [] };

  const shops = await getShops();
  const targets = shopIds?.length ? shops.filter((s) => shopIds.includes(s.id)) : shops;

  const results: ShopBackfillResult[] = [];
  for (const shop of targets) {
    try {
      results.push(await backfillShop(baseUrl, shop));
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      results.push({ shopId: shop.id, found: 0, registered: 0, reason: message });
    }
  }
  return { enabled: true, results };
}
