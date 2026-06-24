"use client";

import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { CadenceTracker } from "@/components/CadenceTracker";
import { SeriesPlanner } from "@/components/SeriesPlanner";
import { SeasonalSeriesPlanner } from "@/components/SeasonalSeriesPlanner";

export default function OperationsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-lg font-bold text-gray-900">콘텐츠 운영 (C-Rank)</h1>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gray-700"
          >
            <Store className="h-4 w-4" />
            상점 관리
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <CadenceTracker />
        <SeriesPlanner />
        <SeasonalSeriesPlanner />
      </main>
    </div>
  );
}
