import { describe, it, expect } from "vitest";
import {
  parseShopList,
  seasonalDiscoveryResultSchema,
  seriesPlanSchema,
} from "./apiResponseSchemas";

/** 클라이언트 응답 경계 검증. 형식이 깨지면 빈손/실패로 폴백하는지 고정. */

const validShop = { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" };

describe("parseShopList", () => {
  it("유효 배열은 그대로 통과(선택 필드 포함)", () => {
    const out = parseShopList([{ ...validShop, mainProducts: ["누진"] }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("top50jn");
  });
  it("배열이 아니거나 필수 필드 누락이면 빈 배열", () => {
    expect(parseShopList(null)).toEqual([]);
    expect(parseShopList("x")).toEqual([]);
    expect(parseShopList([{ id: "a" }])).toEqual([]); // name/blogId/rssUrl 누락
  });
});

describe("seasonalDiscoveryResultSchema", () => {
  const valid = {
    shopId: "top50jn",
    month: 7,
    volumeTop: [],
    issueTop: [],
    notes: [],
  };
  it("trendingNow 없이도 통과(선택)", () => {
    expect(seasonalDiscoveryResultSchema.safeParse(valid).success).toBe(true);
  });
  it("필수 리스트 누락이면 실패", () => {
    const { volumeTop, ...broken } = valid;
    void volumeTop;
    expect(seasonalDiscoveryResultSchema.safeParse(broken).success).toBe(false);
  });
});

describe("seriesPlanSchema", () => {
  it("유효 시리즈 계획은 통과", () => {
    const valid = {
      shopName: "탑안경",
      categoryName: "안경렌즈",
      headKeyword: "편광렌즈",
      items: [
        {
          order: 1,
          axis: "comparison",
          topic: "편광렌즈 고를 때 비교 기준",
          thesis: "...",
          titleAngle: "선택 전 비교",
          modifiers: ["종류"],
        },
      ],
      excludedByCannibalization: [],
      notes: [],
    };
    expect(seriesPlanSchema.safeParse(valid).success).toBe(true);
  });
});
