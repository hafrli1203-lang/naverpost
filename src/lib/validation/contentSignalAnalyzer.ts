import type {
  AnalysisIssue,
  LanguageRiskAnalysis,
} from "@/types";
import {
  findAbuseWords,
  findAdultWords,
  findAdvertisingWords,
  findCommercialWords,
  findEmphasisWords,
  findProfanityWords,
} from "./blaiLanguageRules";
type ToneId = "standard" | "friendly" | "casual";

function normalizeTone(tone?: string): ToneId {
  if (tone === "friendly" || tone === "casual") return tone;
  return "standard";
}

function issuesForWords(
  words: string[],
  code: string,
  label: string,
  reasonPrefix: string,
  severity: "low" | "medium" | "high"
): AnalysisIssue[] {
  if (words.length === 0) return [];
  return [
    {
      code,
      label,
      reason: `${reasonPrefix}: ${words.join(", ")}`,
      severity,
      source: "document-rule",
    },
  ];
}

// 주의: 1인칭 경험 표현("매장에서도 자주 듣는" "경험 있으시죠")은 D.I.A. 경험
// 신호로 프롬프트가 권장하므로 이 목록에 넣지 않는다 (권장-검증 충돌 방지).
const AI_CLICHE_PATTERNS: RegExp[] = [
  /느끼신 적 있으신가요/g,
  /한 번쯤 있으셨을 거예요/g,
  /많은 분들이/g,
  /이번 글에서는/g,
  /살펴볼게요/g,
  /정리해봤어요/g,
  /정리해보려 합니다/g,
  /풀어드리겠습니다/g,
  /차근차근/g,
  /꼭 알아야 할/g,
  /도움이 돼요/g,
  /보탬이 될 거예요/g,
  /다음 .*선택을 위한 사전 점검/g,
  /원인 후보/g,
  /판별 축/g,
  /확인 순서/g,
  /각각 다른 방식으로 영향을/g,
  /어느 거리에서 어느 시간대/g,
  /유효한 정보입니다/g,
  /기준이 됩니다/g,
  /논의로 이어집니다/g,
];

// 검출 즉시 수정 루프를 발동시키는 강한 AI 상투어.
// 한국어 AI 글 실무·연구에서 공통 지적되는 무결성 높은 목록만 담는다
// (모호한 표현은 위 소프트 목록 유지 — 과차단 방지).
const STRONG_AI_CLICHE_PATTERNS: RegExp[] = [
  /이처럼/g,
  /이러한/g,
  /이를 통해/g,
  /뿐만 아니라/g,
  /알아보겠습니다/g,
  /살펴보겠습니다/g,
  /이상으로/g,
  /도움이 되셨길/g,
  /참고하시기 바랍니다/g,
  /첫째[,，]/g,
  /둘째[,，]/g,
];

function findStrongAiCliches(content: string): string[] {
  const found = new Set<string>();
  for (const pattern of STRONG_AI_CLICHE_PATTERNS) {
    const matches = content.match(pattern) ?? [];
    matches.forEach((match) => found.add(match));
  }
  return Array.from(found);
}

// 프롬프트 지침 어휘가 본문 구조(소제목·표 머리글)로 그대로 새어나온 경우를 잡는다.
// 평문의 자연스러운 "신호"(예: "위험 신호")는 오검출되지 않도록 구조 위치에서만,
// 그리고 '집/안경원' 대비 프레임과 결합된 경우로 한정한다. "넘겨짚"은 출력에 쓰일 때
// 거의 항상 지침 누수(넘겨짚다=잘못 짐작하다)이므로 구조 위치에서 단독으로도 잡는다.
const TEMPLATE_LEAK_PATTERN = /(집에서|안경원에서|매장에서)[^|\n]{0,12}신호/;

