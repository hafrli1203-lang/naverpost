/**
 * 의료법·광고법 안전화 (결정론적 치환)
 *
 * 출처: 자료/extracted/의료미용_블로그_매뉴얼.txt
 * 매뉴얼의 의료광고법 위반 문구 → 안경원 적용 안전 표현으로 자동 교체.
 *
 * 안경원은 의료기관이 아니므로 매뉴얼 기준보다 더 엄격하게 의료 행위·의료 단어를 회피한다.
 * 이 모듈은 워싱 LLM 호출 전에 명확한 위반 표현을 먼저 잡는다.
 */

type Replacement = {
  pattern: RegExp;
  replacement: string;
  category: "phrase" | "medical-term" | "exaggeration" | "comparison" | "absolute" | "discount-pressure";
};

/**
 * 우선순위가 높은 구문 단위 치환 (단어보다 먼저 적용)
 * 매뉴얼 Table 7의 안경원 적용 매핑.
 */
const PHRASE_REPLACEMENTS: Replacement[] = [
  // 매장 자랑 / 우월 표현
  { pattern: /저희 (매장|안경원)이 최고입니다/g, replacement: "꼼꼼한 피팅으로 안내드리는 매장입니다", category: "exaggeration" },
  { pattern: /업계 최고의?/g, replacement: "꼼꼼한", category: "exaggeration" },
  { pattern: /업계 최초[로]? 도입/g, replacement: "도입", category: "exaggeration" },
  { pattern: /국내 최초[로]?/g, replacement: "", category: "exaggeration" },
  { pattern: /업계 1위/g, replacement: "", category: "exaggeration" },

  // 단정형 효과 보장
  { pattern: /100\s*%\s*효과를?\s*보장합니다/g, replacement: "착용감과 기대 효과에 대해 안내드립니다", category: "absolute" },
  { pattern: /100\s*%\s*만족을?\s*보장합니다/g, replacement: "만족하실 수 있도록 꼼꼼하게 안내드립니다", category: "absolute" },
  { pattern: /효과를?\s*100\s*%\s*보장/g, replacement: "기대 효과에 대해 안내", category: "absolute" },
  { pattern: /100\s*%\s*해결합니다/g, replacement: "도움이 될 수 있어요", category: "absolute" },
  { pattern: /100\s*%\s*보장/g, replacement: "도움이 될 수 있어요", category: "absolute" },
  { pattern: /무조건 좋아집니다/g, replacement: "개인차가 있으나 일반적으로 편안함을 느끼실 수 있어요", category: "absolute" },
  { pattern: /무조건 효과/g, replacement: "도움이 될 수 있는 효과", category: "absolute" },
  { pattern: /반드시 낫습니다/g, replacement: "도움이 될 수 있어요", category: "absolute" },
  { pattern: /반드시 좋아집니다/g, replacement: "개선될 수 있어요", category: "absolute" },
  { pattern: /즉시 효과/g, replacement: "착용 후 변화", category: "absolute" },

  // 타 매장 비방
  { pattern: /다른 안경원[보다은는과와]+/g, replacement: "", category: "comparison" },
  { pattern: /타 안경원[보다은는과와]+/g, replacement: "", category: "comparison" },
  { pattern: /타 매장[보다은는과와]+/g, replacement: "", category: "comparison" },
  { pattern: /타사[와과]\s*달리/g, replacement: "", category: "comparison" },

  // 광고성 압박
  { pattern: /지금 바로 (방문|문의|예약|상담)하세요/g, replacement: "편하게 들러 보세요", category: "discount-pressure" },
  { pattern: /지금 바로/g, replacement: "", category: "discount-pressure" },
  { pattern: /서두르세요/g, replacement: "", category: "discount-pressure" },
  { pattern: /놓치지 마세요/g, replacement: "", category: "discount-pressure" },
  { pattern: /기간 한정 특가/g, replacement: "안내", category: "discount-pressure" },

  // 의료광고법 핵심 단정어 (누락분 보강)
  { pattern: /완치됩니다|완치된다|완치돼요|완치가 됩니다/g, replacement: "개선될 수 있어요", category: "absolute" },
  { pattern: /완치/g, replacement: "개선", category: "absolute" },
  { pattern: /효과가 (확실합니다|확실해요|뛰어납니다|좋습니다|있습니다)/g, replacement: "도움이 될 수 있어요", category: "absolute" },
  { pattern: /효과적입니다|효과적이에요/g, replacement: "도움이 될 수 있어요", category: "absolute" },
  { pattern: /통증이 사라집니다|증상이 사라집니다/g, replacement: "불편이 줄어들 수 있어요", category: "absolute" },

  // 의료광고법 단정 - 시력 효과
  { pattern: /시력이 좋아집니다/g, replacement: "사용 환경에 맞는 보정에 도움을 줄 수 있어요", category: "absolute" },
  { pattern: /시력이 회복됩니다/g, replacement: "교정에 도움을 줄 수 있어요", category: "absolute" },
  { pattern: /눈\s*피로가 사라집니다/g, replacement: "눈 피로가 줄어들 수 있어요", category: "absolute" },
  { pattern: /난시가 해결됩니다/g, replacement: "난시 보정에 도움이 될 수 있어요", category: "absolute" },
  { pattern: /노안을?\s*해결합니다/g, replacement: "노안 보정에 도움을 드려요", category: "absolute" },

  // 문의/상담 직접 전환 압박 (정보형으로)
  { pattern: /상담 받아보세요/g, replacement: "확인해 보세요", category: "discount-pressure" },
  { pattern: /문의해 주세요/g, replacement: "확인해 주세요", category: "discount-pressure" },
  { pattern: /문의해주세요/g, replacement: "확인해 주세요", category: "discount-pressure" },
  { pattern: /지금 예약하세요/g, replacement: "편하게 들러 보세요", category: "discount-pressure" },
];

