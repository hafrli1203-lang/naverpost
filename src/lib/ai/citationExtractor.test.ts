import { describe, it, expect } from "vitest";
import { extractCitationsFromContent, mergeCitations } from "./citationExtractor";

describe("extractCitationsFromContent", () => {
  it("기관명 + 수치가 같은 문장에 있으면 인용으로 추출한다", () => {
    const body =
      "식약처 기준으로는 자외선 차단 렌즈가 380nm까지 차단해야 합니다.";
    const cites = extractCitationsFromContent(body);
    expect(cites).toHaveLength(1);
    expect(cites[0].institution).toBe("식약처");
  });

  it("한국소비자원 직접형을 연도와 함께 잡는다(2026-06 {0,10} 버그픽스 회귀가드)", () => {
    const body =
      "한국소비자원 2023년 자료를 보면 누진렌즈 부적응 상담의 약 38%가 피팅 문제였어요.";
    const cites = extractCitationsFromContent(body);
    expect(cites).toHaveLength(1);
    expect(cites[0].institution).toBe("한국소비자원");
    expect(cites[0].year).toBe("2023년");
  });

  it("대한안경사협회 직접형을 잡는다", () => {
    const body = "대한안경사협회 자료에 따르면 적응 기간은 보통 2주 정도예요.";
    const cites = extractCitationsFromContent(body);
    expect(cites.map((c) => c.institution)).toContain("대한안경사협회");
  });

  it("제조사 자료(자이스/에실로)를 잡는다(2026-06 제조사 패턴 추가)", () => {
    const zeiss = extractCitationsFromContent(
      "자이스 기술 자료에서는 코팅 내구성이 약 18개월 유지된다고 합니다."
    );
    expect(zeiss.map((c) => c.institution.replace(/\s+/g, ""))).toContain(
      "자이스기술자료"
    );
    const essilor = extractCitationsFromContent(
      "에실로 백서에 따르면 누진렌즈 초기 적응에 평균 14일 정도가 걸립니다."
    );
    expect(essilor.length).toBeGreaterThan(0);
  });

  it("ISO 표준은 같은 문장에 수치 사실이 있을 때 잡는다", () => {
    const body = "ISO 8980 기준에서 자외선 차단은 380nm까지 권고됩니다.";
    const cites = extractCitationsFromContent(body);
    expect(cites.length).toBeGreaterThan(0);
  });

  it("수치 없는 문장은 인용으로 보지 않는다(오탐 방지)", () => {
    const body =
      "누진렌즈는 처음엔 어색해요. 보통 시간이 지나면 익숙해진답니다.";
    expect(extractCitationsFromContent(body)).toEqual([]);
  });

  it("기관명 없는 수치 문장은 인용으로 보지 않는다(오탐 방지)", () => {
    const body = "적응 기간은 보통 2주 정도 걸리는 경우가 많아요.";
    expect(extractCitationsFromContent(body)).toEqual([]);
  });

  it("같은 기관은 한 번만, 최대 6건까지 수집한다", () => {
    const body = Array.from(
      { length: 10 },
      (_, i) => `${i % 2 ? "식약처" : "통계청"}는 ${i + 1}0% 라고 발표했습니다.`
    ).join("\n");
    const cites = extractCitationsFromContent(body);
    const institutions = new Set(cites.map((c) => c.institution));
    expect(institutions.size).toBe(cites.length); // 중복 없음
    expect(cites.length).toBeLessThanOrEqual(6);
  });
});

describe("mergeCitations", () => {
  it("기관명 기준으로 중복 제거하고 최대 6건까지 병합한다", () => {
    const a = [{ institution: "식약처", fact: "a" }];
    const b = [
      { institution: "식약처", fact: "b" },
      { institution: "통계청", fact: "c" },
    ];
    const merged = mergeCitations(a, b);
    expect(merged.map((c) => c.institution)).toEqual(["식약처", "통계청"]);
  });
});
