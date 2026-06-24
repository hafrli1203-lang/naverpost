import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/analysis 라우트 테스트 — mode 디스패처 + 입력 검증.
 * posting-audit는 로컬 순수(auditPosting)라 mock 없이 직접 검증.
 * smart-block/autocomplete-index는 외부/AI 함수를 mock해 분기·검증만 검증(비용 0).
 */

vi.mock("@/lib/analysis/smartBlock", () => ({
  inferSmartBlockSubKeywords: vi.fn(async () => ({ recommendedTitleKeyword: "누진렌즈" })),
}));
vi.mock("@/lib/analysis/autocompleteIndex", () => ({
  analyzeAutocompleteIndex: vi.fn(async () => ({ missing: [] })),
}));

import { POST } from "./route";
import { inferSmartBlockSubKeywords } from "@/lib/analysis/smartBlock";

// Next 핸들러는 request.json()만 사용 → 가짜 request로 호출한다.
function req(body: unknown, badJson = false) {
  return {
    json: async () => {
      if (badJson) throw new Error("bad json");
      return body;
    },
  } as Parameters<typeof POST>[0];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("/api/analysis POST", () => {
  it("JSON 파싱 실패면 400", async () => {
    const res = await POST(req(null, true));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("JSON");
  });

  it("알 수 없는 mode면 400", async () => {
    const res = await POST(req({ mode: "nope" }));
    expect(res.status).toBe(400);
  });

  describe("posting-audit (로컬 순수)", () => {
    it("title/body 누락이면 400", async () => {
      const res = await POST(req({ mode: "posting-audit", title: "제목" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("body");
    });

    it("유효 입력이면 success + 감사 데이터를 반환한다", async () => {
      const res = await POST(
        req({
          mode: "posting-audit",
          title: "누진렌즈 적응 방법",
          body: "누진렌즈는 적응에 시간이 걸립니다. 천천히 익숙해지면 편안합니다.",
          mainKeyword: "누진렌즈 적응",
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeTruthy();
    });
  });

  describe("smart-block (외부, mock)", () => {
    it("mainKeyword 누락이면 400이고 외부 함수를 부르지 않는다", async () => {
      const res = await POST(req({ mode: "smart-block" }));
      expect(res.status).toBe(400);
      expect(inferSmartBlockSubKeywords).not.toHaveBeenCalled();
    });

    it("mainKeyword가 있으면 외부 함수를 호출해 success를 반환한다", async () => {
      const res = await POST(req({ mode: "smart-block", mainKeyword: "누진렌즈" }));
      expect(res.status).toBe(200);
      expect(inferSmartBlockSubKeywords).toHaveBeenCalledWith("누진렌즈");
    });
  });

  describe("autocomplete-index (외부, mock)", () => {
    it("title/mainKeyword 누락이면 400", async () => {
      const res = await POST(req({ mode: "autocomplete-index", title: "제목" }));
      expect(res.status).toBe(400);
    });
  });
});
