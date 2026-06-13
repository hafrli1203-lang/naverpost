"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";

type ShopCadence = {
  shopId: string;
  shopName: string;
  totalPosts: number;
  lastPublishedAt: string | null;
  daysSinceLast: number | null;
  avgIntervalDays: number | null;
  recommendedIntervalDays: number;
  status: "good" | "slowing" | "stale" | "unknown";
  recentDates: string[];
};

type CadenceReport = { shops: ShopCadence[]; reason?: string };

const STATUS_LABEL: Record<ShopCadence["status"], { text: string; className: string }> = {
  good: { text: "꾸준함", className: "bg-green-100 text-green-700" },
  slowing: { text: "느려짐", className: "bg-yellow-100 text-yellow-700" },
  stale: { text: "끊김", className: "bg-orange-100 text-orange-700" },
  unknown: { text: "이력 없음", className: "bg-slate-100 text-slate-600" },
};

export function CadenceTracker() {
  const [report, setReport] = useState<CadenceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/blogops/cadence");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "발행 일관성을 불러오지 못했습니다.");
      }
      setReport(json.data as CadenceReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "발행 일관성 조회 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-indigo-500" />
          <span className="flex-1">발행 일관성</span>
          <button
            onClick={load}
            disabled={isLoading}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="새로고침"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          꾸준한 발행은 C-Rank 연결(Chain) 축에 유리해요. 권장 간격(3일) 기준으로 점검합니다.
        </p>

        {error && <p className="text-xs text-orange-600">{error}</p>}

        {report?.reason && report.shops.length === 0 && (
          <p className="text-xs text-muted-foreground">{report.reason}</p>
        )}

        {report?.shops.map((shop) => {
          const status = STATUS_LABEL[shop.status];
          return (
            <div key={shop.shopId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">{shop.shopName}</p>
                <Badge className={`text-[11px] ${status.className} hover:${status.className}`}>
                  {status.text}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {shop.daysSinceLast === null ? "-" : `${shop.daysSinceLast}일`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">마지막 발행 경과</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {shop.avgIntervalDays === null ? "-" : `${shop.avgIntervalDays}일`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">평균 간격</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{shop.totalPosts}</p>
                  <p className="text-[10px] text-muted-foreground">누적 발행</p>
                </div>
              </div>
              {shop.recentDates.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  최근: {shop.recentDates.join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
