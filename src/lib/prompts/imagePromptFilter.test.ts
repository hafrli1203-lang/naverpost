import { describe, it, expect } from "vitest";
import { hangulRatio, isLikelyImagePrompt } from "./imagePromptFilter";

describe("hangulRatio", () => {
  it("is ~1 for a Korean sentence", () => {
    expect(hangulRatio("순서로 구성했습니다")).toBeGreaterThan(0.9);
  });
  it("is ~0 for an English prompt", () => {
    expect(hangulRatio("Candid documentary photograph of a Korean person")).toBe(0);
  });
  it("is 0 for empty input", () => {
    expect(hangulRatio("")).toBe(0);
  });
});

describe("isLikelyImagePrompt", () => {
  it("rejects a Korean explanation/preamble line (the crash-log leak)", () => {
    expect(
      isLikelyImagePrompt(
        "퇴근길 지하철에서 눈이 뻑뻑해 자꾸 깜빡이는 도입부 순서로 구성했습니다."
      )
    ).toBe(false);
  });
  it("keeps an English image prompt", () => {
    expect(
      isLikelyImagePrompt(
        "Candid documentary photograph of an ordinary Korean person sitting at home, natural window light"
      )
    ).toBe(true);
  });
  it("rejects a too-short line", () => {
    expect(isLikelyImagePrompt("x")).toBe(false);
    expect(isLikelyImagePrompt("short prompt")).toBe(false);
  });
  it("keeps an English prompt that carries a few Korean tokens under the threshold", () => {
    // mostly English describing a Korean店 — small Korean fraction stays under 0.3
    const text =
      "Bright modern Korean eyewear store interior, backlit display shelves, warm white lighting, clean realistic photo";
    expect(isLikelyImagePrompt(text)).toBe(true);
  });
});
