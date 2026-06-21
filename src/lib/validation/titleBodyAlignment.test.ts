import { describe, it, expect } from "vitest";
import { analyzeTitleBodyAlignment } from "./titleBodyAlignment";

/**
 * 제목-본문 일치 분석 회귀 테스트(순수 함수, CLI 0).
 * 제목/키워드가 본문에 실제로 등장하는지(검색 노출 전제)와 표/인용/캡션/첨부 감지.
 */

describe("analyzeTitleBodyAlignment", () => {
  it("제목·키워드가 본문에 모두 있으면 누락 0", () => {
    const r = analyzeTitleBodyAlignment({
      title: "누진렌즈 적응",
      content: "누진렌즈 적응에 대한 글입니다. 누진렌즈 적응은 시간이 걸립니다.",
      keywords: ["누진렌즈 적응"],
    });
    expect(r.missingTitleKeywordCoverage).toHaveLength(0);
    expect(r.titleKeywordCoverage).toContain("누진렌즈 적응");
  });

  it("본문에 없는 키워드를 missing으로 잡고 high 이슈를 만든다", () => {
    const r = analyzeTitleBodyAlignment({
      title: "누진렌즈 적응",
      content: "전혀 다른 내용입니다.",
      keywords: ["누진렌즈 적응", "안경테 소재"],
    });
    expect(r.missingTitleKeywordCoverage).toEqual(
      expect.arrayContaining(["누진렌즈 적응", "안경테 소재"])
    );
    expect(r.issues.some((i) => i.code === "missing-title-body-activation")).toBe(true);
  });

  it("표가 있으면 hasTableText true, 없으면 low 이슈", () => {
    const withTable = analyzeTitleBodyAlignment({
      title: "t",
      content: "| 항목 | 값 |\n| --- | --- |\n| a | b |\n제목 t",
      keywords: [],
    });
    expect(withTable.hasTableText).toBe(true);

    const noTable = analyzeTitleBodyAlignment({ title: "t", content: "t 본문만", keywords: [] });
    expect(noTable.hasTableText).toBe(false);
    expect(noTable.issues.some((i) => i.code === "missing-table-text")).toBe(true);
  });

  it("인용문을 감지한다", () => {
    const r = analyzeTitleBodyAlignment({
      title: "t",
      content: "t\n> 인용된 문장입니다.",
      keywords: [],
    });
    expect(r.hasQuoteText).toBe(true);
  });
});
