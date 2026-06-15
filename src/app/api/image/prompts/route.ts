import { NextRequest, NextResponse } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { buildImagePrompts, parseScenePrompt } from "@/lib/prompts/imagePrompt";
import { getShopById } from "@/lib/data/shops";
import { getShopProfile, listScenePhotos, type SceneTag } from "@/lib/data/shopRefs";

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
    const parsed = raw
      .split("\n")
      .map((p) => p.trim())
      .map((p) => (p.startsWith("(") && p.endsWith(")") ? p.slice(1, -1).trim() : p))
      .map((p) => (p.startsWith("(") ? p.slice(1).trim() : p))
      .map((line) => parseScenePrompt(line))
      .filter((p) => p.prompt.length > 20)
      .slice(0, 10);

    // 결정론적 안전망: 원고가 시력검사/검안 '과정'을 실제로 다루지 않으면
    // LLM이 마무리 CTA를 검안으로 넘겨짚어 만든 [SCENE:exam] 프롬프트를 버린다.
    // (프롬프트 규칙이 1차 방어, 이 가드가 LLM 미준수 대비 2차 방어.)
    const hasExamContent =
      /시력검사|검안|굴절검사|검영|포롭터|포롭타|안압|자동굴절|자각식|타각식|동공간거리|시력\s?측정|도수\s?측정|시기능/.test(
        articleContent
      );
    const disciplined = hasExamContent ? parsed : parsed.filter((p) => p.scene !== "exam");

    // 하이브리드: "공간/장비/제품" 컷(내부·외관·디테일)만 실제 매장 사진을 그대로 쓴다
    // (gti는 실제 매장을 정확히 재현 못하고, 진짜 간판·글자가 있어야 더 진짜 같음).
    // 검안·피팅은 "사람이 동작하는" 장면인데 실제 사진엔 사람이 없으므로 여기서 raw로 배정하지 않고,
    // /one 에서 AI 생성 + 실제 검안실/피팅 사진을 참조(getSceneReferenceImages)로 붙여 처리한다.
    // 인물/개념 컷(scene=null)도 그대로 생성. 컷마다 다른 사진을 배정해 중복을 피한다.
    const RAW_PHOTO_SCENES = new Set<SceneTag>(["exterior", "interior", "detail"]);
    const usedPhotos = new Set<string>();
    const prompts: Array<{ prompt: string; scene: SceneTag | null; rawPhoto?: string }> = [];
    for (const p of disciplined) {
      if (shopId && p.scene && RAW_PHOTO_SCENES.has(p.scene)) {
        const pool = await listScenePhotos(shopId, p.scene);
        const fresh = pool.find((x) => !usedPhotos.has(x));
        if (fresh) {
          usedPhotos.add(fresh);
          prompts.push({ ...p, rawPhoto: fresh });
          continue;
        }
      }
      prompts.push(p);
    }

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