function findTemplateLeakSignals(content: string): string[] {
  const issues = new Set<string>();
  const lines = content.split(/\r?\n/);
  const headings = lines.filter((line) => line.trim().startsWith("##"));
  const tableRows = lines.filter((line) => line.trim().startsWith("|"));

  for (const heading of headings) {
    if (/넘겨짚/.test(heading) || TEMPLATE_LEAK_PATTERN.test(heading)) {
      const text = heading.replace(/^#+\s*/, "").trim();
      issues.add(`소제목에 지침 단어가 그대로 노출됨("${text}")`);
      break;
    }
  }
  for (const row of tableRows) {
    if (/넘겨짚/.test(row) || TEMPLATE_LEAK_PATTERN.test(row)) {
      issues.add("표 머리글에 '집에서/안경원에서 ~신호' 식 지침 단어가 그대로 들어감");
      break;
    }
  }
  return Array.from(issues);
}

// 표 행·매장 안내 블록을 제외한 본문 텍스트.
function getProseBody(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("|") && !trimmed.startsWith("[") && trimmed !== "---";
    })
    .join("\n");
}

// 본문 쉼표(천단위 숫자 제외) — 프로젝트 절대 규칙이자 한국어 AI 글의 최강 탐지 신호.
function findFormatViolations(content: string): string[] {
  const violations: string[] = [];
  const prose = getProseBody(content).replace(/\d[,，]\d/g, "00");
  const commaCount = (prose.match(/[,，]/g) ?? []).length;
  if (commaCount >= 3) {
    violations.push(`본문 쉼표 ${commaCount}회 사용(금지 규칙 위반)`);
  }
  return violations;
}

// 사람화 보조 신호: 동일 어미 3연속, 문두 접속사 과다 — 소프트(수정 지시문에만 반영).
function findHumanizationSignals(content: string): string[] {
  const signals: string[] = [];
  const prose = getProseBody(content).replace(/^##.*$/gm, "");

  const sentences = prose
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 5);
  let streak = 1;
  for (let i = 1; i < sentences.length; i += 1) {
    const prev = sentences[i - 1].replace(/[.!?]+$/, "").slice(-3);
    const curr = sentences[i].replace(/[.!?]+$/, "").slice(-3);
    streak = prev && prev === curr ? streak + 1 : 1;
    if (streak >= 3) {
      signals.push(`동일 어미 "${curr}" ${streak}문장 연속`);
      break;
    }
  }

  const conjunctionStarts = (
    prose.match(/(?:^|\n|\. )(그리고|그래서|하지만|또한|따라서|그런데)\s/g) ?? []
  ).length;
  if (conjunctionStarts >= 4) {
    signals.push(`문두 접속사 ${conjunctionStarts}회(권장 3회 이하)`);
  }

  return signals;
}

function findAiCliches(content: string): string[] {
  const found = new Set<string>();
  for (const pattern of AI_CLICHE_PATTERNS) {
    const matches = content.match(pattern) ?? [];
    matches.forEach((match) => found.add(match));
  }
  return Array.from(found);
}

