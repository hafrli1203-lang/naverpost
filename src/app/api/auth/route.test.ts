import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/auth 라우트 테스트 — 비밀번호 인증 + 쿠키 설정.
 * next/headers cookies()를 mock해 쿠키 동작을 가짜로 검증한다.
 */

const cookieJar = { set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieJar),
}));

import { POST, DELETE } from "./route";

function req(body: unknown, bad = false) {
  return {
    json: async () => {
      if (bad) throw new Error("bad");
      return body;
    },
  } as Parameters<typeof POST>[0];
}

const savedPw = process.env.AUTH_PASSWORD;
const savedSecret = process.env.AUTH_TOKEN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_PASSWORD = "secret123";
  process.env.AUTH_TOKEN_SECRET = "token-secret";
});
afterEach(() => {
  process.env.AUTH_PASSWORD = savedPw;
  process.env.AUTH_TOKEN_SECRET = savedSecret;
  vi.restoreAllMocks();
});

describe("/api/auth POST", () => {
  it("서버 비밀번호 미설정이면 500", async () => {
    delete process.env.AUTH_PASSWORD;
    const res = await POST(req({ password: "x" }));
    expect(res.status).toBe(500);
  });

  it("틀린 비밀번호면 401, 쿠키를 설정하지 않는다", async () => {
    const res = await POST(req({ password: "wrong" }));
    expect(res.status).toBe(401);
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("맞는 비밀번호면 success + auth_token 쿠키를 설정한다", async () => {
    const res = await POST(req({ password: "secret123" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(cookieJar.set).toHaveBeenCalledWith(
      "auth_token",
      "token-secret",
      expect.objectContaining({ httpOnly: true })
    );
  });

  it("JSON 파싱 실패면 400", async () => {
    const res = await POST(req(null, true));
    expect(res.status).toBe(400);
  });
});

describe("/api/auth DELETE (로그아웃)", () => {
  it("auth_token 쿠키를 삭제한다", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(cookieJar.delete).toHaveBeenCalledWith("auth_token");
  });
});
