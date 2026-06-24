import type { Category, Shop } from "@/types";
import {
  buildKeywordSeriesTopics,
  planBlogTopics,
  type TopicIntentAxis,
} from "@/lib/topics/topicPlanner";
import { getShopProductHeads } from "@/lib/keywords/productKeywordCatalog";
import {
  getTopExposedKeywordKeys,
  normalizeExposureKeyword,
} from "@/lib/blogops/insights";

/**
 * 시리즈 발행 플래너 (설계: docs/designs/series-planner.md)
 *
 * 한 헤드 키워드를 자기잠식 없이 여러 각도(축)로 다루는 N편 시리즈를 제안한다.
 * topicPlanner의 축 순환 결과를 시리즈 spine으로 쓰고, BlogOps 노출 1~3위 키워드는
 * 자기잠식 가드로 제외한다(BlogOps 다운 시 가드 없이 graceful 진행).
 */

export type SeriesPlanItem = {
  order: number;
  axis: TopicIntentAxis;
  topic: string;
  thesis: string;
  titleAngle: string;
  modifiers: string[];
};

export type SeriesPlan = {
  shopId: string;
  shopName: string;
  categoryId: string;
  categoryName: string;
  headKeyword: string;
  items: SeriesPlanItem[];
  excludedByCannibalization: string[];
  notes: string[];
};

const MAX_COUNT = 8;
const DEFAULT_COUNT = 5;

// 카테고리 표준 헤드 키워드. 매장이 취급 상품을 등록하지 않았을 때의 기본값으로,
// 세부분류(수식어)가 헤드로 잘못 잡히는 것을 막는다.
const CATEGORY_DEFAULT_HEAD: Record<string, string> = {
  progressive: "누진렌즈",
  lenses: "안경렌즈",
  frames: "안경테",
  contacts: "콘택트렌즈",
  "eye-info": "시력검사",
  "glasses-story": "안경관리",
};

function resolveHeadKeyword(params: {
  shop: Shop;
  category: Category;
  headKeyword?: string;
}): string {
  const explicit = (params.headKeyword ?? "").trim();
  if (explicit) return explicit;

  const productHeads = getShopProductHeads({
    shop: params.shop,
    category: params.category,
  });
  if (productHeads.length > 0) return productHeads[0];

  // 폴백: 카테고리 표준 헤드 → 카테고리명. (세부분류는 수식어라 헤드로 쓰지 않는다.)
  return CATEGORY_DEFAULT_HEAD[params.category.id] ?? params.category.name;
}

export async function planKeywordSeries(params: {
  shop: Shop;
  category: Category;
  headKeyword?: string;
  count?: number;
  existingTitles?: string[];
}): Promise<SeriesPlan> {
  const { shop, category } = params;
  const count = Math.max(1, Math.min(MAX_COUNT, params.count ?? DEFAULT_COUNT));
  const headKeyword = resolveHeadKeyword(params);
  const explicitHead = (params.headKeyword ?? "").trim().length > 0;
  const notes: string[] = [];

  // 자기잠식 가드: 노출 1~3위 키워드 키 집합(BlogOps 다운 시 빈 집합).
  const exposedKeys = await getTopExposedKeywordKeys(shop.id);

  // 헤드 키워드를 직접 입력하면 그 키워드가 모든 편 주제에 반영되도록 키워드 주도로 생성한다.
  // 키워드 없이 자동일 때만 카테고리 템플릿(category-diverse)을 폴백으로 쓴다.
  const candidates = explicitHead
    ? buildKeywordSeriesTopics({
        headKeyword,
        category,
        existingTitles: params.existingTitles,
      })
    : planBlogTopics({
        shop,
        category,
        existingTitles: params.existingTitles,
        maxCount: MAX_COUNT * 2,
      });

  const items: SeriesPlanItem[] = [];
  const excludedByCannibalization: string[] = [];
  const usedAxes = new Set<TopicIntentAxis>();

  // 1차: 축 다양성을 우선해 한 축당 한 편씩 채운다(맥락 다각화).
  // 2차: 모자라면 남은 후보로 채운다.
  for (const pass of [1, 2] as const) {
    for (const candidate of candidates) {
      if (items.length >= count) break;
      if (pass === 1 && usedAxes.has(candidate.axis)) continue;

      const primaryModifier = candidate.preferredModifiers[0] ?? "";
      const cannibalKey = normalizeExposureKeyword(`${headKeyword} ${primaryModifier}`);
      if (exposedKeys.has(cannibalKey)) {
        if (!excludedByCannibalization.includes(cannibalKey)) {
          excludedByCannibalization.push(cannibalKey);
        }
        continue;
      }
      // 이미 같은 topic을 담았으면 건너뛴다.
      if (items.some((item) => item.topic === candidate.topic)) continue;

      items.push({
        order: items.length + 1,
        axis: candidate.axis,
        topic: candidate.topic,
        thesis: candidate.thesis,
        titleAngle: candidate.titleAngles[0] ?? "",
        modifiers: candidate.preferredModifiers.slice(0, 6),
      });
      usedAxes.add(candidate.axis);
    }
    if (items.length >= count) break;
  }

  notes.push(
    `"${headKeyword}" 주제 권위를 쌓기 위해 ${items.length}편을 서로 다른 검색 의도 축으로 배치했습니다.`
  );
  if (excludedByCannibalization.length > 0) {
    notes.push(
      `이미 검색 상위(1~3위)에 노출 중인 키워드 ${excludedByCannibalization.length}개는 자기잠식을 막기 위해 시리즈에서 제외했습니다.`
    );
  }
  if (items.length < count) {
    notes.push(
      `요청한 ${count}편 중 ${items.length}편만 생성됐습니다(축 다양성·자기잠식 가드로 후보가 부족).`
    );
  }

  return {
    shopId: shop.id,
    shopName: shop.name,
    categoryId: category.id,
    categoryName: category.name,
    headKeyword,
    items,
    excludedByCannibalization,
    notes,
  };
}
