import { getShops } from "@/lib/data/shops";

/**
 * BlogOps 노출 측정 데이터를 키워드 생성에 반영하는 읽기 전용 조회.
 * 1차 활용: 자기잠식 가드 — 이미 검색 1~3위에 노출 중인 키워드는 같은 키워드로
 * 새 글을 만들지 않는다 (내 1위 글과 내 새 글이 경쟁하는 것을 방지).
 * BLOGOPS_API_URL 미설정·API 다운·미측정 시 빈 결과 (graceful, 생성 차단 없음).
 */

const REQUEST_TIMEOUT_MS = 4_000;
const CANNIBALIZATION_RANK_MAX = 3;

function getBlogOpsBaseUrl(): string | null {
  const url = (process.env.BLOGOPS_API_URL ?? "").trim();
  return url.length > 0 ? url.replace(/\/$/, "") : null;
}

export function normalizeExposureKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, "").toLowerCase();
}

/** shopId의 최근 측정에서 1~3위에 노출 중인 키워드(정규화 키) 집합. */
export async function getTopExposedKeywordKeys(shopId: string): Promise<Set<string>> {
  const baseUrl = getBlogOpsBaseUrl();
  if (!baseUrl) return new Set();

  try {
    const shops = await getShops();
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) return new Set();

    const clientsRes = await fetch(`${baseUrl}/clients`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!clientsRes.ok) return new Set();
    const clients = (await clientsRes.json()) as Array<{ id?: string; blog_url?: string }>;
    const clientId = clients.find(
      (c) => c.blog_url === `https://blog.naver.com/${shop.blogId}`
    )?.id;
    if (!clientId) return new Set();

    const runsRes = await fetch(`${baseUrl}/exposure-runs?client_id=${clientId}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!runsRes.ok) return new Set();
    const runs = (await runsRes.json()) as Array<{
      entries?: Array<{ keyword?: string; my_rank?: number | null }>;
    }>;
    const latest = runs[runs.length - 1];
    if (!latest?.entries) return new Set();

    return new Set(
      latest.entries
        .filter(
          (e) =>
            typeof e.my_rank === "number" &&
            e.my_rank >= 1 &&
            e.my_rank <= CANNIBALIZATION_RANK_MAX &&
            (e.keyword ?? "").trim().length > 0
        )
        .map((e) => normalizeExposureKeyword(e.keyword as string))
    );
  } catch {
    return new Set();
  }
}
