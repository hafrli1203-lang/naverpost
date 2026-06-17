/**
 * 표기 변형·오타 키워드 확장 (안경 도메인 전용, 결정론적)
 *
 * 근거: docs/research/blog-monetization-alster.md 4장 — "충전기 vs 충전케이블 vs 충전선",
 * "스탠바이미 vs 스텐바이미"처럼 같은 의미라도 표기/띄어쓰기/오타에 따라 검색량이 갈린다.
 * 검색광고 API는 우리가 "물어본" 키워드의 볼륨만 주므로, 표기 변형을 시드에 같이 넣어야
 * 변형의 실볼륨이 측정된다. 실볼륨이 없는 변형은 기존 볼륨 게이트가 그대로 걸러낸다.
 *
 * 안전 원칙:
 * - 무작위 오타를 만들지 않는다. 아래 큐레이션된 변형군(VARIANT_GROUPS)에 속한 표현만 치환한다.
 *   (도메인 밖 키워드는 변형이 생성되지 않아 시드가 오염되지 않는다.)
 * - 순수함수. 네트워크·상태 없음. 원형은 결과에서 제외하고 새 변형만 반환한다.
 */

/**
 * 서로 같은 의미의 표기 변형군. 한 군의 한 표현이 키워드에 들어 있으면
 * 같은 군의 다른 표현으로 치환한 변형을 만든다(외래어 표기·흔한 오타·띄어쓰기).
 */
const VARIANT_GROUPS: string[][] = [
  ["콘택트렌즈", "콘텍트렌즈", "컨택트렌즈"],
  ["콘택트", "콘텍트", "컨택트"],
  ["소프트렌즈", "소프트 렌즈"],
  ["하드렌즈", "하드 렌즈"],
  ["누진다초점", "누진 다초점"],
  ["누진렌즈", "누진 렌즈"],
  ["다초점렌즈", "다초점 렌즈"],
  ["변색렌즈", "변색 렌즈"],
  ["편광렌즈", "편광 렌즈"],
  ["기능성렌즈", "기능성 렌즈"],
  ["블루라이트", "블루 라이트"],
  ["블루라이트차단", "블루라이트 차단"],
  ["선글라스", "썬글라스"],
  ["뿔테안경", "뿔테 안경"],
  ["금속테", "메탈테"],
  ["미세먼지", "미세 먼지"],
];

const MAX_VARIANTS = 24;

/** keyword 안의 from 부분문자열을 to로 모두 치환한다(첫 등장만이 아니라 전부). */
function replaceAll(keyword: string, from: string, to: string): string {
  return keyword.split(from).join(to);
}

/**
 * 주어진 시드들의 안경 도메인 표기 변형을 생성한다.
 * 원형 및 입력에 이미 있던 표현은 제외하고, 새로 생긴 변형만 반환한다.
 */
export function expandSpellingVariants(seeds: string[]): string[] {
  const cleaned = seeds.map((seed) => seed.trim()).filter(Boolean);
  const existing = new Set(cleaned.map((seed) => seed.replace(/\s+/g, " ")));
  const out = new Set<string>();

  for (const seed of cleaned) {
    for (const group of VARIANT_GROUPS) {
      for (const member of group) {
        if (!seed.includes(member)) continue;
        for (const alt of group) {
          if (alt === member) continue;
          const variant = replaceAll(seed, member, alt).replace(/\s+/g, " ").trim();
          const normalized = variant.replace(/\s+/g, " ");
          if (!variant || existing.has(normalized) || out.has(variant)) continue;
          out.add(variant);
          if (out.size >= MAX_VARIANTS) return Array.from(out);
        }
      }
    }
  }

  return Array.from(out);
}
