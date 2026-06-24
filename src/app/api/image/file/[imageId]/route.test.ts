import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/image/file/[imageId] 라우트 테스트 — 저장 이미지 바이너리 서빙.
 * getImage를 mock해 존재/부재 분기와 응답 헤더를 검증한다.
 */

vi.mock("@/lib/storage/imageStore", () => ({
  getImage: vi.fn(),
}));

import { GET } from "./route";
import { getImage } from "@/lib/storage/imageStore";

function ctx(imageId: string) {
  return { params: Promise.resolve({ imageId }) };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/image/file/[imageId] GET", () => {
  it("이미지가 없으면 404", async () => {
    vi.mocked(getImage).mockResolvedValue(null);
    const res = await GET({} as Parameters<typeof GET>[0], ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("이미지가 있으면 바이너리 + Content-Type을 반환한다", async () => {
    vi.mocked(getImage).mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    } as never);
    const res = await GET({} as Parameters<typeof GET>[0], ctx("abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
  });
});
