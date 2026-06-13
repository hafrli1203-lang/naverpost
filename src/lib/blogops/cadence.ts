import { getShops } from "@/lib/data/shops";

/**
 * 발행 일관성 트래커 (설계: docs/designs/posting-cadence-tracker.md)
 *
 * BlogOps GET /posts의 published_at으로 매장별 발행 주기를 계산한다. 읽기 전용이며
 * BlogOps 미설정/다운 시 graceful(빈 결과 + reason). 발행/세션/키워드 모듈 미변경.
 */

const REQUEST_TIMEOUT_MS = 4_000;
const RECOMMENDED_INTERVAL_DAYS = 3;
const MAX_INTERVAL_SAMPLES = 12;
const MAX_RECENT_DATES = 8;

export type ShopCadence = {
  shopId: string;
  shopName: string;
  totalPosts: number;
  lastPublishedAt: string | null;
  daysSinceLast: number | null;
  avgIntervalDays: number | null;
  recommendedIntervalDays: number;
  status: "good" | "slowing" | "stale" | "unknown";
  recentDates: string[];
};

export type CadenceReport = {
  shops: ShopCadence[];
  reason?: string;
};

function getBlogOpsBaseUrl(): string | null {
  const url = (process.env.BLOGOPS_API_URL ?? "").trim();
  return url.length > 0 ? url.replace(/\/$/, "") : null;
}

function parseYmd(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(utc) ? null : utc;
}

function daysBetween(laterMs: number, earlierMs: number): number {
  return Math.round((laterMs - earlierMs) / (24 * 60 * 60 * 1000));
}

function classify(daysSinceLast: number | null): ShopCadence["status"] {
  if (daysSinceLast === null) return "unknown";
  if (daysSinceLast <= RECOMMENDED_INTERVAL_DAYS * 1.5) return "good";
  if (daysSinceLast <= RECOMMENDED_INTERVAL_DAYS * 3) return "slowing";
  return "stale";
}

function computeShopCadence(
  shopId: string,
  shopName: string,
  publishedDates: string[]
): ShopCadence {
  // YYYY-MM-DD → ms, 유효 항목만, 내림차순(최신 우선) 정렬.
  const sortedMs = publishedDates
    .map(parseYmd)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => b - a);

  const base: ShopCadence = {
    shopId,
    shopName,
    totalPosts: publishedDates.length,
    lastPublishedAt: null,
    daysSinceLast: null,
    avgIntervalDays: null,
    recommendedIntervalDays: RECOMMENDED_INTERVAL_DAYS,
    status: "unknown",
    recentDates: [],
  };

  if (sortedMs.length === 0) return base;

  const todayUtc = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  const lastMs = sortedMs[0];
  const daysSinceLast = Math.max(0, daysBetween(todayUtc, lastMs));

  // 최근 MAX_INTERVAL_SAMPLES+1건으로 연속 간격 평균.
  const sample = sortedMs.slice(0, MAX_INTERVAL_SAMPLES + 1);
  let avgIntervalDays: number | null = null;
  if (sample.length >= 2) {
    let totalGap = 0;
    for (let i = 0; i < sample.length - 1; i += 1) {
      totalGap += daysBetween(sample[i], sample[i + 1]);
    }
    avgIntervalDays = Math.round((totalGap / (sample.length - 1)) * 10) / 10;
  }

  const recentDates = sortedMs.slice(0, MAX_RECENT_DATES).map((ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  });

  return {
    ...base,
    lastPublishedAt: recentDates[0],
    daysSinceLast,
    avgIntervalDays,
    status: classify(daysSinceLast),
    recentDates,
  };
}

export async function getCadenceReport(shopId?: string): Promise<CadenceReport> {
  const baseUrl = getBlogOpsBaseUrl();
  if (!baseUrl) {
    return { shops: [], reason: "BLOGOPS_API_URL 미설정(연동 OFF)" };
  }

  let clients: Array<{ id?: string; blog_url?: string }>;
  try {
    const clientsRes = await fetch(`${baseUrl}/clients`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!clientsRes.ok) {
      return { shops: [], reason: `GET /clients ${clientsRes.status}` };
    }
    clients = (await clientsRes.json()) as Array<{ id?: string; blog_url?: string }>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return { shops: [], reason: `BlogOps 연결 실패: ${message}` };
  }

  const allShops = await getShops();
  const targetShops = shopId ? allShops.filter((s) => s.id === shopId) : allShops;

  const results: ShopCadence[] = [];
  const failures: string[] = [];

  for (const shop of targetShops) {
    const blogUrl = `https://blog.naver.com/${shop.blogId}`;
    const clientId = clients.find((c) => c.blog_url === blogUrl)?.id;
    if (!clientId) {
      failures.push(`${shop.name}: BlogOps 미등록`);
      continue;
    }
    try {
      const postsRes = await fetch(`${baseUrl}/posts?client_id=${clientId}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!postsRes.ok) {
        failures.push(`${shop.name}: GET /posts ${postsRes.status}`);
        continue;
      }
      const posts = (await postsRes.json()) as Array<{ published_at?: string }>;
      const dates = posts
        .map((p) => (p.published_at ?? "").trim())
        .filter((d) => d.length > 0);
      results.push(computeShopCadence(shop.id, shop.name, dates));
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      failures.push(`${shop.name}: ${message}`);
    }
  }

  return {
    shops: results,
    reason: failures.length > 0 ? failures.join(" / ") : undefined,
  };
}
