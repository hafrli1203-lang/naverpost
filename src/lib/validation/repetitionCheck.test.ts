import { describe, it, expect } from "vitest";
import { findOverusedWords } from "./repetitionCheck";

describe("findOverusedWords", () => {
  it("20회 이상 반복된 한글 단어를 잡는다(스터핑/뷰누락 백스톱)", () => {
    const text = Array.from({ length: 22 }, () => "콘택트렌즈").join(" ");
    const out = findOverusedWords(text);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ word: "콘택트렌즈", count: 22 });
  });

  it("19회는 잡지 않는다(임계값 경계 = 20)", () => {
    const text = Array.from({ length: 19 }, () => "안경렌즈").join(" ");
    expect(findOverusedWords(text)).toEqual([]);
  });

  it("개수 내림차순으로 정렬한다", () => {
    const text = [
      ...Array(25).fill("렌즈"),
      ...Array(21).fill("안경"),
    ].join(" ");
    const out = findOverusedWords(text);
    expect(out.map((w) => w.word)).toEqual(["렌즈", "안경"]);
  });

  it("빈/비문자열 입력에 안전하다", () => {
    expect(findOverusedWords("")).toEqual([]);
    // @ts-expect-error 런타임 방어 확인
    expect(findOverusedWords(null)).toEqual([]);
  });
});
