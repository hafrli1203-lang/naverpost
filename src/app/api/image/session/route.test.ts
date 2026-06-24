import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/image/session 라우트 테스트 — 이미지 생성 파라미터 토큰 발급.
 * saveGenerationParams를 mock해 입력검증과 토큰 응답을 검증한다.
 */

vi.mock("@/lib/storage/imageStore", () => ({
  saveGenerationParams: vi.fn(async () => "token-123"),
}));

import { POST } from "./route";
import { saveGenerationParams } from "@/lib/storage/imageStore";

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/image/session POST", () => {
  it("필수 필드 누락이면 400, 저장하지 않는다", async () => {
    const res = await POST(req({ sessionId: "s1" })); // 나머지 누락
    expect(res.status).toBe(400);
    expect(saveGenerationParams).not.toHaveBeenCalled();
  });

  it("유효 입력이면 토큰을 발급한다", async () => {
    const res = await POST(
      req({ sessionId: "s1", articleContent: "본문", title: "제목", mainKeyword: "안경" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("token-123");
    expect(saveGenerationParams).toHaveBeenCalled();
  });
});
