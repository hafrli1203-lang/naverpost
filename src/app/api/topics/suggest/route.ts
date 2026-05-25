import { NextRequest, NextResponse } from "next/server";
import { runCodex } from "@/lib/ai/cli/codexCli";
import { getShopById } from "@/lib/data/shops";
import { CATEGORIES } from "@/lib/constants";
import { fetchBlogTitles } from "@/lib/naver/rssParser";

export const maxDuration = 60;

const TOPIC_AI_TIMEOUT_MS = 25_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timeout));
  });
}

function inferRegion(shopName: string): string {
  return (
    shopName
      .replace(/으뜸50안경|지니스안경|안경원|안경|점/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")[0] || shopName
  );
}

function getMonthlyTopicWords(month: number): string[] {
  if (month >= 3 && month <= 5) return ["시력검사", "자외선", "부모님"];
  if (month >= 6 && month <= 8) return ["자외선", "렌즈건조", "선글라스"];
  if (month >= 9 && month <= 11) return ["환절기", "눈피로", "운전"];
  return ["김서림", "건조", "실내"];
}

function buildFallbackTopics(params: {
  shopName: string;
  categoryName: string;
  subcategories: string[];
  existingTitles: string[];
}): string[] {
  const region = inferRegion(params.shopName);
  const monthWords = getMonthlyTopicWords(new Date().getMonth() + 1);
  const categorySeeds = params.subcategories.length > 0
    ? params.subcategories
    : [params.categoryName];
  const candidates = [
    `${region} ${categorySeeds[0]} 선택 기준`,
    `${monthWords[0]} ${categorySeeds[1] ?? categorySeeds[0]} 관리`,
    `${categorySeeds[2] ?? params.categoryName} ${monthWords[1]} 확인`,
    `${region} ${params.categoryName} 방문 전 확인`,
    `${monthWords[2]} ${params.categoryName} 체크`,
  ];
  const existing = params.existingTitles.join(" ");

  return candidates
    .filter((topic) => !existing.includes(topic))
    .map((topic) => topic.slice(0, 25))
    .slice(0, 3);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, categoryId } = body as { shopId: string; categoryId: string };

    if (!shopId || !categoryId) {
      return NextResponse.json(
        { success: false, error: "shopId와 categoryId는 필수입니다." },
        { status: 400 }
      );
    }

    const shop = await getShopById(shopId);
    const category = CATEGORIES.find((c) => c.id === categoryId);

    if (!shop || !category) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId 또는 categoryId입니다." },
        { status: 400 }
      );
    }

    // RSS에서 기존 글 제목 수집
    let existingTitles: string[] = [];
    try {
      const rss = await fetchBlogTitles(shopId);
      existingTitles = rss.forbiddenList;
    } catch {
      // RSS 실패해도 추천은 계속
    }

    const existingStr = existingTitles.length > 0
      ? `\n\n이미 작성된 글 제목 (중복 금지):\n${existingTitles.slice(0, 20).join("\n")}`
      : "";

    const prompt = `당신은 안경원 블로그 주제 추천 전문가입니다.

매장: ${shop.name}
카테고리: ${category.name}
카테고리 세부 주제: ${category.subcategories.join(", ")}
${existingStr}

위 정보를 바탕으로, 이 매장 블로그에 작성하면 좋을 주제/소재를 3개 추천해 주세요.

조건:
- 기존에 작성된 글과 중복되지 않을 것
- 네이버 검색에서 유입이 가능한 구체적 주제
- 각 주제는 10~25자 이내의 자연스러운 한국어

출력 형식 (번호 없이 한 줄씩):
(주제1)
(주제2)
(주제3)`;

    const fallbackTopics = buildFallbackTopics({
      shopName: shop.name,
      categoryName: category.name,
      subcategories: category.subcategories,
      existingTitles,
    });
    const raw = await withTimeout(
      runCodex({ prompt, timeoutMs: TOPIC_AI_TIMEOUT_MS }),
      TOPIC_AI_TIMEOUT_MS + 1_000,
      fallbackTopics.join("\n")
    );
    const topics = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length <= 50)
      .slice(0, 3);

    return NextResponse.json({
      success: true,
      data: topics.length > 0 ? topics : fallbackTopics,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "주제 추천 실패" },
      { status: 500 }
    );
  }
}
