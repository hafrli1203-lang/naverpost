/**
 * Smoke + regression guard for the Naver paste-export flow — the tool's final
 * deliverable (draft -> rich HTML copy / plain-text fallback). Pure functions,
 * no external calls. Verifies the flow a daily user relies on actually works.
 */
import { describe, it, expect } from "vitest";
import { formatForNaverExport, buildNaverPlainText } from "./contentFormatter";

const sample = {
  title: "겨울철 안경 렌즈 김서림 방지 5가지 방법",
  content: [
    "## 김서림 왜 생길까",
    "실내외 온도차로 렌즈 표면에 습기가 맺힙니다.",
    "",
    "## 해결 방법",
    "- 김서림 방지 코팅 렌즈 선택",
    "- 전용 클리너 사용",
    "",
    "| 방법 | 비용 |",
    "| --- | --- |",
    "| 코팅 렌즈 | 중간 |",
    "| 클리너 | 저렴 |",
  ].join("\n"),
  imageCount: 2,
};

describe("Naver export flow (paste-ready output)", () => {
  it("formatForNaverExport returns rich HTML with a title and image markers", () => {
    const rich = formatForNaverExport(sample);
    expect(rich).toContain("<h1");
    expect(rich).toContain(sample.title);
    expect(rich).toContain("사진 1"); // image placeholder marker
    expect(rich.length).toBeGreaterThan(200);
  });

  it("buildNaverPlainText returns paste-fallback text with title, bullets, table cells, image markers", () => {
    const plain = buildNaverPlainText(sample);
    expect(plain.startsWith(sample.title)).toBe(true);
    expect(plain).toContain("•"); // list converted to bullet
    expect(plain).toContain("코팅 렌즈 / 중간"); // table row flattened to "cell / cell"
    expect(plain).toContain("[사진"); // image placeholder
  });
});
