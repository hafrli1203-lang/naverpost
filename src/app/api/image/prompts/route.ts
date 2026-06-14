import { NextRequest, NextResponse } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { buildImagePrompts, parseScenePrompt } from "@/lib/prompts/imagePrompt";
import { getShopById } from "@/lib/data/shops";
import { getShopProfile } from "@/lib/data/shopRefs";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleContent, title, mainKeyword, shopId } = body as {
      articleContent?: string;
      title?: string;
      mainKeyword?: string;
      shopId?: string;
    };

    if (!articleContent || !title || !mainKeyword) {
      return NextResponse.json(
        { success: false, error: "articleContent, title, mainKeyword는 필수입니다." },
        { status: 400 }
      );
    }

    let shop: { name: string; interiorDescription?: string } | undefined;
    if (shopId) {
      const shopRecord = await getShopById(shopId);
      if (shopRecord) {
        const profile = await getShopProfile(shopId);
        shop = {
          name: shopRecord.name,
          interiorDescription: profile?.interiorDescription,
        };
      }
    }

    const promptText = buildImagePrompts({ articleContent, title, mainKeyword, shop });
    const raw = await generateImagePrompts(promptText);
    const prompts = raw
      .split("\n")
      .map((p) => p.trim())
      .map((p) => (p.startsWith("(") && p.endsWith(")") ? p.slice(1, -1).trim() : p))
      .map((p) => (p.startsWith("(") ? p.slice(1).trim() : p))
      .map((line) => parseScenePrompt(line))
      .filter((p) => p.prompt.length > 20)
      .slice(0, 10);

    if (prompts.length === 0) {
      return NextResponse.json(
        { success: false, error: "프롬프트 생성 결과가 비어 있습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { prompts } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "프롬프트 생성 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
