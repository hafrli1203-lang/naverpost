import { describe, it, expect } from "vitest";
import { POST } from "./route";

/**
 * /api/document/upload 라우트 테스트 — 참고 문서 업로드/추출.
 * .txt 경로는 순수(외부 파서 불필요)라 실제 FormData/File로 검증한다.
 * (docx/pdf는 mammoth/pdf-parse 의존 — txt 경로로 핵심 흐름만 고정.)
 */

function reqWithFile(file: File | null) {
  const form = new FormData();
  if (file) form.set("file", file);
  return { formData: async () => form } as Parameters<typeof POST>[0];
}

describe("/api/document/upload POST", () => {
  it("파일이 없으면 400", async () => {
    const res = await POST(reqWithFile(null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("파일이 필요");
  });

  it("10MB 초과 파일은 400", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.txt", { type: "text/plain" });
    const res = await POST(reqWithFile(big));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("10MB");
  });

  it(".txt 파일이면 텍스트를 추출해 digest를 반환한다", async () => {
    const file = new File(["안경 렌즈 참고 자료입니다. 누진렌즈 적응에 대한 내용."], "ref.txt", {
      type: "text/plain",
    });
    const res = await POST(reqWithFile(file));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.fileName).toBe("ref.txt");
    expect(json.data.textLength).toBeGreaterThan(0);
  });

  it("지원하지 않는 형식은 500(에러 메시지)", async () => {
    const file = new File(["x"], "bad.exe", { type: "application/octet-stream" });
    const res = await POST(reqWithFile(file));
    expect(res.status).toBe(500);
  });

  it("빈 .txt(텍스트 없음)는 400", async () => {
    const file = new File(["   "], "empty.txt", { type: "text/plain" });
    const res = await POST(reqWithFile(file));
    expect(res.status).toBe(400);
  });
});
