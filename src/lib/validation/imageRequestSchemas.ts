import { z } from "zod";

/**
 * 이미지 API 라우트 입력 경계 검증(zod).
 *
 * 기존 라우트는 `body as {...}` 무검증 단언 + 수동 if 체크였다. 잘못된 타입
 * (예: index가 문자열, prompt가 객체)이 그대로 통과해 런타임 깊숙이 전파될 수 있었다.
 * 여기서 경계에서 한 번에 검증하고, 실패 시 호출부가 400으로 응답한다.
 *
 * 동작 보존: 기존 필수 필드/메시지를 그대로 유지하고 타입 검증만 추가한다.
 */

const REQUIRED_ONE = "sessionId, index, prompt는 필수입니다.";
const REQUIRED_REGEN = "index와 sessionId는 필수입니다.";
const REQUIRED_PROMPTS = "articleContent, title, mainKeyword는 필수입니다.";

/** shopRefs.SceneTag와 동일 집합(런타임 검증용 enum). */
export const sceneTagSchema = z.enum([
  "exterior",
  "interior",
  "exam",
  "fitting",
  "detail",
]);

/** POST /api/image/one */
export const imageOneSchema = z.object({
  sessionId: z.string(REQUIRED_ONE).min(1, REQUIRED_ONE),
  index: z.number(REQUIRED_ONE).int().min(0),
  prompt: z.string(REQUIRED_ONE).min(1, REQUIRED_ONE),
  shopId: z.string().optional(),
  scene: sceneTagSchema.nullish(),
  rawPhoto: z.string().optional(),
});

/** POST /api/image/regenerate */
export const imageRegenerateSchema = z.object({
  index: z.number(REQUIRED_REGEN).int().min(0),
  sessionId: z.string(REQUIRED_REGEN).min(1, REQUIRED_REGEN),
  prompt: z.string().optional(),
  shopId: z.string().optional(),
  scene: sceneTagSchema.nullish(),
});

/** POST /api/image/prompts, /api/image/generate (동일 입력 형태) */
export const imageContentSchema = z.object({
  sessionId: z.string().min(1).optional(),
  articleContent: z.string(REQUIRED_PROMPTS).min(1, REQUIRED_PROMPTS),
  title: z.string(REQUIRED_PROMPTS).min(1, REQUIRED_PROMPTS),
  mainKeyword: z.string(REQUIRED_PROMPTS).min(1, REQUIRED_PROMPTS),
  shopId: z.string().optional(),
});

/** POST /api/image/generate (SSE) — prompts와 동일하나 sessionId 필수. */
export const imageGenerateSchema = imageContentSchema.extend({
  sessionId: z.string().min(1),
});

export type ImageOneInput = z.infer<typeof imageOneSchema>;
export type ImageRegenerateInput = z.infer<typeof imageRegenerateSchema>;
export type ImageContentInput = z.infer<typeof imageContentSchema>;
export type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

// 공용 경계 파싱 헬퍼(다른 라우트 스키마와 공유). 기존 import 경로 호환을 위해 재노출.
export { parseRequestBody } from "./parseRequestBody";
