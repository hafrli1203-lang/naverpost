import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/shops 라우트 테스트 — 매장 목록(GET)/등록(POST).
 * 데이터 모듈(getShops/addShop)을 mock해 입력검증·응답을 검증한다.
 */

vi.mock("@/lib/data/shops", () => ({
  getShops: vi.fn(async () => [{ id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" }]),
  addShop: vi.fn(async (s: unknown) => [s]),
}));

import { GET, POST } from "./route";
import { addShop } from "@/lib/data/shops";

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/shops", () => {
  it("GET은 매장 목록을 반환한다", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it("POST는 name/blogId가 없으면 500(필수 에러)", async () => {
    const res = await POST(req({ name: "탑안경" })); // blogId 없음
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("필수");
    expect(addShop).not.toHaveBeenCalled();
  });

  it("POST는 유효 입력이면 매장을 등록하고 rssUrl을 blogId로 구성한다", async () => {
    const res = await POST(req({ name: "새안경", blogId: "newshop" }));
    expect(res.status).toBe(200);
    expect(addShop).toHaveBeenCalled();
    const passed = vi.mocked(addShop).mock.calls[0][0] as { id: string; rssUrl: string };
    expect(passed.id).toBe("newshop");
    expect(passed.rssUrl).toContain("newshop");
  });
});
