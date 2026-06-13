import { getShops } from "@/lib/data/shops";
import { fetchBlogSearch } from "@/lib/naver/searchSignals";

/**
 * 키워드 노출 추적 (설계: docs/designs/exposure-tracking.md)
 *
 * BlogOps에 등록된 글의 메인 키워드로 네이버 블로그 검색을 돌려
 * 내 블로그의 노출 순위를 측정하고 BlogOps exposure-runs에 적재한다.
 */

const REQUEST_TIMEOUT_MS = 6_000;
const SEARCH_DISPLAY = 30;
const MAX_KEYWORDS_PER_SHOP = 20;
const KEYWORD_DELAY_MS = 150;

type BlogOpsPost = { client_id: string; main_keyword: string };
type ExposureEntry = { keyword: string; my_rank: number | null };

export type ShopExposureResult = {
  shopId: string;
  clientId?: string;
  measured: number;
  ranked: number;
  reason?: string;
};

function getBlogOpsBaseUrl(): string | null {
  const url = (process.env.BLOGOPS_API_URL ?? "").trim();
  return url.length > 0 ? url.replace(/\/$/, "") : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchClientIdByBlogUrl(
  baseUrl: string,
  blogUrl: string
): Promise<string | null> {
  const res = await fetch(`${baseUrl}/clients`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const clients = (await res.json()) as Array<{ id?: string; blog_url?: string }>;
  return clients.find((c) => c.blog_url === blogUrl)?.id ?? null;
}

async function fetchTrackedKeywords(baseUrl: string, clientId: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/posts`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const posts = (await res.json()) as BlogOpsPost[];
  const keywords = posts
    .filter((p) => p.client_id === clientId)
    .map((p) => p.main_keyword.trim())
    .filter(Boolean);
  return [...new Set(keywords)].slice(0, MAX_KEYWORDS_PER_SHOP);
}

/** 검색 결과에서 내 블로그(blog.naver.com/{blogId})의 1-base 순위를 찾는다. */
function findMyRank(
  items: Array<{ link: string; bloggerlink: string }>,
  blogId: string
): number | null {
  const needle = `blog.naver.com/${blogId}`.toLowerCase();
  const index = items.findIndex(
    (item) =>
      item.link.toLowerCase().includes(needle) ||
      item.bloggerlink.toLowerCase().includes(needle)
  );
  return index >= 0 ? index + 1 : null;
}

async function measureEntries(keywords: string[], blogId: string): Promise<ExposureEntry[]> {
  const entries: ExposureEntry[] = [];
  for (const keyword of keywords) {
    try {
      const { items } = await fetchBlogSearch(keyword, SEARCH_DISPLAY);
      entries.push({ keyword, my_rank: findMyRank(items, blogId) });
    } catch {
      // 단일 키워드 검색 실패는 미노출(null)로 기록하고 계속한다.
      entries.push({ keyword, my_rank: null });
    }
    await sleep(KEYWORD_DELAY_MS);
  }
  return entries;
}

async function trackShop(
  baseUrl: string,
  shop: { id: string; blogId: string }
): Promise<ShopExposureResult> {
  const blogUrl = `https://blog.naver.com/${shop.blogId}`;
  const clientId = await fetchClientIdByBlogUrl(baseUrl, blogUrl);
  if (!clientId) {
    return { shopId: shop.id, measured: 0, ranked: 0, reason: "BlogOps에 매장 미등록" };
  }

  const keywords = await fetchTrackedKeywords(baseUrl, clientId);
  if (keywords.length === 0) {
    return { shopId: shop.id, clientId, measured: 0, ranked: 0, reason: "추적할 글 없음" };
  }

  const entries = await measureEntries(keywords, shop.blogId);

  const res = await fetch(`${baseUrl}/exposure-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      ran_at: new Date().toISOString(),
      entries,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      shopId: shop.id,
      clientId,
      measured: entries.length,
      ranked: entries.filter((e) => e.my_rank !== null).length,
      reason: `노출 기록 저장 실패 (${res.status})`,
    };
  }

  return {
    shopId: shop.id,
    clientId,
    measured: entries.length,
    ranked: entries.filter((e) => e.my_rank !== null).length,
  };
}

/** shopIds 미지정 시 전체 매장. 매장 단위로 실패를 격리한다. */
export async function trackExposureForShops(
  shopIds?: string[]
): Promise<{ enabled: boolean; results: ShopExposureResult[] }> {
  const baseUrl = getBlogOpsBaseUrl();
  if (!baseUrl) {
    return { enabled: false, results: [] };
  }

  const shops = await getShops();
  const targets = shopIds?.length
    ? shops.filter((s) => shopIds.includes(s.id))
    : shops;

  const results: ShopExposureResult[] = [];
  for (const shop of targets) {
    try {
      results.push(await trackShop(baseUrl, shop));
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      results.push({ shopId: shop.id, measured: 0, ranked: 0, reason: message });
    }
  }
  return { enabled: true, results };
}