function findToneMismatches(content: string, tone?: string): string[] {
  if (!tone) return [];
  const normalizedTone = normalizeTone(tone);

  const body = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith("|") &&
        !trimmed.startsWith("[") &&
        !trimmed.startsWith("##") &&
        trimmed !== "---"
      );
    })
    .join("\n");

  const mismatches = new Set<string>();
  const sentenceCount = Math.max(
    1,
    (body.match(/(?:요|다|죠|니다|습니다|입니다|됩니다)\./g) ?? []).length
  );
  const formalEndings =
    body.match(
      /[가-힣](?:합니다|했습니다|습니다|됩니다|입니다|집니다|듭니다|봅니다|갑니다|옵니다|납니다|않습니다|있습니다|없습니다|필요합니다|중요합니다|이어집니다|구성됩니다|제공됩니다|작용합니다)(?:\.|$)/g
    ) ?? [];
  const casualEndings =
    body.match(/(?:해요|돼요|예요|이에요|있어요|없어요|거예요|느껴져요|좋아요|쉬워요|달라져요|수월해요)(?:\.|$)/g) ??
    [];

  if (normalizedTone === "friendly") {
    if (formalEndings.length >= 1 || formalEndings.length / sentenceCount >= 0.08) {
      mismatches.add(`friendly 글에 다나까체 문장 끝이 많음(${formalEndings.length}개)`);
    }
    if (casualEndings.length === 0 && sentenceCount >= 4) {
      mismatches.add("friendly 글인데 해요체 문장 끝이 거의 없음");
    }
    if (/(가능성이 있습니다|존재합니다|위치합니다|나타납니다|필요가 있습니다|살펴보는 것이 좋습니다|기준이 됩니다|유효한 정보입니다|논의로 이어집니다|설계됩니다|구성됩니다)/.test(body)) {
      mismatches.add("friendly 글에 보고서식 설명 문장이 남아 있음");
    }
  }
  if (normalizedTone === "standard") {
    if (casualEndings.length >= 2 || casualEndings.length / sentenceCount >= 0.18) {
      mismatches.add(`standard 글에 해요체 문장 끝이 많음(${casualEndings.length}개)`);
    }
  }
  if (normalizedTone === "casual") {
    if (formalEndings.length >= 3 || formalEndings.length / sentenceCount >= 0.25) {
      mismatches.add(`casual 글에 다나까체 문장 끝이 많음(${formalEndings.length}개)`);
    }
  }
  return Array.from(mismatches);
}

function getParagraphBlocks(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => {
      if (!block) return false;
      if (block.startsWith("##")) return false;
      if (block.startsWith("|")) return false;
      if (block.startsWith("[")) return false;
      if (block === "---") return false;
      return true;
    });
}

function getIntroBlocks(content: string): string[] {
  const beforeFirstHeading = content.split(/\n##\s+/)[0] ?? content;
  return getParagraphBlocks(beforeFirstHeading);
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function findRepeatedSentenceEndings(content: string): string[] {
  const endings =
    content.match(
      /(?:합니다|했습니다|습니다|됩니다|입니다|있습니다|없습니다|해요|돼요|예요|이에요|있어요|없어요|좋아요|수월해요|달라져요)(?:\.|$)/g
    ) ?? [];
  const normalized = endings.map((ending) => ending.replace(/\.$/, ""));
  const issues: string[] = [];
  let streak = 1;
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i] === normalized[i - 1]) {
      streak += 1;
      if (streak === 4) {
        issues.push(`같은 문장 어미가 연속 반복됨(${normalized[i]})`);
      }
    } else {
      streak = 1;
    }
  }
  return issues;
}

function findMechanicalSignals(content: string): string[] {
  const issues = new Set<string>();
  const headings = content.match(/^##\s+.+$/gm) ?? [];
  const paragraphs = getParagraphBlocks(content);

  const templateHeadingCount = headings.filter((heading) =>
    /(기준|확인|관리|선택|차이|이유|원인|방법)$/.test(heading.trim())
  ).length;
  if (headings.length >= 4 && templateHeadingCount / headings.length >= 0.75) {
    issues.add("소제목 끝 단어가 반복되어 기계식 제목처럼 보임");
  }

  const repeatedKeywordCount =
    countMatches(content, /기준/g) +
    countMatches(content, /확인/g) +
    countMatches(content, /관리/g) +
    countMatches(content, /선택/g);
  if (repeatedKeywordCount >= 28) {
    issues.add(`기준/확인/관리/선택 단어 반복이 많음(${repeatedKeywordCount}회)`);
  }

  const summaryRepeatCount = paragraphs.filter((paragraph) =>
    /^(정보형 통테일 검색 의도에 맞춘|지역 방문 전환을 노린|제품 차이와 선택 기준을 비교형으로|본문 소주제를 나누기 쉬운|방문 전 확인 항목으로)/.test(
      paragraph
    )
  ).length;
  if (summaryRepeatCount > 0) {
    issues.add("문단 앞에 평가 문구나 생성 메모가 본문처럼 남아 있음");
  }

  const bridgeCliches = countMatches(
    content,
    /(살펴보는 게 좋아요|살펴볼 필요가 있습니다|구분해두면|도움이 됩니다|도움이 될 수 있어요|수월합니다|수월해요|원인은 한 가지가 아니에요|원인은 한 가지가 아닙니다)/g
  );
  if (bridgeCliches >= 5) {
    issues.add(`약한 안내 문구가 반복됨(${bridgeCliches}회)`);
  }

  const repeatedParagraphStarts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const start = paragraph.replace(/^[-*]\s*/, "").slice(0, 12);
    if (start.length >= 6) {
      repeatedParagraphStarts.set(start, (repeatedParagraphStarts.get(start) ?? 0) + 1);
    }
  }
  for (const [start, count] of repeatedParagraphStarts) {
    if (count >= 3) {
      issues.add(`비슷한 문단 시작이 반복됨("${start}..." ${count}회)`);
      break;
    }
  }

  for (const issue of findRepeatedSentenceEndings(content)) {
    issues.add(issue);
  }

  return Array.from(issues);
}

