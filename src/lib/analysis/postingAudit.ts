/**
 * 발행 전 포스팅 통합 점검 (블라이 "포스팅 통합 분석" 대응)
 *
 * 블라이 강의: 발행 버튼을 누르기 전 본문을 넣고, 제목 형태소가 본문에 충분히
 * 깔렸는지(질의 의도 집중), 특정 형태소가 과도하게 반복되는지, 비속어/상업성/과장
 * 표현이 있는지, 이미지·글자 수는 적정한지를 점검한다.
 *
 * 새 엔진을 만들지 않고, 이미 있는 분석기를 한 리포트로 집계한다.
 *  - analyzeMorphology: 제목 형태소 본문 활성화 / 반복 / 다양성
 *  - findOverusedWords: 20회 이상 과다 반복
 *  - blaiLanguageRules: 비속어/욕설/성인/상업/과장/광고 표현
 * 순수 로컬 분석이라 네이버 자격증명이 필요 없다.
 */

import { analyzeMorphology } from "@/lib/validation/morphologyAnalyzer";
import { findOverusedWords } from "@/lib/validation/repetitionCheck";
import { titleContainsMainKeyword } from "@/lib/validation/keywordRules";
import {
  findProfanityWords,
  findAbuseWords,
  findAdultWords,
  findCommercialWords,
  findEmphasisWords,
  findAdvertisingWords,
} from "@/lib/validation/blaiLanguageRules";

export interface PostingAuditResult {
  status: "ok" | "review";
  charCount: number;
  imageCount: number;
  commaCount: number;
  /** 질의 의도 집중: 제목 형태소가 본문에 얼마나 깔렸는가 */
  queryIntentFocus: {
    titleMorphemes: string[];
    activatedInBody: string[];
    missingInBody: string[];
    /** 0~1, 제목 형태소 중 본문 활성화 비율 */
    coverageRatio: number;
    /**
     * 메인 키워드가 본문 초반(첫 INTRO_WINDOW자)에 자연스럽게 등장하는가.
     * 검수 신호일 뿐(차단 아님). mainKeyword 미제공 시 undefined.
     */
    mainKeywordInIntro?: boolean;
    /**
     * 메인 키워드가 소제목(마크다운 헤딩 또는 굵은 단독 라인)에 등장하는가.
     * 평문 본문이면 false. mainKeyword 미제공 시 undefined.
     */
    mainKeywordInSubheading?: boolean;
  };
  /**
   * 보조 키워드(서브1/2)가 본문에 단순 포함되는지의 검수 신호.
   * 억지 삽입을 유도하지 않으며 단순 present 여부만 보고한다.
   */
  subKeywordCoverage?: Array<{ keyword: string; present: boolean }>;
  /** 본문 반복 상위 형태소(비중) */
  topRepeatedMorphemes: Array<{ token: string; count: number }>;
  uniqueBodyMorphemeCount: number;
  /** 20회 이상 과다 반복 단어(스팸 위험) */
  overusedWords: Array<{ word: string; count: number }>;
  languageFlags: {
    profanity: string[];
    abuse: string[];
    adult: string[];
    commercial: string[];
    emphasis: string[];
    advertising: string[];
  };
  warnings: string[];
}

function countMarkdownImages(body: string): number {
  const md = (body.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  const placeholder = (body.match(/\(이미지[^)]*\)|\[이미지[^\]]*\]/g) ?? []).length;
  return md + placeholder;
}

/** 본문 초반으로 간주하는 글자 수 창(검수 신호 기준). 테스트에서 고정한다. */
const INTRO_WINDOW = 200;

/**
 * 소제목으로 간주하는 라인 텍스트만 추출한다.
 *  - 마크다운 ATX 헤딩(#, ##, ###)
 *  - 한 줄 전체가 굵게 처리된 라인(**소제목**) — 흔한 소제목 표기
 * 평문 본문이면 빈 배열 → 메인 키워드 소제목 배치는 false가 된다.
 */
function extractSubheadingTexts(body: string): string[] {
  const texts: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,3}\s+(.*\S)\s*$/);
    if (heading) {
      texts.push(heading[1]);
      continue;
    }
    const bold = line.match(/^\*\*(.+?)\*\*$/);
    if (bold) {
      texts.push(bold[1]);
    }
  }
  return texts;
}

