/**
 * 공유 타입: 발행 전 포스팅 통합 점검 결과(PostingAuditResult).
 *
 * postingAudit.ts(생산)와 CRankAudit.tsx(소비)가 동일 타입을 쓰도록 단일화한다.
 * 순수 타입 모듈(런타임 코드/외부 import 없음) — 순환참조가 발생하지 않는다.
 */

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