function findWeakHooks(content: string): string[] {
  const issues = new Set<string>();
  const blocks = getParagraphBlocks(content);
  const introBlocks = getIntroBlocks(content);
  const intro = introBlocks.join("\n");
  const introSentences = intro
    .split(/(?<=요\.|니다\.|다\.|죠\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const introLastSentence = introSentences[introSentences.length - 1] ?? "";
  const last = blocks.slice(-2).join("\n");
  const hasDiagnosticAxis = (sentence: string) =>
    /(거리|시간대|상황|패턴|위치|각도|도수|피팅|설계|착용|흐림|초점|화면|서류|운전|실내|야간)/.test(
      sentence
    ) && /(달라|나뉘|구분|좁히|원인|순서|확인|판단|이어)/.test(sentence);
  const weakAdvicePattern =
    /먼저 살펴보는 게 좋아요|구분해보세요|대처하기 수월해|확인해보면 좋아요|살펴볼 필요가 있어요/;

  if (/^(컴퓨터|아침|회의|렌즈|안경|누진렌즈|실내용|업무|운전)/.test(intro) && !/(불편|흐릿|번져|답답|좁|흘러|눌|피로|초점|흔들|울렁|어지러)/.test(intro.slice(0, 90))) {
    issues.add("도입부 첫 문장이 독자 불편을 빠르게 잡지 못함");
  }
  if (
    weakAdvicePattern.test(introLastSentence) &&
    !hasDiagnosticAxis(introLastSentence)
  ) {
    issues.add("도입부 마지막 문장이 판별 기준 없이 일반 조언으로 끝남");
  }
  if (introSentences.some((sentence) => weakAdvicePattern.test(sentence) && !hasDiagnosticAxis(sentence))) {
    issues.add("도입부에 판별 기준 없는 일반 조언 문장이 있음");
  }
  if (
    introLastSentence &&
    !hasDiagnosticAxis(introLastSentence) &&
    /좋아요|수월해요|필요가 있어요|중요해요/.test(introLastSentence)
  ) {
    issues.add("도입부 마지막 문장에 증상 판별 축이 부족함");
  }
  if (/이번 글에서는|살펴봅니다|정리해보|풀어드리/.test(intro)) {
    issues.add("도입부에 메타 안내문이 남아 있음");
  }
  if (/함께 살펴볼 수 있어요|도움이 될 수 있어요|확인해 주세요|방문하면 좋습니다|수월합니다\.?$/.test(last)) {
    issues.add("마무리가 약한 안내 문구로 끝남");
  }
  if (!/(가져오|메모|시간대|거리|착용|상황|불편|초점|자국|흘러내림)/.test(last)) {
    issues.add("마무리에 독자가 가져갈 구체 행동 기준이 부족함");
  }

  return Array.from(issues);
}

export function analyzeLanguageRisk(content: string, tone?: string): LanguageRiskAnalysis {
  const profanity = findProfanityWords(content);
  const abuse = findAbuseWords(content);
  const adult = findAdultWords(content);
  const commercial = findCommercialWords(content);
  const emphasis = findEmphasisWords(content);
  const advertising = findAdvertisingWords(content);
  const aiCliches = findAiCliches(content);
  const strongAiCliches = findStrongAiCliches(content);
  const formatViolations = findFormatViolations(content);
  const toneMismatches = findToneMismatches(content, tone);
  const templateLeaks = findTemplateLeakSignals(content);
  const weakHooks = findWeakHooks(content);
  const mechanicalSignals = [
    ...findMechanicalSignals(content),
    ...findHumanizationSignals(content),
  ];

  const issues: AnalysisIssue[] = [
    ...issuesForWords(
      profanity,
      "profanity-detected",
      "비속어 검출",
      "문서 기준 제거 대상 단어가 검출되었습니다",
      "high"
    ),
    ...issuesForWords(
      abuse,
      "abuse-detected",
      "비하 표현 검출",
      "문서 기준 위험 표현이 검출되었습니다",
      "high"
    ),
    ...issuesForWords(
      adult,
      "adult-detected",
      "성인/민감 표현 검출",
      "문서 기준 제거 또는 강한 주의가 필요한 표현이 검출되었습니다",
      "high"
    ),
    ...issuesForWords(
      commercial,
      "commercial-overuse-risk",
      "상업어 사용",
      "문서 기준 과다 사용 시 위험한 상업어가 검출되었습니다",
      "medium"
    ),
    ...issuesForWords(
      emphasis,
      "emphasis-overuse-risk",
      "강조어 사용",
      "문서 기준 과다 사용 시 위험한 강조어가 검출되었습니다",
      "medium"
    ),
    ...issuesForWords(
      advertising,
      "advertising-overuse-risk",
      "광고성 표현 사용",
      "문서 기준 광고성 표현이 검출되었습니다",
      "medium"
    ),
    ...issuesForWords(
      aiCliches,
      "ai-cliche-detected",
      "AI 문체 신호",
      "발행 전 자연화가 필요한 AI 블로그 문구가 검출되었습니다",
      "medium"
    ),
    ...issuesForWords(
      strongAiCliches,
      "strong-ai-cliche-detected",
      "강한 AI 상투어",
      "AI가 쓴 글의 대표 신호로 자동 수정 대상입니다",
      "high"
    ),
    ...issuesForWords(
      formatViolations,
      "format-violation-detected",
      "형식 위반",
      "본문 형식 절대 규칙 위반으로 자동 수정 대상입니다",
      "high"
    ),
    ...issuesForWords(
      templateLeaks,
      "template-leak-detected",
      "지침 단어 노출",
      "작성 지침용 단어가 소제목·표 머리글에 그대로 노출되어 자동 수정 대상입니다",
      "high"
    ),
    ...issuesForWords(
      toneMismatches,
      "tone-mismatch-detected",
      "문체 불일치",
      "선택한 문체와 맞지 않는 어미 반복이 검출되었습니다",
      "high"
    ),
    ...issuesForWords(
      weakHooks,
      "weak-hook-detected",
      "도입/마무리 약함",
      "도입부 또는 마무리의 읽기 지속성과 행동 기준이 약합니다",
      "medium"
    ),
    ...issuesForWords(
      mechanicalSignals,
      "mechanical-writing-detected",
      "기계식 문장 구조",
      "사람이 쓴 글처럼 보이도록 다시 다듬어야 하는 반복 구조가 검출되었습니다",
      "medium"
    ),
  ];

  return {
    profanity,
    abuse,
    adult,
    commercial,
    emphasis,
    advertising,
    aiCliches,
    strongAiCliches,
    formatViolations,
    toneMismatches,
    templateLeaks,
    weakHooks,
    mechanicalSignals,
    issues,
  };
}
