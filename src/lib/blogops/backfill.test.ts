import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 기발행 글 백필(RSS→BlogOps) 회귀 테스트 — 외부 I/O mock.
 * 진짜 BlogOps/RSS 없이 흐름(graceful OFF·등록확인·RSS 파싱·posts 등록 집계)을 검증한다.
 */

vi.mock("@/lib/data/shops", () => ({
  getShops: vi.fn(async () => [
    { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "https://rss.test/top50jn" },
  ]),
}));

import { backfillPublishedPosts } from "./backfill";

const RSS_XML = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[장림 안경점 | 누진렌즈 적응 방법]]></title><link><![CDATA[https://blog.naver.com/top50jn/1]]></link><pubDate>Mon, 02 Jun 2025 10:00:00 +0900</pubDate></item>
<item><title><![CDATA[안경테 고르는 법]]></title><link><![CDATA[https://blog.naver.com/top50jn/2]]></link><pubDate>Tue, 03 Jun 2025 10:00:00 +0900</pubDate></item>
</channel></rss>`;

const savedUrl = process.env.BLOGOPS_API_URL;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.BLOGOPS_API_URL;
  else process.env.BLOGOPS_API_URL = savedUrl;
  vi.restoreAllMocks();
});
beforeEach(() => vi.clearAllMocks());

describe("backfillPublishedPosts — graceful OFF", () => {
  it("BLOGOPS_API_URL 미설정이면 enabled:false", async () => {
    delete process.env.BLOGOPS_API_URL;
    const fetchSpy = vi.spyOn(global, "fetch");
    const r = await backfillPublishedPosts();
    expect(r.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("backfillPublishedPosts — 전체 흐름(mock)", () => {
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
      if (url.startsWith("https://rss.test/")) {
        return new Response(RSS_XML, { status: 200 });
      }
      if (url.endsWith("/posts")) {
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch);
  });

  it("RSS 글을 파싱해 BlogOps posts에 등록한다", async () => {
    const r = await backfillPublishedPosts(["top50jn"]);
    expect(r.enabled).toBe(true);
    const result = r.results[0];
    expect(result.shopId).toBe("top50jn");
    expect(result.clientId).toBe("client-1");
    expect(result.found).toBe(2); // RSS item 2개
    expect(result.registered).toBe(2); // posts POST 201 → 2건 등록
  });

  it("BlogOps 미등록(clients 빈 응답)이면 RSS를 받지 않고 사유를 남긴다", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    const r = await backfillPublishedPosts(["top50jn"]);
    expect(r.results[0].reason).toContain("미등록");
    expect(r.results[0].found).toBe(0);
  });

  it("RSS 조회 실패 시 사유를 남기고 등록 0", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/clients")) {
        return new Response(
          JSON.stringify([{ id: "client-1", blog_url: "https://blog.naver.com/top50jn" }]),
          { status: 200 }
        );
      }
      if (url.startsWith("https://rss.test/")) return new Response("err", { status: 500 });
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    const r = await backfillPublishedPosts(["top50jn"]);
    expect(r.results[0].registered).toBe(0);
    expect(r.results[0].reason).toBeTruthy();
  });
});
