import { describe, expect, it } from "vitest";
import { isAwkwardGeneratedTitle } from "./titleGate";

/**
 * 제목 결정론 게이트 회귀 테스트.
 * 최우선 불변식: **오탐 0** — 자연스러운 손님 검색형 제목은 절대 막지 않는다.
 * (좋은 제목을 막으면 후보가 하드코딩 폴백으로 떨어져 품질이 붕괴된다.)
 */

describe("isAwkwardGeneratedTitle — 차단(true)", () => {
  it("쉼표 포함 제목", () => {
    expect(isAwkwardGeneratedTitle("안경 고르기, 렌즈 선택")).toBe(true);
  });
  it("이모지 포함", () => {
    expect(isAwkwardGeneratedTitle("안경 고르는 법 ✨")).toBe(true);
  });
  it("번호목록/불릿 마커로 시작", () => {
    expect(isAwkwardGeneratedTitle("1) 안경 고르는 법")).toBe(true);
    expect(isAwkwardGeneratedTitle("- 렌즈 선택 기준이 뭔지")).toBe(true);
  });
  it("같은 단어 반복(스팸)", () => {
    expect(isAwkwardGeneratedTitle("도수 확인 확인 방법")).toBe(true);
    expect(isAwkwardGeneratedTitle("렌즈 관리 관리 요령")).toBe(true);
  });
  it("'A와 B 확인/점검' 키워드 나열형", () => {
    // 점검은 MECHANICAL 목록엔 없고 inline 규칙이 잡는다.
    expect(isAwkwardGeneratedTitle("안경테와 렌즈 점검")).toBe(true);
  });
  it("슬래시 나열", () => {
    expect(isAwkwardGeneratedTitle("안경 / 렌즈 비교")).toBe(true);
  });
  it("키워드를 '이름'으로 오해한 비문", () => {
    expect(isAwkwardGeneratedTitle("변색렌즈 이름에 쓰기 전")).toBe(true);
  });

  describe("v27 (1) 막연한 채움 끝맺음", () => {
    it("'~보는 부분' / '~확인할 순서'로 끝남", () => {
      expect(isAwkwardGeneratedTitle("안경 고를 때 보는 부분")).toBe(true);
      expect(isAwkwardGeneratedTitle("렌즈 도수 확인할 순서")).toBe(true);
    });
  });

  describe("v27 (2) 미완성 조건절 종결", () => {
    it("'~다면 / ~려면'으로 끊김", () => {
      expect(isAwkwardGeneratedTitle("안경이 자꾸 흘러내린다면")).toBe(true);
      expect(isAwkwardGeneratedTitle("도수를 정확히 맞추려면")).toBe(true);
    });
  });

  describe("v27 (3) 비문·오타", () => {
    it("'어떡할' / '콘안경' 같은 깨진 표현", () => {
      expect(isAwkwardGeneratedTitle("안경 어떡할 때 바꾸나")).toBe(true);
      expect(isAwkwardGeneratedTitle("콘안경 추천")).toBe(true);
    });
  });

  describe("v27 (4) 전문용어 결정론 차단", () => {
    it("손님이 검색하지 않는 전문어", () => {
      expect(isAwkwardGeneratedTitle("아베수 높은 렌즈")).toBe(true);
      expect(isAwkwardGeneratedTitle("명시야 넓은 누진")).toBe(true);
      expect(isAwkwardGeneratedTitle("굴절률 1.67 렌즈")).toBe(true);
      expect(isAwkwardGeneratedTitle("50nm 차단 렌즈")).toBe(true);
      expect(isAwkwardGeneratedTitle("누진대 길이 측정")).toBe(true);
      expect(isAwkwardGeneratedTitle("아이포인트 측정법")).toBe(true);
      expect(isAwkwardGeneratedTitle("함수율 높은 렌즈")).toBe(true);
      expect(isAwkwardGeneratedTitle("색수차 적은 렌즈")).toBe(true);
    });
  });
});

describe("isAwkwardGeneratedTitle — 통과(false), 오탐 0 불변식", () => {
  it("자연스러운 손님 검색형 제목은 통과한다", () => {
    const good = [
      "안경 고르는 법",
      "누진렌즈 적응 방법",
      "안경테 얼굴형 추천",
      "블루라이트 차단 효과",
      "콘택트렌즈 착용 시간",
      "변색렌즈 실내 사용법",
      "안구건조 증상 완화",
      "뿔테안경 인상 변화",
      "안경 흘러내림 원인",
      "노안 돋보기 차이",
    ];
    for (const title of good) {
      expect(isAwkwardGeneratedTitle(title), `오탐: "${title}"`).toBe(false);
    }
  });

  it("상품어가 전문어 규칙에 오탐되지 않는다(코드 주석이 보장한 핵심)", () => {
    // 고굴절 ≠ 굴절률, 누진 ≠ 누진대, 함수(렌즈) ≠ 함수율
    expect(isAwkwardGeneratedTitle("고굴절렌즈 두께 비교")).toBe(false);
    expect(isAwkwardGeneratedTitle("누진다초점 렌즈 시야")).toBe(false);
    expect(isAwkwardGeneratedTitle("압축렌즈 무게 차이")).toBe(false);
  });

  it("'~보는 법 / ~고르는 법 / ~줄이는 방법'은 자연스러우므로 통과", () => {
    expect(isAwkwardGeneratedTitle("렌즈 두께 줄이는 방법")).toBe(false);
    expect(isAwkwardGeneratedTitle("내 얼굴형 안경 고르는 법")).toBe(false);
    expect(isAwkwardGeneratedTitle("안경 흘러내림 줄이는 법")).toBe(false);
  });
});
