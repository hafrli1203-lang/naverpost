import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { washImageBuffer } from "@/lib/storage/imageWash";
import {
  getSceneReferenceImages,
  listScenePhotos,
  getOwnPersonPhotos,
  getBrandPersonPhotos,
  type SceneTag,
} from "@/lib/data/shopRefs";

export const runtime = "nodejs";
export const maxDuration = 600;

const ALLOWED_PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, index, prompt, shopId, scene, rawPhoto } = body as {
      sessionId?: string;
      index?: number;
      prompt?: string;
      shopId?: string;
      scene?: SceneTag | null;
      rawPhoto?: string;
    };

    if (!sessionId || index === undefined || !prompt) {
      return NextResponse.json(
        { success: false, error: "sessionId, index, prompt는 필수입니다." },
        { status: 400 }
      );
    }

    // 하이브리드: 매장 컷은 실제 매장 사진을 "그대로" 서빙(AI 생성/합성 아님 — 진짜 사진 한 장).
    // 보안: 클라가 보낸 rawPhoto 경로는 신뢰하지 않는다. shopId+scene로 서버가 허용 목록을
    // 다시 만들어(listScenePhotos — 그 매장·그 장면의 실제 파일만) 그 안에 정확히 들어있는
    // 경로일 때만 서빙한다. 이렇게 하면 임의 파일 읽기/IDOR가 원천 차단된다.
    if (rawPhoto && shopId && scene) {
      // 허용목록 = 그 매장·그 장면의 실제 파일. fitting은 그 매장 "자체" 사람 컷도 직접사용 허용
      // (타 매장 사람 사진 직접사용은 막기 위해 getOwnPersonPhotos = 자체만).
      const allowed = [
        ...(await listScenePhotos(shopId, scene)),
        ...(scene === "fitting" ? await getOwnPersonPhotos(shopId) : []),
      ];
      const target = path.resolve(rawPhoto);
      const match = allowed.find((a) => path.resolve(a) === target);
      if (match && ALLOWED_PHOTO_EXTS.has(path.extname(match).toLowerCase())) {
        try {
          const raw = await fs.readFile(match);
          // 워싱: 같은 사진을 여러 글에 써도 매번 다른 해시가 되도록 미세 변형(중복 이미지 판정 회피).
          // 비이미지면 washImageBuffer가 throw → 아래 생성 경로로 폴백(누출 방지).
          const washed = await washImageBuffer(raw);
          const base64Data = washed.data.toString("base64");
          const saved = await saveImage(sessionId, index, base64Data, washed.mimeType);
          return NextResponse.json({
            success: true,
            data: {
              index,
              imageId: saved.imageId,
              imageUrl: `/api/image/file/${saved.imageId}`,
              base64Data,
              mimeType: saved.mimeType,
              prompt,
              usedRealPhoto: true,
            },
          });
        } catch {
          // 실제 사진 읽기/워싱 실패 → 아래 생성 경로로 폴백
        }
      }
    }

    // 장면 태그가 있는 매장 장면에만 그 장면에 맞는 실제 매장 사진을 참조로 첨부.
    // fitting(사람 직접사진 없는 매장)은 브랜드 사람 풀을 참조로 붙여 실제 응대 모습에 가깝게 생성.
    // 매장 밖/개념 이미지(scene=null)는 빈 배열 → 묘사 기반 생성.
    const refImages = !scene || !shopId
      ? []
      : scene === "fitting"
        ? [...(await getBrandPersonPhotos(shopId)), ...(await getSceneReferenceImages(shopId, scene))].slice(0, 2)
        : await getSceneReferenceImages(shopId, scene);

    const result = await generateBlogImage(prompt, refImages);
    const saved = await saveImage(sessionId, index, result.base64Data, result.mimeType);

    return NextResponse.json({
      success: true,
      data: {
        index,
        imageId: saved.imageId,
        imageUrl: `/api/image/file/${saved.imageId}`,
        base64Data: result.base64Data,
        mimeType: saved.mimeType,
        prompt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "이미지 생성 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
