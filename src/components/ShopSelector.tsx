"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES } from "@/lib/constants";
import { Loader2, PenLine, Sparkles, Settings } from "lucide-react";
import type { Shop } from "@/types";

interface ShopSelectorProps {
  shops: Shop[];
  onStart: (shopId: string, categoryId: string, topic: string) => void;
  isLoading: boolean;
}

export function ShopSelector({ shops, onStart, isLoading }: ShopSelectorProps) {
  const [shopId, setShopId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [topic, setTopic] = useState("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const canSubmit = shopId && categoryId && !isLoading;

  // 매장 + 카테고리 선택 시 자동 주제 추천
  useEffect(() => {
    if (!shopId || !categoryId) {
      setSuggestedTopics([]);
      return;
    }

    setIsSuggesting(true);
    setSuggestedTopics([]);

    fetch("/api/topics/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, categoryId }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setSuggestedTopics(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setIsSuggesting(false));
  }, [shopId, categoryId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onStart(shopId, categoryId, topic.trim());
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <PenLine className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">블로그 자동 작성</CardTitle>
          <CardDescription className="text-base mt-1">
            안경원과 카테고리를 선택하고 주제를 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="shop-select">안경원 선택</Label>
                <a
                  href="/admin"
                  className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  관리
                </a>
              </div>
              <Select value={shopId} onValueChange={(v) => v && setShopId(v)} disabled={isLoading}>
                <SelectTrigger id="shop-select" className="w-full">
                  <SelectValue placeholder="안경원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((shop) => (
                    <SelectItem key={shop.id} value={shop.id}>
                      {shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shops.length === 0 && (
                <p className="text-xs text-orange-600">
                  등록된 안경원이 없습니다. <a href="/admin" className="underline">관리 페이지</a>에서 추가하세요.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-select">카테고리 선택</Label>
              <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)} disabled={isLoading}>
                <SelectTrigger id="category-select" className="w-full">
                  <SelectValue placeholder="카테고리를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-input">주제 / 소재</Label>
              <Input
                id="topic-input"
                placeholder="직접 입력하거나 아래 추천 주제를 클릭하세요"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isLoading}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">{topic.length}/100</p>

              {/* AI 자동 주제 추천 */}
              {isSuggesting && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI가 주제를 추천하고 있습니다...
                </div>
              )}
              {suggestedTopics.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    AI 추천 주제 (클릭하여 선택)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedTopics.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTopic(t)}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base"
              disabled={!canSubmit}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  키워드 생성 중...
                </>
              ) : (
                "시작"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
