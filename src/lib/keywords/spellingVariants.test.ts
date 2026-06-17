import { describe, it, expect } from "vitest";
import { expandSpellingVariants } from "./spellingVariants";

describe("expandSpellingVariants", () => {
  it("외래어 표기 변형을 생성한다(콘택트렌즈 → 콘텍트/컨택트)", () => {
    const out = expandSpellingVariants(["콘택트렌즈 추천"]);
    expect(out).toContain("콘텍트렌즈 추천");
    expect(out).toContain("컨택트렌즈 추천");
  });

  it("띄어쓰기 변형을 생성한다(누진다초점 → 누진 다초점)", () => {
    expect(expandSpellingVariants(["누진다초점 적응"])).toContain(
      "누진 다초점 적응"
    );
  });

  it("선글라스 → 썬글라스 변형을 생성한다", () => {
    expect(expandSpellingVariants(["선글라스 관리"])).toContain("썬글라스 관리");
  });

  it("도메인 밖 키워드는 변형을 만들지 않는다(시드 오염 방지)", () => {
    expect(expandSpellingVariants(["노트북 추천"])).toEqual([]);
  });

  it("입력에 이미 있는 표현(원형/중복)은 결과에서 제외한다", () => {
    const out = expandSpellingVariants(["콘택트렌즈", "콘텍트렌즈"]);
    expect(out).not.toContain("콘택트렌즈");
    expect(out).not.toContain("콘텍트렌즈");
    expect(out).toContain("컨택트렌즈");
  });

  it("결과 개수에 상한이 있다(<= 24)", () => {
    const many = Array.from({ length: 50 }, (_, i) => `콘택트렌즈 ${i}`);
    expect(expandSpellingVariants(many).length).toBeLessThanOrEqual(24);
  });

  it("빈 입력에는 빈 배열을 반환한다", () => {
    expect(expandSpellingVariants([])).toEqual([]);
    expect(expandSpellingVariants(["", "  "])).toEqual([]);
  });
});
