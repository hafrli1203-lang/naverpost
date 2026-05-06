export const NAVER_TITLE_SKILL_RULES = `- 제목 15~30자.
- 메인 키워드는 제목 앞쪽에 원형 그대로 포함.
- 서브 키워드 2개는 본문 확장 소재입니다. 제목에는 둘 중 하나의 핵심 의미만 자연스럽게 보여도 됩니다.
- 서브 키워드 2개를 모두 제목에 억지로 붙여 "A와 B 확인/기준"처럼 만들지 마세요.
- 제목은 검색어 나열이 아니라 독자의 상황, 불편, 선택 장면이 읽히는 문장이어야 합니다.
- "확인", "기준"은 검사/비교 소재에만 제한적으로 사용합니다. 같은 후보 묶음에서 반복하지 마세요.
- 지역명은 자동으로 넣지 마세요. 지역명은 사용자가 최종 작성 단계에서 직접 붙입니다.
- 좋은 구조: 핵심키워드 + 실제 불편/사용 장면 + 원인/결과/선택 기준.
- "차이", "달라지는 점", "맞는 이유", "봐야 하는 이유"는 반복되면 기계적으로 보이므로 제한적으로만 사용합니다.
- 금지 구조: "A와 B 확인", "A와 B 기준", "A B C 기준", "확인 기준과 관리", "살펴보기".
- 좋은 제목 예:
  - 누진렌즈 울렁임 적응이 어려운 이유
  - 어린이시력 검사 근시가 걱정될 때
  - 안경피팅 착용감 코패드 위치가 맞지 않을 때
  - 티타늄안경 선택 전 무게감 차이
  - 안경흘러내림 원인 코패드 높이가 맞지 않을 때`;

export const MECHANICAL_TITLE_PATTERNS = [
  /.+와 .+ 확인$/,
  /.+과 .+ 확인$/,
  /.+와 .+ 기준$/,
  /.+과 .+ 기준$/,
  /확인 기준/,
  /기준.*기준/,
  /확인.*확인/,
  /살펴보기$/,
  /맞는 이유$/,
  /때문에 달라지는 점$/,
  /부터 봐야 하는 이유$/,
  /지역명/,
];

function getSecondToken(keyword: string): string {
  return keyword.trim().split(/\s+/)[1] ?? "";
}

function hasFinalConsonant(word: string): boolean {
  const char = word.charCodeAt(word.length - 1);
  if (char < 0xac00 || char > 0xd7a3) return false;
  return (char - 0xac00) % 28 !== 0;
}

function subjectPhrase(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "이" : "가"}`;
}

function firstAvailable(...values: string[]): string {
  return values.find((value) => value.trim().length > 0) ?? "";
}

export function isMechanicalNaverTitle(title: string): boolean {
  return MECHANICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title)) ||
    /(검사와 관리 차이|검사 후 관리가 필요한 경우|습관과 검사 기준|야간과 검사 기준|조명 기준|확인해야 할 때|교체 전 .+와 .+$|선택 전 .+와 .+$|검사 전 .+와 .+$|중 .+와 .+$|기준 .+와 .+ 차이|기준 .+까지 봐야 하는 이유|차이로 달라지는 점|.+와 .+ 차이$|.+과 .+ 차이$|.+와 .+$|.+과 .+$)/.test(title);
}

export function rewriteNaverTitle(params: {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
}): string {
  const { title, mainKeyword, subKeyword1, subKeyword2 } = params;
  const mainCore = getSecondToken(mainKeyword);
  const sub1Core = getSecondToken(subKeyword1);
  const sub2Core = getSecondToken(subKeyword2);
  const titleCore = firstAvailable(
    title.includes(sub1Core) ? sub1Core : "",
    title.includes(sub2Core) ? sub2Core : "",
    sub1Core,
    sub2Core,
    mainCore
  );
  const secondaryCore = titleCore === sub1Core ? sub2Core : sub1Core;

  if (/흘러내림|귀통증|코패드/.test(mainKeyword)) {
    return `${mainKeyword} ${titleCore} 위치가 맞지 않을 때`;
  }

  if (/원인|흐림|피로|불편|충혈|건조|눈부심/.test(mainKeyword)) {
    return `${mainKeyword} ${subjectPhrase(titleCore)} 반복되는 이유`;
  }

  if (/근시억제렌즈|근시완화렌즈/.test(mainKeyword)) {
    if (/도수/.test(`${subKeyword1} ${subKeyword2}`)) {
      return `${mainKeyword} 도수 변화가 걱정될 때`;
    }
    return `${mainKeyword} 어린이 근시가 걱정될 때`;
  }

  if (/검사|시력/.test(mainKeyword)) {
    if (/어린이|근시|청소년/.test(`${subKeyword1} ${subKeyword2} ${mainKeyword}`)) {
      if (/근시/.test(`${subKeyword1} ${subKeyword2}`)) return `${mainKeyword} 근시가 걱정될 때`;
      return `${mainKeyword} 전에 알아둘 부분`;
    }
    return `${mainKeyword} 전에 알아둘 부분`;
  }

  if (/선택|고르/.test(mainKeyword)) {
    if (/눈피로|눈부심|자외선|야간/.test(`${subKeyword1} ${subKeyword2}`)) {
      return `${mainKeyword} 전 ${subjectPhrase(titleCore)} 걱정될 때`;
    }
    if (/무게|두께|소재|탄성|착용감|피부톤|인상|얼굴형/.test(`${subKeyword1} ${subKeyword2}`)) {
      return `${mainKeyword}할 때 ${titleCore} 차이`;
    }
    return `${mainKeyword}할 때 달라지는 부분`;
  }

  if (/관리|세척|보관|교체/.test(mainKeyword)) {
    if (/자국|흠집|얼룩|손상|변형|나사/.test(`${subKeyword1} ${subKeyword2}`)) {
      return `${mainKeyword} 전 ${titleCore}부터 살펴볼 때`;
    }
    return `${mainKeyword}에서 놓치기 쉬운 부분`;
  }

  if (/적응|착용|운전|사용/.test(mainKeyword)) {
    if (secondaryCore) return `${mainKeyword} ${titleCore} 때문에 불편할 때`;
    return `${mainKeyword} 중 불편할 때`;
  }

  if (/특징|차이/.test(mainKeyword)) {
    if (secondaryCore) return `${mainKeyword} ${titleCore}에서 느껴지는 차이`;
    return `${mainKeyword} 알아둘 부분`;
  }

  return isMechanicalNaverTitle(title)
    ? `${mainKeyword} ${titleCore} 때문에 불편할 때`
    : title;
}

export function reviseMechanicalNaverTitle(params: {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
}): string {
  const { title } = params;
  if (!isMechanicalNaverTitle(title)) return title;

  return rewriteNaverTitle(params);
}
