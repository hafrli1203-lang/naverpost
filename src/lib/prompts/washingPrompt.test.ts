import { describe, it, expect } from "vitest";
import { buildWashingPrompt } from "./washingPrompt";

/**
 * 워싱 프롬프트 빌더 회귀 테스트(순수 문자열 조립).
 * 의료법/광고법 안전화 지시 + 키워드/매장/톤 주입을 고정한다.
 */

function base() {
  return {
    originalContent: "원문 본문입니다.",
    title: "누진렌즈 적응 방법",
    mainKeyword: "누진렌즈 적응",
    subKeyword1: "누진렌즈 울렁임",
    subKeyword2: "누진렌즈 시야",
    charCount: 2000,
    shopName: "탑안경",
  };
}

describe("buildWashingPrompt", () => {
  it("원문과 핵심 광고법/의료법 지시를 포함한다", () => {
    const p = buildWashingPrompt(base());
    expect(p).toContain("원문 본문입니다.");
    expect(p).toContain("의료기관이 아닙니다");
    expect(p).toContain("광고법");
  });

  it("톤 가이드를 반영한다(friendly)", () => {
    const p = buildWashingPrompt({ ...base(), tone: "friendly" });
    expect(p).toContain("다정한 구어체");
  });

  it("문자열을 반환한다(비어있지 않음)", () => {
    const p = buildWashingPrompt(base());
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });
});
