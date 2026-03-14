import Parser from "rss-parser";
import { getShops } from "@/lib/data/shops";

const parser = new Parser();

export async function fetchBlogTitles(targetShopId: string): Promise<{
  forbiddenList: string[];
  referenceList: string[];
}> {
  const shops = await getShops();
  const results = await Promise.allSettled(
    shops.map(async (shop) => {
      const feed = await parser.parseURL(shop.rssUrl);
      const titles = (feed.items ?? [])
        .map((item) => item.title ?? "")
        .filter(Boolean);
      return { shopId: shop.id, titles };
    })
  );

  const forbiddenSet = new Set<string>();
  const referenceSet = new Set<string>();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { shopId, titles } = result.value;
    if (shopId === targetShopId) {
      titles.forEach((t) => forbiddenSet.add(t));
    } else {
      titles.forEach((t) => referenceSet.add(t));
    }
  }

  return {
    forbiddenList: Array.from(forbiddenSet),
    referenceList: Array.from(referenceSet),
  };
}
