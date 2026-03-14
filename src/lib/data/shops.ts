import fs from "fs/promises";
import path from "path";
import type { Shop } from "@/types";

const SHOPS_FILE = path.join(process.cwd(), "data", "shops.json");

export async function getShops(): Promise<Shop[]> {
  try {
    const raw = await fs.readFile(SHOPS_FILE, "utf-8");
    return JSON.parse(raw) as Shop[];
  } catch {
    return [];
  }
}

export async function getShopById(shopId: string): Promise<Shop | null> {
  const shops = await getShops();
  return shops.find((s) => s.id === shopId) ?? null;
}

export async function addShop(shop: Shop): Promise<Shop[]> {
  const shops = await getShops();
  const exists = shops.some((s) => s.id === shop.id);
  if (exists) throw new Error(`이미 존재하는 ID입니다: ${shop.id}`);
  shops.push(shop);
  await fs.writeFile(SHOPS_FILE, JSON.stringify(shops, null, 2), "utf-8");
  return shops;
}

export async function updateShop(shopId: string, updates: Partial<Shop>): Promise<Shop[]> {
  const shops = await getShops();
  const idx = shops.findIndex((s) => s.id === shopId);
  if (idx < 0) throw new Error(`존재하지 않는 매장입니다: ${shopId}`);
  shops[idx] = { ...shops[idx], ...updates, id: shopId };
  await fs.writeFile(SHOPS_FILE, JSON.stringify(shops, null, 2), "utf-8");
  return shops;
}

export async function deleteShop(shopId: string): Promise<Shop[]> {
  const shops = await getShops();
  const filtered = shops.filter((s) => s.id !== shopId);
  if (filtered.length === shops.length) throw new Error(`존재하지 않는 매장입니다: ${shopId}`);
  await fs.writeFile(SHOPS_FILE, JSON.stringify(filtered, null, 2), "utf-8");
  return filtered;
}
