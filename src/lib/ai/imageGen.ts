import { runGti, type GtiResult } from "./cli/gtiCli";

/**
 * 블로그 이미지 생성.
 * @param prompt 영어 이미지 프롬프트
 * @param refImages 참조 이미지 경로(실제 매장 사진 등). 매장 장면에만 첨부.
 */
export async function generateBlogImage(
  prompt: string,
  refImages: string[] = []
): Promise<GtiResult> {
  return runGti({ prompt, images: refImages });
}
