/**
 * 참조 이미지 충실도 강화(IMG-D, 순수 함수).
 *
 * gti(gpt-image)는 --image 로 실제 매장 사진을 줘도 배경을 약하게만 반영하고
 * 종종 무시한다(모빌 증식 등). 모델 한계를 "완전 해결"할 수는 없지만, 참조가
 * 첨부될 때 프롬프트에 "첨부 사진의 실제 환경을 충실히 재현하고 설비를 복제·증식하지
 * 말라"는 명시적 지시 + 네거티브를 붙이면 환각을 줄일 수 있다.
 */
export function appendReferenceAdherence(prompt: string, refCount: number): string {
  const base = prompt.trim();
  if (refCount <= 0) return base;
  return `${base}

[Reference] ${refCount} photo(s) of THIS actual store are attached. Reproduce that real environment faithfully — same background, shelves, fixtures, wall layout, lighting and colors as the attached photos. Do NOT invent a different interior. Do NOT duplicate or multiply fixtures: if the real store has a single ceiling mobile or sign, show exactly one, never several. Keep object counts true to the reference. Only add the described person or action into that real environment.`;
}
