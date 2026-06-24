import type { ZodType } from "zod";

/**
 * API 경계 파싱 헬퍼(공용). 성공 시 검증된 데이터, 실패 시 첫 이슈의 사람 친화 메시지.
 * 라우트는 `if (!parsed.ok) return 400(parsed.message)` 형태로 쓴다.
 */
export function parseRequestBody<T>(
  schema: ZodType<T>,
  body: unknown
): { ok: true; data: T } | { ok: false; message: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const first = result.error.issues[0];
  return { ok: false, message: first?.message ?? "잘못된 요청입니다." };
}