/**
 * 단어 단위 치환 (매장 안내 블록 외에서만 적용)
 * 매장 안내에 들어가는 사실 정보(주소·운영시간 등)는 보호되어야 한다.
 */
const WORD_REPLACEMENTS: Replacement[] = [
  // 의료 행위 단어 (안경원에서 절대 금지)
  { pattern: /시술/g, replacement: "조정", category: "medical-term" },
  { pattern: /치료/g, replacement: "확인", category: "medical-term" },
  { pattern: /처방/g, replacement: "안내", category: "medical-term" },
  { pattern: /진단/g, replacement: "확인", category: "medical-term" },
  { pattern: /수술/g, replacement: "조정", category: "medical-term" },
  { pattern: /의사/g, replacement: "안경사", category: "medical-term" },
  { pattern: /전문의/g, replacement: "안경사", category: "medical-term" },
  { pattern: /의료진/g, replacement: "안경사", category: "medical-term" },
  { pattern: /병원/g, replacement: "매장", category: "medical-term" },
  { pattern: /의원/g, replacement: "매장", category: "medical-term" },
  { pattern: /환자/g, replacement: "고객", category: "medical-term" },
  { pattern: /부작용/g, replacement: "적응 기간", category: "medical-term" },
  { pattern: /약물/g, replacement: "", category: "medical-term" },

  // 과장·우월 단어
  { pattern: /최고의?/g, replacement: "꼼꼼한", category: "exaggeration" },
  { pattern: /최상의?/g, replacement: "꼼꼼한", category: "exaggeration" },
  { pattern: /최적의?/g, replacement: "어울리는", category: "exaggeration" },
  { pattern: /1등/g, replacement: "", category: "exaggeration" },
  { pattern: /압도적[인이]?/g, replacement: "분명한", category: "exaggeration" },
  { pattern: /기적[적인을]?/g, replacement: "자연스러운", category: "exaggeration" },
  { pattern: /놀라운/g, replacement: "자연스러운", category: "exaggeration" },
  { pattern: /완벽한/g, replacement: "균형 잡힌", category: "exaggeration" },
  { pattern: /끝판왕/g, replacement: "", category: "exaggeration" },

  // 단정 단어
  { pattern: /무조건/g, replacement: "상황에 따라", category: "absolute" },
  { pattern: /확실히/g, replacement: "분명하게", category: "absolute" },
  { pattern: /확실하게/g, replacement: "분명하게", category: "absolute" },
  { pattern: /정확하게/g, replacement: "꼼꼼하게", category: "absolute" },
  { pattern: /정확히/g, replacement: "꼼꼼하게", category: "absolute" },
  { pattern: /정확한/g, replacement: "꼼꼼한", category: "absolute" },

  // 직접 전환 단어
  { pattern: /상담/g, replacement: "확인", category: "discount-pressure" },
  { pattern: /문의/g, replacement: "확인", category: "discount-pressure" },
  { pattern: /예약/g, replacement: "방문", category: "discount-pressure" },

  // 표 헤더/추천 표현
  { pattern: /추천 대상/g, replacement: "잘 어울리는 분", category: "exaggeration" },
  { pattern: /추천드립니다/g, replacement: "안내드립니다", category: "exaggeration" },
  { pattern: /추천 드립니다/g, replacement: "안내드립니다", category: "exaggeration" },
];

