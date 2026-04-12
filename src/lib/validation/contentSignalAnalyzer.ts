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

export function analyzeLanguageRisk(content: string): LanguageRiskAnalysis {
  const profanity = findProfanityWords(content);
  const abuse = findAbuseWords(content);
  const adult = findAdultWords(content);
  const commercial = findCommercialWords(content);
  const emphasis = findEmphasisWords(content);
  const advertising = findAdvertisingWords(content);

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
  ];

  return {
    profanity,
    abuse,
    adult,
    commercial,
    emphasis,
    advertising,
    issues,
  };
}
