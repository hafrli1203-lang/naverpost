import { getShops } from "@/lib/data/shops";

/**
 * BlogOps(blogoperator, 로컬 성과 측정 SaaS) 연동 클라이언트.
 * 설계: docs/designs/blogops-integration.md
 *
 * BLOGOPS_API_URL 미설정이면 연동 OFF. 모든 실패는 호출자에게 reason 문자열로
 * 돌려주고 절대 throw하지 않는다 (세션 저장 등 본 흐름을 막지 않기 위해).
 */

const REQUEST_TIMEOUT_MS = 4_000;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

type BlogOpsClient = { id: string; blog_url: string };

let clientCache: { fetchedAt: number; clients: BlogOpsClient[] } | null = null;

function getBlogOpsBaseUrl(): string | null {
  const url = (process.env.BLOGOPS_API_URL ?? "").trim();
  return url.length > 0 ? url.replace(/\/$/, "") : null;
}

async function fetchBlogOpsClients(baseUrl: string): Promise<BlogOpsClient[]> {
  if (clientCache && Date.now() - clientCache.fetchedAt < CLIENT_CACHE_TTL_MS) {
    return clientCache.clients;
  }
  const res = await fetch(`${baseUrl}/clients`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /clients ${res.status}`);
  const json = (await res.json()) as Array<{ id?: string; blog_url?: string }>;
  const clients = json
    .map((c) => ({ id: c.id ?? "", blog_url: c.blog_url ?? "" }))
    .filter((c) => c.id && c.blog_url);
  clientCache = { fetchedAt: Date.now(), clients };
  return clients;
}

async function resolveClientId(baseUrl: string, shopName: string): Promise<string | null> {
  const shops = await getShops();
  const shop = shops.find((s) => s.name === shopName);
  if (!shop) return null;
  const blogUrl = `https://blog.naver.com/${shop.blogId}`;
  const clients = await fetchBlogOpsClients(baseUrl);
  return clients.find((c) => c.blog_url === blogUrl)?.id ?? null;
}

export type BlogOpsRegisterResult = {
  registered: boolean;
  reason?: string;
  postId?: string;
};

export async function registerPostToBlogOps(params: {
  shopName: string;
  category: string;
  title: string;
  mainKeyword: string;
  subKeywords: string[];
}): Promise<BlogOpsRegisterResult> {
  const baseUrl = getBlogOpsBaseUrl();
  if (!baseUrl) {
    return { registered: false, reason: "BLOGOPS_API_URL 미설정(연동 OFF)" };
  }

  try {
    const clientId = await resolveClientId(baseUrl, params.shopName);
    if (!clientId) {
      return {
        registered: false,
        reason: `BlogOps에 매장 미등록: ${params.shopName}`,
      };
    }

    const res = await fetch(`${baseUrl}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        title: params.title,
        category: params.category,
        main_keyword: params.mainKeyword,
        sub_keywords: params.subKeywords.filter(Boolean),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { registered: false, reason: `POST /posts ${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { registered: true, postId: json.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return { registered: false, reason: `BlogOps 연동 실패: ${message}` };
  }
}