/**
 * 매장 안내 블록 패턴 — 이 안에서는 단어 치환을 적용하지 않는다.
 * (실제 매장 정보 — 주소·운영시간·주차·플레이스 URL 등 사실 정보 보존)
 */
const STORE_INFO_BLOCK_PATTERNS = [
  /^매장명\s*:/m,
  /^주소\s*:/m,
  /^운영시간\s*:/m,
  /^주차\s*:/m,
  /^네이버\s*플레이스\s*:/m,
  /^홈페이지\s*:/m,
];

function isStoreInfoLine(line: string): boolean {
  return STORE_INFO_BLOCK_PATTERNS.some((pattern) => pattern.test(line));
}

function findStoreInfoBlockStart(lines: string[]): number {
  // 매장 정보 블록은 글 마지막에 한 번만 등장한다고 가정.
  // 가장 마지막에서부터 검색해 첫 매장 정보 줄을 찾는다.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isStoreInfoLine(lines[i])) {
      // 그 위로 매장명이 있을 수 있으니 한두 줄 더 위까지 거슬러 올라간다.
      let start = i;
      for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
        const trimmed = lines[j].trim();
        if (!trimmed) continue;
        if (/안경/.test(trimmed) && trimmed.length < 50) {
          start = j;
        }
      }
      return start;
    }
  }
  return -1;
}

export type SanitizeReport = {
  content: string;
  totalReplacements: number;
  byCategory: Record<Replacement["category"], number>;
  examples: Array<{ category: Replacement["category"]; from: string; to: string }>;
};

function emptyReport(content: string): SanitizeReport {
  return {
    content,
    totalReplacements: 0,
    byCategory: {
      phrase: 0,
      "medical-term": 0,
      exaggeration: 0,
      comparison: 0,
      absolute: 0,
      "discount-pressure": 0,
    },
    examples: [],
  };
}

function applyReplacements(
  text: string,
  rules: Replacement[],
  report: SanitizeReport
): string {
  let next = text;
  for (const rule of rules) {
    let count = 0;
    let firstMatch: { from: string; to: string } | undefined;
    next = next.replace(rule.pattern, (matched) => {
      count += 1;
      if (!firstMatch) {
        firstMatch = { from: matched, to: rule.replacement };
      }
      return rule.replacement;
    });
    if (count > 0) {
      report.totalReplacements += count;
      report.byCategory[rule.category] += count;
      if (firstMatch && report.examples.length < 8) {
        report.examples.push({
          category: rule.category,
          from: firstMatch.from,
          to: firstMatch.to,
        });
      }
    }
  }
  return next;
}

/**
 * 본문 전체를 받아 의료법·광고법 위반 표현을 안전 표현으로 결정론적 교체한다.
 * 매장 안내 블록(주소·운영시간·주차·플레이스 등 사실 정보)은 단어 단위 치환을
 * 건너뛰어 실제 매장 정보를 보호한다.
 */
export function sanitizeMedicalLaw(content: string): SanitizeReport {
  const report = emptyReport(content);

  const lines = content.split(/\r?\n/);
  const storeInfoStart = findStoreInfoBlockStart(lines);

  let bodyText: string;
  let storeText: string;

  if (storeInfoStart >= 0) {
    bodyText = lines.slice(0, storeInfoStart).join("\n");
    storeText = lines.slice(storeInfoStart).join("\n");
  } else {
    bodyText = content;
    storeText = "";
  }

  // 본문에는 phrase 치환 + 단어 치환 모두 적용
  let nextBody = applyReplacements(bodyText, PHRASE_REPLACEMENTS, report);
  nextBody = applyReplacements(nextBody, WORD_REPLACEMENTS, report);

  // 매장 안내에는 phrase 중 광고성 압박만 적용 (단어 치환은 매장 정보 보호 위해 건너뜀)
  let nextStore = storeText;
  if (storeText.length > 0) {
    const storePhraseRules = PHRASE_REPLACEMENTS.filter(
      (rule) => rule.category === "discount-pressure"
    );
    nextStore = applyReplacements(storeText, storePhraseRules, report);
  }

  // 연속 공백/빈 괄호 정리
  let final = nextStore.length > 0 ? `${nextBody}\n${nextStore}` : nextBody;
  final = final
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  report.content = final;
  return report;
}
