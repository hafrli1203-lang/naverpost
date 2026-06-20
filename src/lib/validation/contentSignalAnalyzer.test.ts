import { describe, it, expect } from "vitest";
import { analyzeLanguageRisk } from "./contentSignalAnalyzer";

/**
 * 언어 리스크 분석 회귀 테스트(순수 함수, CLI 0).
 * 고정 대상: 쉼표 형식 정책(v2.8 — 본문 제한적 허용, 남발 금지)과
 * 지침어 본문 누수(templateLeak — 메모리상 "세 번째 반복 패턴"인 회귀 클래스).
 */

describe("analyzeLanguageRisk — 쉼표 형식 정책(formatViolations)", () => {
  it("정상 본문(쉼표 없음/적음)은 형식 위반 0", () => {
    const r = analyzeLanguageRisk(
      "안경을 새로 맞췄습니다. 시야가 한결 편합니다. 매장에서 도수를 확인했어요."
    );
    expect(r.formatViolations ?? []).toHaveLength(0);
  });

  it("한 문장에 쉼표 3개 이상이면 남발로 잡는다", () => {
    const r = analyzeLanguageRisk("안경은 가볍고, 튼튼하고, 편하고, 예쁩니다.");
    expect((r.formatViolations ?? []).length).toBeGreaterThan(0);
  });

  it("숫자 천단위 쉼표(1,000)는 위반으로 세지 않는다", () => {
    const r = analyzeLanguageRisk("이 렌즈는 약 1,000개 이상 판매된 제품입니다.");
    expect(r.formatViolations ?? []).toHaveLength(0);
  });
});

describe("analyzeLanguageRisk — 지침어 본문 누수(templateLeaks)", () => {
  it("정상 소제목은 누수 0", () => {
    const r = analyzeLanguageRisk("## 렌즈 고르는 법\n본문 내용입니다.");
    expect(r.templateLeaks ?? []).toHaveLength(0);
  });

  it("소제목에 '넘겨짚' 같은 지침어가 그대로 노출되면 잡는다", () => {
    const r = analyzeLanguageRisk("## 집에서 넘겨짚는 신호\n본문 내용입니다.");
    expect((r.templateLeaks ?? []).length).toBeGreaterThan(0);
  });
});
