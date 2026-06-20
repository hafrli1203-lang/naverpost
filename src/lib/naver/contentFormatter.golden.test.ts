import { describe, it, expect } from "vitest";
import { formatForNaverExport, buildNaverPlainText } from "./contentFormatter";

/**
 * 골든-런 회귀 고정.
 *
 * 파이프라인 최종 산출물 = "붙여넣기용 export"(사람이 네이버에 붙여넣는 결과물).
 * formatForNaverExport(rich HTML) / buildNaverPlainText(평문)은 순수 결정론 함수라,
 * 대표 원고 1개의 전체 출력을 스냅샷으로 고정한다. 서식/문단분리/표/이미지마커 로직이
 * 의도치 않게 바뀌면(=붙여넣기 품질 회귀) 이 테스트가 즉시 깨진다.
 *
 * 의도적 변경 시에만 `vitest -u`로 스냅샷 갱신할 것.
 */

// 대표 원고: 도입 문단 + 소제목 2개 + 표 + 불릿 + 일반 문단(한 덩어리 → 문장 분리 대상).
const GOLDEN_ARTICLE = {
  title: "고굴절렌즈 두께 줄이는 법",
  content: `안경을 새로 맞출 때 렌즈 두께가 신경 쓰이는 분이 많습니다. 도수가 높을수록 렌즈 가장자리가 두꺼워져 인상이 답답해 보이기 쉽습니다. 오늘은 매장에서 실제로 안내드리는 두께 줄이는 기준을 정리합니다.

## 굴절률을 먼저 본다

같은 도수라도 굴절률이 높은 렌즈를 쓰면 가장자리가 얇아집니다. 다만 굴절률이 높아질수록 가격도 올라가니 도수에 맞춰 고르는 편이 합리적입니다.

| 도수 구간 | 추천 굴절률 | 비고 |
| --- | --- | --- |
| 약도수 | 1.60 | 무난한 두께 |
| 중도수 | 1.67 | 두께와 가격 균형 |
| 고도수 | 1.74 | 가장 얇음 |

## 프레임 선택도 중요하다

렌즈만큼 테 선택도 두께 체감을 좌우합니다. 아래 기준을 참고하세요.

- 렌즈 들어가는 공간이 작은 테를 고른다
- 금속테보다 뿔테가 두꺼운 가장자리를 덜 드러낸다
- 동그란 형태보다 각진 형태가 두께를 덜 강조한다

정리하면 굴절률과 테를 함께 맞추는 것이 핵심입니다. 매장에서 도수를 확인한 뒤 예산에 맞는 조합을 안내해 드립니다.`,
};

describe("골든-런: 붙여넣기용 export 회귀 고정", () => {
  it("formatForNaverExport(rich HTML) 전체 출력 고정", () => {
    const html = formatForNaverExport({ ...GOLDEN_ARTICLE, imageCount: 3 });
    expect(html).toMatchSnapshot();
  });

  it("buildNaverPlainText(평문 폴백) 전체 출력 고정", () => {
    const plain = buildNaverPlainText({ ...GOLDEN_ARTICLE, imageCount: 3 });
    expect(plain).toMatchSnapshot();
  });

  // 스냅샷이 갱신돼도 깨지지 않아야 할 핵심 계약(의도 문서화).
  it("핵심 계약 불변식", () => {
    const html = formatForNaverExport({ ...GOLDEN_ARTICLE, imageCount: 3 });
    const plain = buildNaverPlainText({ ...GOLDEN_ARTICLE, imageCount: 3 });

    // 제목이 두 출력 모두에 포함
    expect(html).toContain("고굴절렌즈 두께 줄이는 법");
    expect(plain.startsWith("고굴절렌즈 두께 줄이는 법")).toBe(true);

    // 이미지 자리 마커 3개
    expect((html.match(/사진 \d+ 자리/g) ?? []).length).toBe(3);
    expect((plain.match(/\[사진 \d+\]/g) ?? []).length).toBe(3);

    // 평문에 마크다운 잔재(##, |, ---) 없음, 표는 "셀 / 셀"로 변환
    expect(plain).not.toMatch(/^#{1,3}\s/m);
    expect(plain).not.toMatch(/^\|/m);
    expect(plain).toContain("약도수 / 1.60 / 무난한 두께");
    // 불릿은 • 로
    expect(plain).toContain("• 렌즈 들어가는 공간이 작은 테를 고른다");
  });
});
