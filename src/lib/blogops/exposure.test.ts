import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 노출 추적(BlogOps + 네이버 검색) 회귀 테스트 — 외부 I/O를 mock으로 검증.
 * 진짜 BlogOps 서버/네이버 키 없이, fetch와 모듈 의존을 가짜로 바꿔
 * 우리 코드의 흐름(graceful OFF·등록확인·순위계산·기록)만 검증한다.
 */

// 모듈 의존을 가짜로 바꾼다(네트워크/데이터 격리).
vi.mock("@/lib/data/shops", () => ({
  getShops: vi.fn(async () => [
    { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" },
  ]),
}));
vi.mock("@/lib/naver/searchSignals", () => ({
  fetchBlogSearch: vi.fn(async () => ({
    items: [
      { link: "https://blog.naver.com/other/1", bloggerlink: "https://blog.naver.com/other" },
      { link: "https://blog.naver.com/top50jn/99", bloggerlink: "https://blog.naver.com/top50jn" },
    ],
  })),
}));

import { trackExposureForShops } from "./exposure";

const savedUrl = process.env.BLOGOPS_API_URL;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.BLOGOPS_API_URL;
  else process.env.BLOGOPS_API_URL = savedUrl;
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe("trackExposureForShops — graceful OFF", () => {
  it("BLOGOPS_API_URL 미설정이면 enabled:false, 호출 없음", async () => {
    delete process.env.BLOGOPS_API_URL;
    const fetchSpy = vi.spyOn(global, "fetch");
    const r = await trackExposureForShops();
    expect(r.enabled).toBe(false);
    expect(r.results).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("trackExposureForShops — 전체 흐름(mock)", () => {
  beforeEach(() => {
    process.env.BLOGOPS_API_URL = "http://blogops.test";
    // URL별로 가짜 응답을 라우팅한다(진짜 서버 없음).
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) {
        return new Response(
          JSON.stringify([{ id: "client-1", blog_url: "https://blog.naver.com/top50jn" }]),
          { status: 200 }
        );
      }
      if (url.endsWith("/posts")) {
        return new Response(
          JSON.stringify([{ client_id: "client-1", main_keyword: "누진렌즈 적응" }]),
          { status: 200 }
        );
      }
      if (url.endsWith("/exposure-runs")) {
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch);
  });

  it("등록된 매장의 키워드를 검색해 순위를 측정하고 기록한다", async () => {
    const r = await trackExposureForShops(["top50jn"]);
    expect(r.enabled).toBe(true);
    expect(r.results).toHaveLength(1);
    const result = r.results[0];
    expect(result.shopId).toBe("top50jn");
    expect(result.clientId).toBe("client-1");
    expect(result.measured).toBe(1);
    // 검색 결과 2번째에 내 블로그(top50jn)가 있으므로 rank 매겨짐
    expect(result.ranked).toBe(1);
  });

  it("BlogOps에 매장 미등록(clients 빈 응답)이면 사유를 남긴다", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    const r = await trackExposureForShops(["top50jn"]);
    expect(r.enabled).toBe(true);
    expect(r.results[0].reason).toContain("미등록");
  });
});
