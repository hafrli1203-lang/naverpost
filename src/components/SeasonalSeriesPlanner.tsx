"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarRange, Loader2, PenLine, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { Shop } from "@/types";

type RankedKeyword = {
  keyword: string;
  categoryId: string;
  categoryName: string;
  seasonScore: number;
  monthlyVolume: number | null;
  peakMonth: number | null;
  isPeakMonth: boolean;
  estimatedMonthlyDemand: number | null;
  seasonalLift: number | null;
};

type TrendingKeyword = {
  keyword: string;
  trafficLabel: string | null;
};

type SeasonalDiscoveryResult = {
  shopId: string;
  month: number;
  volumeTop: RankedKeyword[];
  issueTop: RankedKeyword[];
  trendingNow?: TrendingKeyword[];
  notes: string[];
};

/** 메인 생성기로 딥링크 — 매장+카테고리+키워드 프리필 후 자동 시작. */
function generatorUrl(shopId: string, categoryId: string, keyword: string): string {
  const params = new URLSearchParams({ start: "1", shopId, categoryId, topic: keyword });
  return `/?${params.toString()}`;
}

function KeywordRow({
  rank,
  item,
  shopId,
  showLift,
}: {
  rank: number;
  item: RankedKeyword;
  shopId: string;
  showLift?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-white">
            {rank}
          </span>
          <p className="truncate text-sm font-medium text-slate-800">{item.keyword}</p>
          <Badge variant="secondary" className="shrink-0 bg-slate-100 text-slate-500 text-[10px]">
            {item.categoryName}
          </Badge>
          {item.isPeakMonth && (
            <Badge
              variant="secondary"
              className="shrink-0 gap-0.5 bg-rose-100 text-rose-600 text-[10px]"
            >
              <TrendingUp className="h-2.5 w-2.5" />
              연중 피크
            </Badge>
          )}
        </div>
        <a
          href={generatorUrl(shopId, item.categoryId, item.keyword)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium text-slate-700 transition-colors hover:-translate-y-0.5 hover:border-amber-400 hover:text-amber-600 active:translate-y-0"
        >
          <PenLine className="h-3 w-3" />
          글쓰기
        </a>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7 text-[11px] text-muted-foreground">
        {showLift && item.seasonalLift != null && (
          <Badge variant="secondary" className="gap-0.5 bg-rose-50 text-rose-600 text-[10px]">
            <TrendingUp className="h-2.5 w-2.5" />
            급상승 {item.seasonalLift.toFixed(1)}배
          </Badge>
        )}
        {item.monthlyVolume != null && (
          <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px]">
            월 검색량 {item.monthlyVolume.toLocaleString()}
          </Badge>
        )}
        {item.estimatedMonthlyDemand != null && (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px]">
            이 달 추정 {item.estimatedMonthlyDemand.toLocaleString()}
          </Badge>
        )}
        {item.peakMonth != null && !item.isPeakMonth && (
          <Badge variant="secondary" className="bg-slate-50 text-slate-500 text-[10px]">
            연중 피크 {item.peakMonth}월
          </Badge>
        )}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  hint,
  items,
  shopId,
  showLift,
}: {
  title: string;
  hint: string;
  items: RankedKeyword[];
  shopId: string;
  showLift?: boolean;
}) {
  function openAll() {
    if (items.length === 0) return;
    for (const item of items) {
      window.open(generatorUrl(shopId, item.categoryId, item.keyword), "_blank");
    }
    toast.success(`${items.length}개를 새 탭으로 열었습니다. 팝업이 막히면 허용해 주세요.`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        {items.length > 0 && (
          <Button onClick={openAll} variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <PenLine className="h-3.5 w-3.5" />
            일괄 생성
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">발굴된 키워드가 없습니다.</p>
      ) : (
        items.map((item, i) => (
          <KeywordRow
            key={`${item.keyword}-${i}`}
            rank={i + 1}
            item={item}
            shopId={shopId}
            showLift={showLift}
          />
        ))
      )}
    </div>
  );
}

export function SeasonalSeriesPlanner() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [month, setMonth] = useState<string>(""); // "" = 다음 달(기본)
  const [result, setResult] = useState<SeasonalDiscoveryResult | null>(null);
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

  async function discover() {
    if (!shopId) {
      setError("매장을 선택해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/topics/seasonal-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, ...(month ? { month: Number(month) } : {}) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "시즌 키워드 발굴에 실패했습니다.");
      }
      setResult(json.data as SeasonalDiscoveryResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시즌 키워드 발굴 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-amber-500" />
          시즌 키워드 발굴
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          매장과 월만 고르면 그 달 안경 키워드를 두 축으로 캐냅니다 — <b>검색량 TOP</b>(꾸준한 큰 소재)와
          <b> 이슈/급상승 TOP</b>(평소보다 그 달에 검색이 튀는 시의성 키워드). 데이터랩 12개월 곡선으로
          판정하고, 이미 1~3위 노출 중인 키워드는 자기잠식 방지로 제외돼요. 각 키워드의 &quot;글쓰기&quot;를
          누르면 그 키워드로 본문 생성기가 바로 열립니다. (전 분야 이슈는 네이버가 데이터를 주지 않아 안경
          도메인 기준)
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
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">다음 달 (기본)</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월 기준
              </option>
            ))}
          </select>
        </div>

        <Button onClick={discover} disabled={isLoading} className="w-full gap-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarRange className="h-4 w-4" />
          )}
          {isLoading ? "발굴 중..." : "시즌 키워드 발굴"}
        </Button>

        {error && <p className="text-xs text-orange-600">{error}</p>}

        {result && (
          <div className="space-y-5 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {result.month}월 기준
              </Badge>
            </div>

            <ResultSection
              title="이 달 검색량 TOP 10"
              hint="지정한 달 검색량(추정) 상위 — 꾸준한 큰 소재"
              items={result.volumeTop}
              shopId={result.shopId}
            />

            <ResultSection
              title="이 달 이슈(급상승) TOP 10"
              hint="평소 대비 이 달에 검색이 튀는 시의성 키워드 — 안경 도메인 기준"
              items={result.issueTop}
              shopId={result.shopId}
              showLift
            />

            {result.trendingNow && result.trendingNow.length > 0 && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    지금 전 분야 실시간 이슈 (구글 트렌드)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    한국 실시간 트렌딩 — 월 선택과 무관한 현재 시점. 인물·뉴스가 많아 참고용(안경과 엮을 소재 발굴).
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.trendingNow.map((t, i) => (
                    <a
                      key={`${t.keyword}-${i}`}
                      href={`https://search.naver.com/search.naver?query=${encodeURIComponent(t.keyword)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 transition-colors hover:border-amber-400 hover:text-amber-600"
                    >
                      <span className="font-medium">{t.keyword}</span>
                      {t.trafficLabel && (
                        <span className="text-[10px] text-muted-foreground">{t.trafficLabel}</span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {result.notes.map((note, i) => (
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
