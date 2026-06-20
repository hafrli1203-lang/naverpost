/**
 * 이미지 프롬프트 누수 가드(순수 함수).
 *
 * generateImagePrompts(Claude CLI)가 영어 프롬프트만 출력해야 하지만, 실제로는
 * "...순서로 구성했습니다." 같은 한국어 설명/머리말을 앞에 붙이는 경우가 있다.
 * 이 한국어 문장이 그대로 gti(gpt-image)에 전달되면 매번 생성 실패한다(crash log 확인).
 * 이미지 프롬프트는 영어이므로, 한글 비중이 높은 줄은 프롬프트가 아니라 설명으로 보고 버린다.
 */

/** 공백을 제외한 글자 중 한글 음절의 비율(0~1). */
export function hangulRatio(text: string): number {
  const chars = text.replace(/\s/g, "");
  if (chars.length === 0) return 0;
  const hangul = (chars.match(/[가-힣]/g) ?? []).length;
  return hangul / chars.length;
}

/**
 * 그 줄이 "영어 이미지 프롬프트"로 보이는가.
 *  - 최소 길이(20자) 이상
 *  - 한글 비중이 임계값 미만(영어 프롬프트는 한글이 거의 없음)
 * 한국어 설명/머리말/안내문은 false → 호출부에서 드롭한다.
 */
export function isLikelyImagePrompt(text: string, maxHangulRatio = 0.3): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  if (hangulRatio(t) > maxHangulRatio) return false;
  return true;
}
