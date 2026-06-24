import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/shops/[shopId] 라우트 테스트 — 매장 수정(PUT)/삭제(DELETE).
 * updateShop/deleteShop을 mock해 params·부분수정·삭제 흐름을 검증한다.
 */

vi.mock("@/lib/data/shops", () => ({
  updateShop: vi.fn(async () => [{ id: "top50jn" }]),
  deleteShop: vi.fn(async () => []),
}));

import { PUT, DELETE } from "./route";
import { updateShop, deleteShop } from "@/lib/data/shops";

function putReq(body: unknown) {
  return { json: async () => body } as Parameters<typeof PUT>[0];
}
function ctx(shopId: string) {
  return { params: Promise.resolve({ shopId }) };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/shops/[shopId]", () => {
  it("PUT은 부분 수정 필드만 updateShop에 전달한다", async () => {
    const res = await PUT(putReq({ name: "수정된이름" }), ctx("top50jn"));
    expect(res.status).toBe(200);
    expect(updateShop).toHaveBeenCalledWith("top50jn", expect.objectContaining({ name: "수정된이름" }));
  });

  it("PUT에서 blogId 변경 시 rssUrl도 함께 갱신한다", async () => {
    await PUT(putReq({ blogId: "changed" }), ctx("top50jn"));
    const updates = vi.mocked(updateShop).mock.calls[0][1] as { rssUrl?: string };
    expect(updates.rssUrl).toContain("changed");
  });

  it("DELETE는 해당 매장을 삭제한다", async () => {
    const res = await DELETE({} as Parameters<typeof DELETE>[0], ctx("top50jn"));
    expect(res.status).toBe(200);
    expect(deleteShop).toHaveBeenCalledWith("top50jn");
  });
});
