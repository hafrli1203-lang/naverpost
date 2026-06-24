import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGoogleTrendsKR } from "./googleTrends";

/**
 * fetchGoogleTrendsKR RSS 파서 단위테스트.
 * 실제 Response로 fetch를 목킹해 CDATA/엔티티 디코딩·approx_traffic·중복 제거·
 * limit·실패 폴백(graceful)을 무비용으로 고정한다.
 */

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
<channel>
  <item><title><![CDATA[손흥민 토트넘]]></title><ht:approx_traffic>50,000+</ht:approx_traffic></item>
  <item><title>안경 &amp; 렌즈</title><ht:approx_traffic>10,000+</ht:approx_traffic></item>
  <item><title>김연아</title><ht:approx_traffic>20,000+</ht:approx_traffic></item>
  <item><title>김연아</title><ht:approx_traffic>20,000+</ht:approx_traffic></item>
  <item><title>트래픽없음</title></item>
</channel>
</rss>`;

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchGoogleTrendsKR", () => {
  it("title(CDATA·엔티티)·approx_traffic을 파싱하고 트래픽 없으면 null", async () => {
    stubFetch(async () => new Response(RSS, { status: 200 }));
    const out = await fetchGoogleTrendsKR();

    expect(out[0]).toEqual({ keyword: "손흥민 토트넘", trafficLabel: "50,000+" });
    expect(out[1]).toEqual({ keyword: "안경 & 렌즈", trafficLabel: "10,000+" });
    const noTraffic = out.find((k) => k.keyword === "트래픽없음");
    expect(noTraffic?.trafficLabel).toBeNull();
  });

  it("같은 제목은 한 번만(중복 제거)", async () => {
    stubFetch(async () => new Response(RSS, { status: 200 }));
    const out = await fetchGoogleTrendsKR();
    expect(out.filter((k) => k.keyword === "김연아")).toHaveLength(1);
  });

  it("limit으로 상위 N개만 돌려준다", async () => {
    stubFetch(async () => new Response(RSS, { status: 200 }));
    const out = await fetchGoogleTrendsKR(2);
    expect(out).toHaveLength(2);
    expect(out[0].keyword).toBe("손흥민 토트넘");
  });

  it("응답이 ok가 아니면 빈 배열(graceful)", async () => {
    stubFetch(async () => new Response("", { status: 503 }));
    expect(await fetchGoogleTrendsKR()).toEqual([]);
  });

  it("fetch가 던지면(타임아웃/차단) 빈 배열(graceful)", async () => {
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await fetchGoogleTrendsKR()).toEqual([]);
  });
});
