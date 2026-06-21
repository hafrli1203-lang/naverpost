import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchBlogSearch, NaverSearchDependencyError } from "./searchSignals";

/**
 * 네이버 블로그 검색 회귀 테스트 — 외부 I/O mock.
 * 진짜 네이버 API/키 없이, fetch 응답을 가짜로 주고 우리 코드의 파싱
 * (HTML 태그 제거·필드 정규화·에러 처리·display 클램프)을 검증한다.
 */

const savedId = process.env.NAVER_CLIENT_ID;
const savedSecret = process.env.NAVER_CLIENT_SECRET;
beforeEach(() => {
  process.env.NAVER_CLIENT_ID = "test-id";
  process.env.NAVER_CLIENT_SECRET = "test-secret";
});
afterEach(() => {
  process.env.NAVER_CLIENT_ID = savedId;
  process.env.NAVER_CLIENT_SECRET = savedSecret;
  vi.restoreAllMocks();
});

describe("fetchBlogSearch", () => {
  it("응답의 HTML 태그를 제거하고 필드를 정규화한다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1234,
          items: [
            {
              title: "<b>누진렌즈</b> 적응 방법",
              description: "설명 <b>강조</b> 텍스트",
              link: "https://blog.naver.com/top50jn/1",
              bloggerlink: "https://blog.naver.com/top50jn",
            },
          ],
        }),
        { status: 200 }
      )
    );
    const r = await fetchBlogSearch("누진렌즈 적응");
    expect(r.total).toBe(1234);
    expect(r.items[0].title).toBe("누진렌즈 적응 방법"); // <b> 제거
    expect(r.items[0].description).toBe("설명 강조 텍스트");
    expect(r.items[0].link).toBe("https://blog.naver.com/top50jn/1");
  });

  it("items가 없으면 빈 배열, total 0으로 안전 처리한다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const r = await fetchBlogSearch("키워드");
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("API 실패(401)면 NaverSearchDependencyError를 던진다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(fetchBlogSearch("키워드")).rejects.toBeInstanceOf(NaverSearchDependencyError);
  });

  it("display는 1~100으로 클램프되어 요청 URL에 들어간다", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 })
    );
    await fetchBlogSearch("키워드", 999);
    const calledUrl = String((spy.mock.calls[0]?.[0]) ?? "");
    expect(calledUrl).toContain("display=100"); // 999 → 100으로 클램프
    expect(calledUrl).toContain("openapi.naver.com/v1/search/blog.json");
  });
});
