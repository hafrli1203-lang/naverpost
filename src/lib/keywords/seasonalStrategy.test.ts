import { describe, it, expect } from "vitest";
import {
  inferShopRegion,
  buildKeywordDiscoverySeeds,
  buildKeywordStrategyGuide,
} from "./seasonalStrategy";
import type { Shop, Category } from "@/types";

/**
 * 지역 추론 / 키워드 발굴 시드 / 전략 가이드 회귀 테스트.
 * inferShopRegion·buildKeywordDiscoverySeeds는 순수(정확값), buildKeywordStrategyGuide는
 * now? 주입으로 결정론 검증. 6매장 지역 부착이 깨지면 로컬 노출 전략이 무너진다.
 */

function makeShop(id: string, name = "테스트안경"): Shop {
  return { id, name, blogId: id, rssUrl: "https://x/rss" } as Shop;
}
const progressive: Category = { id: "progressive", name: "누진다초점", subcategories: [] };

describe("inferShopRegion — 6매장 지역 매핑", () => {
  it("알려진 매장 ID는 고정 지역으로 매핑된다", () => {
    expect(inferShopRegion(makeShop("top50jn"))).toBe("장림");
    expect(inferShopRegion(makeShop("jinysgongju"))).toBe("공주");
    expect(inferShopRegion(makeShop("attractiger"))).toBe("김해 장유");
    expect(inferShopRegion(makeShop("leesi7007"))).toBe("대전 충남대");
    expect(inferShopRegion(makeShop("kl1854"))).toBe("심곡");
    expect(inferShopRegion(makeShop("peace9486"))).toBe("진해");
  });

  it("미등록 매장은 이름에서 지역어를 추론한다", () => {
    const region = inferShopRegion(makeShop("unknown", "사상 으뜸50안경"));
    expect(region).toBe("사상");
  });
});

describe("buildKeywordDiscoverySeeds", () => {
  it("지역 시드는 매장 지역의 마지막 토큰을 쓴다(대전 충남대 → 충남대)", () => {
    const seeds = buildKeywordDiscoverySeeds({ shop: makeShop("leesi7007"), category: progressive });
    expect(seeds).toContain("충남대 안경");
    expect(seeds.some((s) => s.startsWith("충남대"))).toBe(true);
  });

  it("카테고리 비지역 시드(누진/노안 등)를 포함한다", () => {
    // 출력은 공백 정규화됨(누진렌즈 적응 → 누진렌즈적응) — 실제 출력에 맞춰 단언.
    const seeds = buildKeywordDiscoverySeeds({ shop: makeShop("top50jn"), category: progressive });
    expect(seeds).toContain("누진렌즈적응");
    expect(seeds).toContain("노안안경");
  });

  it("시드는 비어있지 않고 중복 없는 문자열 배열(25개 이내)", () => {
    const seeds = buildKeywordDiscoverySeeds({ shop: makeShop("top50jn"), category: progressive });
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.length).toBeLessThanOrEqual(25);
    expect(seeds.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
    expect(new Set(seeds).size).toBe(seeds.length); // 중복 없음
  });
});

describe("buildKeywordStrategyGuide — now 주입 결정론", () => {
  it("고정 날짜로 같은 가이드를 만든다", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const a = buildKeywordStrategyGuide({ shop: makeShop("top50jn"), category: progressive, now });
    const b = buildKeywordStrategyGuide({ shop: makeShop("top50jn"), category: progressive, now });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("문자열 가이드를 반환한다", () => {
    const guide = buildKeywordStrategyGuide({
      shop: makeShop("top50jn"),
      category: progressive,
      now: new Date("2026-01-10T00:00:00Z"),
    });
    expect(typeof guide).toBe("string");
  });
});
