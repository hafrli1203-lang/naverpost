import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 발행 일관성(cadence) 회귀 테스트 — 외부 I/O mock.
 * 진짜 BlogOps 없이 흐름(graceful OFF·연결실패·미등록·발행간격 집계)을 검증한다.
 * computeShopCadence의 daysSinceLast는 현재시각 의존이라 시간독립 속성만 단언.
 */

vi.mock("@/lib/data/shops", () => ({
  getShops: vi.fn(async () => [
    { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" },
  ]),
}));

import { getCadenceReport } from "./cadence";

const savedUrl = process.env.BLOGOPS_API_URL;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.BLOGOPS_API_URL;
  else process.env.BLOGOPS_API_URL = savedUrl;
  vi.restoreAllMocks();
});
beforeEach(() => vi.clearAllMocks());

describe("getCadenceReport — graceful OFF / 실패", () => {
  it("BLOGOPS_API_URL 미설정이면 OFF 사유를 남긴다", async () => {
    delete process.env.BLOGOPS_API_URL;
    const r = await getCadenceReport();
    expect(r.shops).toHaveLength(0);
    expect(r.reason).toContain("미설정");
  });

  it("clients 조회 실패(500)면 사유를 남긴다", async () => {
    process.env.BLOGOPS_API_URL = "http://blogops.test";
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    const r = await getCadenceReport();
    expect(r.shops).toHaveLength(0);
    expect(r.reason).toContain("/clients");
  });
});

describe("getCadenceReport — 전체 흐름(mock)", () => {
  beforeEach(() => {
    process.env.BLOGOPS_API_URL = "http://blogops.test";
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) {
        return new Response(
          JSON.stringify([{ id: "client-1", blog_url: "https://blog.naver.com/top50jn" }]),
          { status: 200 }
        );
      }
      if (url.includes("/posts?client_id=")) {
        return new Response(
          JSON.stringify([
            { published_at: "2025-06-01" },
            { published_at: "2025-06-08" },
            { published_at: "2025-06-15" },
          ]),
          { status: 200 }
        );
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
  });

  it("등록 매장의 발행 글로 cadence를 계산한다(시간독립 속성)", async () => {
    const r = await getCadenceReport("top50jn");
    expect(r.shops).toHaveLength(1);
    const c = r.shops[0];
    expect(c.shopId).toBe("top50jn");
    expect(c.totalPosts).toBe(3);
    // 7일 간격 2회 → 평균 7일(현재시각 무관)
    expect(c.avgIntervalDays).toBe(7);
  });

  it("BlogOps 미등록 매장은 failures 사유로 남는다", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    const r = await getCadenceReport("top50jn");
    expect(r.shops).toHaveLength(0);
    expect(r.reason).toContain("미등록");
  });
});