export function auditPosting(params: {
  title: string;
  body: string;
  mainKeyword?: string;
  subKeyword1?: string;
  subKeyword2?: string;
}): PostingAuditResult {
  const { title, body } = params;
  const keywords = [params.mainKeyword, params.subKeyword1, params.subKeyword2]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);

  const morphology = analyzeMorphology({ title, content: body, keywords });

  const titleMorphemes = morphology.titleMorphemes;
  const activatedInBody = morphology.titleMorphemesActivatedInBody;
  const missingInBody = morphology.missingTitleMorphemesInBody;
  const coverageRatio =
    titleMorphemes.length > 0 ? activatedInBody.length / titleMorphemes.length : 1;

  // Phase 2 검수 신호(가법적, 비차단): 메인 키워드 배치 + 보조 키워드 충족도.
  const mainKeyword = (params.mainKeyword ?? "").trim();
  const introText = body.replace(/\r/g, "").trimStart().slice(0, INTRO_WINDOW);
  const subheadingTexts = extractSubheadingTexts(body);
  const mainKeywordInIntro = mainKeyword
    ? titleContainsMainKeyword(introText, mainKeyword)
    : undefined;
  const mainKeywordInSubheading = mainKeyword
    ? subheadingTexts.some((text) => titleContainsMainKeyword(text, mainKeyword))
    : undefined;
  const subKeywordCoverage = [params.subKeyword1, params.subKeyword2]
    .map((k) => (k ?? "").trim())
    .filter(Boolean)
    .map((keyword) => ({ keyword, present: body.includes(keyword) }));

  const overusedWords = findOverusedWords(body);

  const languageFlags = {
    profanity: findProfanityWords(body),
    abuse: findAbuseWords(body),
    adult: findAdultWords(body),
    commercial: findCommercialWords(body),
    emphasis: findEmphasisWords(body),
    advertising: findAdvertisingWords(body),
  };

  const charCount = body.replace(/\r/g, "").length;
  const imageCount = countMarkdownImages(body);
  const commaCount = (body.match(/,/g) ?? []).length;

  const warnings: string[] = [];

  if (missingInBody.length > 0) {
    warnings.push(
      `제목 형태소 중 본문에 없는 것: ${missingInBody.join(", ")} — 질의 의도가 흐려질 수 있으니 본문에 자연스럽게 풀어주세요.`
    );
  }
  if (coverageRatio < 0.6 && titleMorphemes.length > 0) {
    warnings.push(
      `제목 형태소 본문 활성화율이 ${Math.round(coverageRatio * 100)}%로 낮습니다. 제목-본문 정합성을 높이세요.`
    );
  }
  if (overusedWords.length > 0) {
    warnings.push(
      `20회 이상 반복된 단어: ${overusedWords
        .slice(0, 5)
        .map((w) => `${w.word}(${w.count})`)
        .join(", ")} — 과도 반복은 스팸 신호가 될 수 있습니다.`
    );
  }
  const topRepeated = morphology.repeatedBodyMorphemes.slice(0, 10).map((m) => ({
    token: m.token,
    count: m.count,
  }));
  if (topRepeated.length > 0 && topRepeated[0].count >= 12) {
    warnings.push(
      `"${topRepeated[0].token}"가 ${topRepeated[0].count}회로 비중이 과도합니다. 다른 형태소와 균형을 맞추세요.`
    );
  }
  // 어미 단조로움 — 한국어 AI 글의 대표 신호("거든요/답니다" 설명조 돌려막기).
  const geudeunyoCount = (body.match(/거든요/g) ?? []).length;
  const damnidaCount = (body.match(/답니다/g) ?? []).length;
  if (geudeunyoCount > 3 || damnidaCount > 3) {
    warnings.push(
      `어미 단조로움: "거든요" ${geudeunyoCount}회 · "답니다" ${damnidaCount}회 — 설명조 어미가 반복되면 AI가 쓴 티가 납니다. 평서 마침과 단문을 섞어 다양화하세요.`
    );
  }
  if (commaCount > 0) {
    warnings.push(`쉼표(,)가 ${commaCount}개 있습니다. 이 프로젝트 규칙상 쉼표는 사용하지 않습니다.`);
  }
  if (imageCount === 0) {
    warnings.push("본문에 이미지가 없습니다. 상위 글 대비 정보량/체류시간에서 불리할 수 있습니다.");
  }
  const flaggedLang = [
    ...languageFlags.profanity,
    ...languageFlags.abuse,
    ...languageFlags.adult,
    ...languageFlags.commercial,
    ...languageFlags.emphasis,
    ...languageFlags.advertising,
  ];
  if (flaggedLang.length > 0) {
    warnings.push(`주의 표현 검출: ${Array.from(new Set(flaggedLang)).slice(0, 10).join(", ")}`);
  }

  return {
    status: warnings.length === 0 ? "ok" : "review",
    charCount,
    imageCount,
    commaCount,
    queryIntentFocus: {
      titleMorphemes,
      activatedInBody,
      missingInBody,
      coverageRatio,
      mainKeywordInIntro,
      mainKeywordInSubheading,
    },
    subKeywordCoverage,
    topRepeatedMorphemes: topRepeated,
    uniqueBodyMorphemeCount: morphology.uniqueBodyMorphemeCount,
    overusedWords,
    languageFlags,
    warnings,
  };
}
