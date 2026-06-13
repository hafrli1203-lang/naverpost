"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Layers } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import type { Shop } from "@/types";

type SeriesPlanItem = {
  order: number;
  axis: string;
  topic: string;
  thesis: string;
  titleAngle: string;
  modifiers: string[];
};

type SeriesPlan = {
  shopName: string;
  categoryName: string;
  headKeyword: string;
  items: SeriesPlanItem[];
  excludedByCannibalization: string[];
  notes: string[];
};

const AXIS_LABEL: Record<string, string> = {
  problem: "문제형",
  comparison: "비교형",
  verification: "검사형",
  lifestyle: "생활형",
  visit: "방문형",
  product: "상품형",
};

export function SeriesPlanner() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [categoryId, setCategoryId] = useState(CATEGORIES[0]?.id ?? "");
  const [headKeyword, setHeadKeyword] = useState("");
  const [count, setCount] = useState(5);
  const [plan, setPlan] = useState<SeriesPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const list = (json.data as Shop[]) ?? [];
          setShops(list);
          setShopId((prev) => prev || list[0]?.id || "");
        }
      })
      .catch(() => {});
  }, []);

  async function generate() {
    if (!shopId || !categoryId) {
      setError("매장과 카테고리를 선택해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/topics/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          categoryId,
          headKeyword: headKeyword.trim() || undefined,
          count,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "시리즈 계획에 실패했습니다.");
      }
      setPlan(json.data as SeriesPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시리즈 계획 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-teal-500" />
          시리즈 발행 플래너
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          한 헤드 키워드를 여러 검색 의도 축으로 나눠 시리즈로 쌓으면 주제 권위(C-Rank 맥락)가
          누적됩니다. 이미 1~3위 노출 중인 키워드는 자기잠식 방지로 제외돼요.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            value={headKeyword}
            onChange={(e) => setHeadKeyword(e.target.value)}
            placeholder="헤드 키워드(선택, 예: 누진렌즈)"
            className="sm:col-span-2"
          />
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}편
              </option>
            ))}
          </select>
        </div>

        <Button onClick={generate} disabled={isLoading} className="w-full gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
          {isLoading ? "계획 중..." : "시리즈 계획 생성"}
        </Button>

        {error && <p className="text-xs text-orange-600">{error}</p>}

        {plan && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="bg-teal-100 text-teal-700">
                {plan.headKeyword}
              </Badge>
              <span>
                {plan.shopName} · {plan.categoryName} · {plan.items.length}편
              </span>
            </div>

            {plan.items.map((item) => (
              <div key={item.order} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                    {item.order}
                  </span>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[11px]">
                    {AXIS_LABEL[item.axis] ?? item.axis}
                  </Badge>
                  <p className="text-sm font-medium text-slate-800">{item.topic}</p>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.thesis}</p>
                {item.modifiers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.modifiers.map((m) => (
                      <Badge
                        key={m}
                        variant="secondary"
                        className="bg-slate-50 text-slate-500 text-[10px]"
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {plan.notes.map((note, i) => (
              <p key={i} className="text-[11px] leading-4 text-muted-foreground">
                - {note}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
