import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/article/validate 라우트 테스트 — zod 경계검증 + 응답 정형.
 * validateContent는 mock한다(그 내부는 contentValidator 단위테스트가 덮음).
 * ※ 실제 라우트는 validateContent를 fast 없이 호출 → 형태소 분석이 AI CLI를 타므로
 *   라우트 테스트에서는 반드시 mock해 비용/타임아웃을 피한다.
 */

vi.mock("@/lib/validation/contentValidator", () => ({
  validateContent: vi.fn(async () => ({
    needsRevision: false,
    prohibitedWords: [],
    cautionPhrases: [],
    revisionReasons: [],
  })),
}));

import { POST } from "./route";
import { validateContent } from "@/lib/validation/contentValidator";

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/article/validate POST", () => {
  it("content 누락이면 400(한국어 메시지)이고 validateContent를 부르지 않는다", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("content는 필수입니다.");
    expect(validateContent).not.toHaveBeenCalled();
  });

  it("유효한 content면 validateContent를 호출하고 결과를 반환한다", async () => {
    const res = await POST(req({ content: "안경을 새로 맞췄습니다." }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty("needsRevision");
    expect(validateContent).toHaveBeenCalledWith("안경을 새로 맞췄습니다.", undefined);
  });

  it("tone이 있으면 validateContent에 tone 옵션을 전달한다", async () => {
    await POST(req({ content: "본문", tone: "friendly" }));
    const call = vi.mocked(validateContent).mock.calls[0];
    expect(call[1]).toMatchObject({ tone: "friendly" });
  });
});
