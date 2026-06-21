import { describe, it, expect } from "vitest";
import {
  planBlogTopics,
  planBlogTopic,
  planMonthlyCategorySlots,
  buildKeywordSeriesTopics,
} from "./topicPlanner";
import type { Shop, Category } from "@/types";

/**
 * 주제 추천 / 월간 카테고리 슬롯 회귀 테스트.
 * ※ 내부 rotation이 현재 월(getMonthKey=new Date())에 의존하므로 정확한 값이 아니라
 *   시간 독립 불변식(개수·구조·userTopic 단축·슬롯 번호·결정론)을 고정한다.
 */

const shop: Shop = {
  id: "top50jn",
  name: "탑안경",
  blogId: "top50jn",
  rssUrl: "https://example.com/rss",
} as Shop;

const category: Category = { id: "progressive", name: "누진다초점", subcategories: [] };
const categories: Category[] = [
  { id: "lenses", name: "안경렌즈", subcategories: [] },
  { id: "frames", name: "안경테", subcategories: [] },
  { id: "progressive", name: "누진다초점", subcategories: [] },
  { id: "contacts", name: "콘택트렌즈", subcategories: [] },
  { id: "eye-info", name: "눈정보", subcategories: [] },
  { id: "glasses-story", name: "안경이야기", subcategories: [] },
];

describe("planBlogTopics", () => {
  it("주제 계획을 maxCount 이하로 반환하고 각 계획에 핵심 필드가 있다", () => {
    const plans = planBlogTopics({ shop, category, maxCount: 5 });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(5);
    for (const p of plans) {
      expect(p.topic).toBeTruthy();
      expect(p.thesis).toBeTruthy();
      expect(p.axis).toBeTruthy();
    }
  });

  it("userTopic이 주어지면 그 주제로 단일 계획을 만든다(결정론)", () => {
    const plans = planBlogTopics({ shop, category, userTopic: "누진렌즈 첫 적응기" });
    expect(plans).toHaveLength(1);
    expect(plans[0].topic).toContain("누진렌즈 첫 적응기");
  });

  it("같은 입력은 같은 출력(같은 월 내 결정론)", () => {
    const a = planBlogTopics({ shop, category, maxCount: 5 });
    const b = planBlogTopics({ shop, category, maxCount: 5 });
    expect(a).toEqual(b);
  });
});

describe("buildKeywordSeriesTopics (헤드 키워드 주도)", () => {
  const lenses: Category = { id: "lenses", name: "안경렌즈", subcategories: [] };

  it("모든 편 주제에 헤드 키워드가 들어간다(키워드가 실제 반영됨)", () => {
    const plans = buildKeywordSeriesTopics({ headKeyword: "편광렌즈", category: lenses });
    expect(plans.length).toBeGreaterThanOrEqual(5);
    for (const p of plans) {
      expect(p.topic).toContain("편광렌즈");
    }
  });

  it("편마다 검색 의도 축이 서로 다르다(시리즈 다각화)", () => {
    const plans = buildKeywordSeriesTopics({ headKeyword: "편광렌즈", category: lenses });
    const axes = plans.map((p) => p.axis);
    expect(new Set(axes).size).toBe(axes.length);
  });

  it("키워드가 다르면 주제도 다르다(카테고리 고정 템플릿이 아님)", () => {
    const a = buildKeywordSeriesTopics({ headKeyword: "편광렌즈", category: lenses });
    const b = buildKeywordSeriesTopics({ headKeyword: "변색렌즈", category: lenses });
    expect(a[0].topic).not.toBe(b[0].topic);
    expect(b.every((p) => p.topic.includes("변색렌즈"))).toBe(true);
  });

  it("수식어가 편(축)마다 다르고 무관한 카테고리어가 섞이지 않는다", () => {
    const plans = buildKeywordSeriesTopics({ headKeyword: "편광렌즈", category: lenses });
    // 편마다 수식어 묶음이 달라야 한다(6편 동일 문제 해소).
    const joined = plans.map((p) => p.preferredModifiers.join(","));
    expect(new Set(joined).size).toBe(joined.length);
    // 카테고리 하위분류에서 새던 무관어가 더는 들어가지 않는다.
    const all = plans.flatMap((p) => p.preferredModifiers);
    expect(all).not.toContain("압축");
    expect(all).not.toContain("굴절률");
  });

  it("이미 발행한 제목과 겹치는 축은 거른다", () => {
    const plans = buildKeywordSeriesTopics({
      headKeyword: "편광렌즈",
      category: lenses,
      existingTitles: ["편광렌즈 고를 때 비교 기준"],
    });
    expect(plans.some((p) => p.topic === "편광렌즈 고를 때 비교 기준")).toBe(false);
  });
});

describe("planBlogTopic (단수)", () => {
  it("항상 하나의 계획을 반환한다", () => {
    const plan = planBlogTopic({ shop, category });
    expect(plan.topic).toBeTruthy();
    expect(plan.axis).toBeTruthy();
  });
});

describe("planMonthlyCategorySlots", () => {
  it("요청한 슬롯 수만큼 1..N 번호로 반환한다", () => {
    const slots = planMonthlyCategorySlots({ shop, categories, slotCount: 10 });
    expect(slots).toHaveLength(10);
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("각 슬롯은 제공된 카테고리 중 하나를 사용한다", () => {
    const validIds = new Set(categories.map((c) => c.id));
    const slots = planMonthlyCategorySlots({ shop, categories, slotCount: 6 });
    for (const s of slots) {
      expect(validIds.has(s.categoryId)).toBe(true);
      expect(s.topic).toBeTruthy();
    }
  });

  it("6슬롯이면 6개 카테고리를 모두 한 번씩 쓴다(중복 쏠림 방지)", () => {
    const slots = planMonthlyCategorySlots({ shop, categories, slotCount: 6 });
    expect(new Set(slots.map((s) => s.categoryId)).size).toBe(6);
  });
});
