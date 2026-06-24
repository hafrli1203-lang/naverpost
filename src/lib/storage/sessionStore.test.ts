import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 세션 저장소 회귀 테스트 — 파일시스템을 인메모리 mock으로 검증.
 * 진짜 디스크를 건드리지 않고, KV 미설정 시 파일 폴백 경로의 라운드트립
 * (save→get→list→delete)과 ID 새니타이즈(경로 순회 방지)를 확인한다.
 */

// 인메모리 파일시스템(경로→내용). fs 모듈을 통째로 가짜화한다.
const files = new Map<string, string>();
vi.mock("fs", () => {
  const api = {
    existsSync: (p: string) => files.has(String(p)),
    mkdirSync: () => undefined,
    writeFileSync: (p: string, data: string) => void files.set(String(p), String(data)),
    readFileSync: (p: string) => {
      const v = files.get(String(p));
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    readdirSync: () => Array.from(files.keys()).map((p) => p.split(/[/\\]/).pop()!),
    unlinkSync: (p: string) => void files.delete(String(p)),
    rmSync: (p: string) => void files.delete(String(p)),
  };
  return { ...api, default: api };
});

import { saveSession, getSession, listSessions, deleteSession } from "./sessionStore";
import type { SavedSession } from "./sessionStore";

function session(id: string, savedAt: string): SavedSession {
  return {
    id,
    savedAt,
    shopName: "탑안경",
    category: "누진다초점",
    topic: "누진렌즈 적응",
    title: "누진렌즈 적응 방법",
    mainKeyword: "누진렌즈 적응",
    subKeyword1: "누진렌즈 울렁임",
    subKeyword2: "누진렌즈 시야",
    articleContent: "본문",
  };
}

const savedKvUrl = process.env.KV_REST_API_URL;
beforeEach(() => {
  files.clear();
  delete process.env.KV_REST_API_URL; // 파일 폴백 강제
  delete process.env.KV_REST_API_TOKEN;
});
afterEach(() => {
  if (savedKvUrl !== undefined) process.env.KV_REST_API_URL = savedKvUrl;
  vi.restoreAllMocks();
});

describe("sessionStore (파일 폴백)", () => {
  it("save → get 라운드트립으로 같은 세션을 돌려준다", async () => {
    await saveSession(session("abc123", "2025-06-10T00:00:00Z"));
    const got = await getSession("abc123");
    expect(got?.id).toBe("abc123");
    expect(got?.shopName).toBe("탑안경");
  });

  it("없는 세션은 null", async () => {
    expect(await getSession("nope")).toBeNull();
  });

  it("listSessions는 savedAt 내림차순(최신 우선)으로 정렬한다", async () => {
    await saveSession(session("old", "2025-06-01T00:00:00Z"));
    await saveSession(session("new", "2025-06-20T00:00:00Z"));
    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("deleteSession 후 get은 null", async () => {
    await saveSession(session("toDelete", "2025-06-10T00:00:00Z"));
    await deleteSession("toDelete");
    expect(await getSession("toDelete")).toBeNull();
  });

  it("ID의 위험 문자는 새니타이즈되어 경로 순회를 막는다", async () => {
    await saveSession(session("../../etc/passwd", "2025-06-10T00:00:00Z"));
    // 파일명에 '..'나 슬래시가 그대로 들어가지 않아야 한다
    const paths = Array.from(files.keys());
    expect(paths.some((p) => p.includes(".."))).toBe(false);
  });
});
