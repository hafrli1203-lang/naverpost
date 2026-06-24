import { describe, expect, it } from "vitest";
import {
  imageOneSchema,
  imageRegenerateSchema,
  imageContentSchema,
  parseRequestBody,
} from "./imageRequestSchemas";

describe("imageOneSchema", () => {
  it("accepts a valid body and passes optional scene/rawPhoto through", () => {
    const r = parseRequestBody(imageOneSchema, {
      sessionId: "s1",
      index: 0,
      prompt: "a clean photo",
      shopId: "top50jn",
      scene: "interior",
      rawPhoto: "C:/x.jpg",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.scene).toBe("interior");
  });

  it("accepts null/absent scene (nullish)", () => {
    const r = parseRequestBody(imageOneSchema, {
      sessionId: "s1",
      index: 3,
      prompt: "p",
      scene: null,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing required fields with the Korean message", () => {
    const r = parseRequestBody(imageOneSchema, { sessionId: "s1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("sessionId, index, prompt는 필수입니다.");
  });

  it("rejects wrong-typed index (string) — previously passed via `as`", () => {
    const r = parseRequestBody(imageOneSchema, {
      sessionId: "s1",
      index: "0",
      prompt: "p",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid scene tag", () => {
    const r = parseRequestBody(imageOneSchema, {
      sessionId: "s1",
      index: 0,
      prompt: "p",
      scene: "rooftop",
    });
    expect(r.ok).toBe(false);
  });
});

describe("imageRegenerateSchema", () => {
  it("accepts valid body with optional prompt omitted", () => {
    const r = parseRequestBody(imageRegenerateSchema, {
      index: 2,
      sessionId: "s1",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing sessionId", () => {
    const r = parseRequestBody(imageRegenerateSchema, { index: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("index와 sessionId는 필수입니다.");
  });
});

describe("imageContentSchema", () => {
  it("accepts valid content body", () => {
    const r = parseRequestBody(imageContentSchema, {
      articleContent: "본문",
      title: "제목",
      mainKeyword: "안경",
      shopId: "top50jn",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty required content with the Korean message", () => {
    const r = parseRequestBody(imageContentSchema, {
      articleContent: "",
      title: "제목",
      mainKeyword: "안경",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("articleContent, title, mainKeyword는 필수입니다.");
  });
});
