import { describe, it, expect } from "vitest";
import { combineKeywords } from "./keywordCombiner";

/**
 * 키워드 조합 생성기 회귀 테스트(순수·결정론, CLI/random 0).
 * 키워드 파이프라인의 폴백/확장 핵심. 항상 유효한 2단어 조합만, 중복 없이, 한도 내로.
 */

const isTwoWord = (s: string) => s.trim().split(/\s+/).length === 2;
const head = (s: string) => s.trim().split(/\s+/)[0];

describe("combineKeywords", () => {
  it("유효한 head에 대해 조합 후보를 생성한다", () => {
    const out = combineKeywords({ categoryId: "progressive", coreHeads: ["누진렌즈"] });
    expect(out.length).toBeGreaterThan(0);
  });

  it("모든 main/sub 키워드는 'head 수식어' 2단어 형태", () => {
    const out = combineKeywords({ categoryId: "progressive", coreHeads: ["누진렌즈"] });
    for (const o of out) {
      expect(isTwoWord(o.mainKeyword)).toBe(true);
      expect(isTwoWord(o.subKeyword1)).toBe(true);
      expect(isTwoWord(o.subKeyword2)).toBe(true);
      // main/sub는 같은 head를 공유
      expect(head(o.subKeyword1)).toBe(head(o.mainKeyword));
      expect(head(o.subKeyword2)).toBe(head(o.mainKeyword));
    }
  });

  it("수식어가 head와 같지 않다(‘누진렌즈 누진렌즈’ 금지)", () => {
    const out = combineKeywords({ categoryId: "progressive", coreHeads: ["누진렌즈"] });
    for (const o of out) {
      const [h, m] = o.mainKeyword.trim().split(/\s+/);
      expect(h).not.toBe(m);
    }
  });

  it("main 키워드는 중복되지 않는다", () => {
    const out = combineKeywords({ categoryId: "lenses", coreHeads: ["안경렌즈", "변색렌즈"] });
    const mains = out.map((o) => o.mainKeyword);
    expect(new Set(mains).size).toBe(mains.length);
  });

  it("maxCandidates 한도를 넘지 않는다", () => {
    const out = combineKeywords({
      categoryId: "frames",
      coreHeads: ["안경테", "티타늄안경", "뿔테"],
      maxCandidates: 4,
    });
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("maxModifiersPerHead가 head당 조합 수를 제한한다", () => {
    const out = combineKeywords({
      categoryId: "progressive",
      coreHeads: ["누진렌즈"],
      maxModifiersPerHead: 2,
    });
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it("결정론적이다(같은 입력 → 같은 출력)", () => {
    const params = { categoryId: "contacts", coreHeads: ["원데이렌즈"] };
    expect(combineKeywords(params)).toEqual(combineKeywords(params));
  });

  it("빈 head 또는 2어절 head는 후보를 만들지 않는다", () => {
    expect(combineKeywords({ categoryId: "frames", coreHeads: [] })).toHaveLength(0);
    // '누진 렌즈'는 단일 토큰이 아니라 head로 채택되지 않는다
    expect(combineKeywords({ categoryId: "frames", coreHeads: ["누진 렌즈"] })).toHaveLength(0);
  });
});
