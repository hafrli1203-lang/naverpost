import { describe, it, expect } from "vitest";
import { sanitizeMedicalLaw } from "./medicalLawSanitizer";

/**
 * 의료법·광고법 결정론 안전화 회귀 테스트(순수 함수).
 * 법적 핵심: 의료 행위/단정/비방/압박 표현을 안전 표현으로 치환하되
 * 매장 안내 블록(주소·운영시간 등 사실 정보)은 단어 치환에서 보호한다.
 */

describe("sanitizeMedicalLaw — 의료 행위 단어 치환(본문)", () => {
  it("시술/수술→조정, 치료/진단→확인, 의사→안경사, 병원→매장", () => {
    const r = sanitizeMedicalLaw("시술과 치료를 의사가 병원에서 진단합니다.");
    expect(r.content).toContain("조정");
    expect(r.content).toContain("확인");
    expect(r.content).toContain("안경사");
    expect(r.content).toContain("매장");
    expect(r.content).not.toMatch(/시술|치료|의사|병원|진단/);
    expect(r.byCategory["medical-term"]).toBeGreaterThan(0);
  });
});

describe("sanitizeMedicalLaw — 단정/보장 표현(phrase 우선)", () => {
  it("100% 효과를 보장합니다 → 안내 표현", () => {
    const r = sanitizeMedicalLaw("이 렌즈는 100% 효과를 보장합니다.");
    expect(r.content).not.toMatch(/100\s*%\s*효과를?\s*보장/);
    expect(r.byCategory.absolute).toBeGreaterThan(0);
  });

  it("완치됩니다 → 개선될 수 있어요", () => {
    const r = sanitizeMedicalLaw("꾸준히 쓰면 완치됩니다.");
    expect(r.content).toContain("개선될 수 있어요");
    expect(r.content).not.toContain("완치됩니다");
  });
});

describe("sanitizeMedicalLaw — 비방/압박 표현", () => {
  it("타 매장 비방 표현을 제거한다", () => {
    const r = sanitizeMedicalLaw("다른 안경원보다 우리가 낫습니다.");
    expect(r.content).not.toContain("다른 안경원보다");
    expect(r.byCategory.comparison).toBeGreaterThan(0);
  });

  it("지금 바로 방문하세요 → 압박 완화", () => {
    const r = sanitizeMedicalLaw("지금 바로 방문하세요.");
    expect(r.content).not.toContain("지금 바로 방문하세요");
    expect(r.byCategory["discount-pressure"]).toBeGreaterThan(0);
  });
});

describe("sanitizeMedicalLaw — 매장 안내 블록 보호(중요)", () => {
  it("매장 안내의 사실 정보는 단어 치환에서 보호된다", () => {
    const content = [
      "치료 효과가 확실한 렌즈입니다.", // 본문 → 치환 대상
      "",
      "매장명: 정확한안경 의원점", // 안내 블록 → '정확한'·'의원' 보호
      "주소: 서울시 ...",
      "운영시간: 10:00-20:00",
    ].join("\n");
    const r = sanitizeMedicalLaw(content);
    // 본문의 '치료'는 치환됨
    expect(r.content).not.toMatch(/치료 효과가 확실한/);
    // 매장 안내의 상호(정확한안경 의원점)는 그대로 보존
    expect(r.content).toContain("정확한안경 의원점");
    expect(r.content).toContain("운영시간: 10:00-20:00");
  });
});

describe("sanitizeMedicalLaw — 리포트/안전성", () => {
  it("위반 없는 본문은 0 치환이고 내용 보존", () => {
    const clean = "안경을 새로 맞췄어요. 시야가 편합니다.";
    const r = sanitizeMedicalLaw(clean);
    expect(r.totalReplacements).toBe(0);
    expect(r.content).toBe(clean);
  });

  it("examples는 최대 8개로 제한된다", () => {
    const r = sanitizeMedicalLaw(
      "시술 치료 수술 진단 처방 의사 병원 환자 완치 무조건 정확히 확실히."
    );
    expect(r.examples.length).toBeLessThanOrEqual(8);
    expect(r.totalReplacements).toBeGreaterThan(0);
  });
});

describe("sanitizeMedicalLaw — 금지어 갭 보강(정답·가장)", () => {
  it('"정답은 아니에요" 구문은 "능사는 아니에요"로 자연스럽게 치환된다', () => {
    const r = sanitizeMedicalLaw("도수를 올리는 게 정답은 아니에요.");
    expect(r.content).not.toContain("정답");
    expect(r.content).toContain("능사는 아니에요");
  });

  it('잔여 "정답"도 "답"으로 치환된다', () => {
    const r = sanitizeMedicalLaw("이게 정답입니다.");
    expect(r.content).not.toContain("정답");
    expect(r.content).toContain("답입니다");
  });

  it('최상급 "가장 흔한"은 "특히 흔한"으로 치환된다(워싱 재유입 회귀 차단)', () => {
    const r = sanitizeMedicalLaw("가장 흔한 원인은 건조함이에요.");
    expect(r.content).not.toMatch(/가장 /);
    expect(r.content).toContain("특히 흔한 원인");
  });

  it('복합어 "가장자리"는 보호된다(오탐 금지)', () => {
    const clean = "렌즈 가장자리가 변형됐어요.";
    const r = sanitizeMedicalLaw(clean);
    expect(r.content).toContain("가장자리");
    expect(r.content).toBe(clean);
  });
});
