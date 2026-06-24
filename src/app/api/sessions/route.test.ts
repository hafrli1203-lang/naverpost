import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/sessions 라우트 테스트 — GET/POST/DELETE.
 * sessionStore(파일/KV)와 BlogOps 등록을 mock해 외부 I/O 없이 CRUD 흐름을 검증한다.
 */

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/sessionStore", () => ({
  saveSession: vi.fn(async (s: { id: string }) => void store.set(s.id, s)),
  listSessions: vi.fn(async () => Array.from(store.values())),
  deleteSession: vi.fn(async (id: string) => void store.delete(id)),
}));
vi.mock("@/lib/blogops/client", () => ({
  registerPostToBlogOps: vi.fn(async () => ({ enabled: false })),
}));

import { GET, POST, DELETE } from "./route";
import { saveSession, deleteSession } from "@/lib/storage/sessionStore";

function postReq(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}
function delReq(id: string | null) {
  return {
    nextUrl: { searchParams: new URLSearchParams(id ? `id=${id}` : "") },
  } as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("/api/sessions", () => {
  it("POST는 세션을 저장하고 blogops 결과를 표면화한다", async () => {
    const res = await POST(
      postReq({
        id: "sess-1",
        shopName: "탑안경",
        category: "누진다초점",
        title: "누진렌즈 적응 방법",
        mainKeyword: "누진렌즈 적응",
        subKeyword1: "누진렌즈 울렁임",
        subKeyword2: "누진렌즈 시야",
        articleContent: "본문",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("sess-1");
    expect(json.data.blogops).toEqual({ enabled: false });
    expect(saveSession).toHaveBeenCalled();
  });

  it("POST에 id가 없으면 UUID를 생성한다", async () => {
    const res = await POST(postReq({ shopName: "탑안경", title: "t" }));
    const json = await res.json();
    expect(typeof json.data.id).toBe("string");
    expect(json.data.id.length).toBeGreaterThan(0);
  });

  it("GET은 저장된 세션 목록을 반환한다", async () => {
    await POST(postReq({ id: "a", title: "A" }));
    await POST(postReq({ id: "b", title: "B" }));
    const res = await GET();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
  });

  it("DELETE는 id가 없으면 400", async () => {
    const res = await DELETE(delReq(null));
    expect(res.status).toBe(400);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("DELETE는 id가 있으면 삭제한다", async () => {
    await POST(postReq({ id: "toDel", title: "X" }));
    const res = await DELETE(delReq("toDel"));
    expect(res.status).toBe(200);
    expect(deleteSession).toHaveBeenCalledWith("toDel");
  });
});
