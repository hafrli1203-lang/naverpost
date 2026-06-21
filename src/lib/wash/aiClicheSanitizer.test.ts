import { describe, it, expect } from "vitest";
import { sanitizeAiCliches } from "./aiClicheSanitizer";

/**
 * AI 상투어 결정론 치환 회귀 테스트(순수, 워싱 2패스의 보강).
 * 안전한 1:1 치환만 적용하고, 무위반 본문은 손대지 않아야 한다(무회귀 원칙).
 */

describe("sanitizeAiCliches", () => {
  it("부사/명사형 상투어를 사람 말투로 치환한다", () => {
    const r = sanitizeAiCliches("차근차근 알아볼게요. 이번 글에서는 원인 후보를 봅니다.");
    expect(r.content).toContain("하나씩");
    expect(r.content).toContain("오늘은");
    expect(r.content).not.toContain("차근차근");
    expect(r.content).not.toContain("이번 글에서는");
  });

  it("해요체 레지스터를 유지하며 치환한다", () => {
    const r = sanitizeAiCliches("도움이 돼요. 정리해봤어요.");
    expect(r.content).toContain("도움이 될 수 있어요");
    expect(r.content).toContain("정리했어요");
  });

  it("'~겠습니다' AI 티를 합니다체로 정리한다", () => {
    const r = sanitizeAiCliches("궁금증을 풀어드리겠습니다.");
    expect(r.content).toContain("풀어드립니다");
    expect(r.content).not.toContain("풀어드리겠습니다");
  });

  it("리포트에 치환 횟수와 예시를 담는다", () => {
    const r = sanitizeAiCliches("차근차근 살펴볼게요.");
    expect(r.totalReplacements).toBeGreaterThan(0);
    expect(r.examples.length).toBeGreaterThan(0);
    expect(r.examples[0]).toHaveProperty("from");
    expect(r.examples[0]).toHaveProperty("to");
  });

  it("무위반 본문은 0 치환이고 내용 보존(무회귀)", () => {
    const clean = "안경을 새로 맞췄습니다. 시야가 한결 편합니다.";
    const r = sanitizeAiCliches(clean);
    expect(r.totalReplacements).toBe(0);
    expect(r.content).toBe(clean);
  });

  it("같은 입력은 같은 출력(결정론)", () => {
    const input = "차근차근 살펴볼게요. 도움이 돼요.";
    expect(sanitizeAiCliches(input)).toEqual(sanitizeAiCliches(input));
  });

  it("examples는 최대 8개로 제한된다", () => {
    const r = sanitizeAiCliches(
      "차근차근 꼭 알아야 할 이번 글에서는 원인 후보 확인 순서 판별 축 살펴볼게요 정리해봤어요 도움이 돼요 보탬이 될 거예요 풀어드리겠습니다"
    );
    expect(r.examples.length).toBeLessThanOrEqual(8);
  });
});
