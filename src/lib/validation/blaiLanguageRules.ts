import { CAUTION_PHRASES, PROHIBITED_WORDS } from "./prohibitedWords";

const PROFANITY_WORDS = [
  "욕설",
  "비하",
  "개새",
  "병신",
  "지랄",
  "ㅅㅂ",
  "시발",
];

const ABUSE_WORDS = ["혐오", "멸칭", "비하", "조롱"];

const ADULT_WORDS = [
  "성인",
  "음란",
  "19금",
  "야동",
  "유흥",
  "노출",
];

const COMMERCIAL_WORDS = [
  "할인",
  "무료",
  "공짜",
  "최저가",
  "이벤트",
  "상담",
  "문의",
  "구매",
  "예약",
  "방문",
  "혜택",
  "프로모션",
  "특가",
];

const EMPHASIS_WORDS = [
  "가장",
  "최고",
  "최상",
  "유일",
  "완벽",
  "무조건",
  "확실",
  "정확",
  "강추",
  "1등",
  "최초",
  "최대",
];

const ADVERTISING_WORDS = [
  "추천",
  "광고",
  "홍보",
  "후기",
  "체험단",
  "협찬",
  "지원받아",
  "파트너스",
];

function uniqueMatches(content: string, candidates: string[]): string[] {
  return Array.from(new Set(candidates.filter((word) => content.includes(word))));
}

export function findProfanityWords(content: string): string[] {
  return uniqueMatches(content, PROFANITY_WORDS);
}

export function findAbuseWords(content: string): string[] {
  return uniqueMatches(content, ABUSE_WORDS);
}

export function findAdultWords(content: string): string[] {
  return uniqueMatches(content, [...ADULT_WORDS, ...PROHIBITED_WORDS]);
}

export function findCommercialWords(content: string): string[] {
  return uniqueMatches(content, COMMERCIAL_WORDS);
}

export function findEmphasisWords(content: string): string[] {
  return uniqueMatches(content, EMPHASIS_WORDS);
}

export function findAdvertisingWords(content: string): string[] {
  return uniqueMatches(content, [...ADVERTISING_WORDS, ...CAUTION_PHRASES]);
}
