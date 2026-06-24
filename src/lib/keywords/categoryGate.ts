import type { KeywordOption } from "@/types";

/**
 * 카테고리 적합성 결정론 게이트 + 공유 키워드 가드(순수 함수).
 *
 * keywords/route.ts에서 추출(동작 불변). 카테고리별 도메인 누수(콘택트가 안경테로 등)와
 * 구조 오류(2단어 위반·합성축 오류)·지역어 시작을 결정론적으로 거른다.
 * 카테고리 "positive" 적합성은 LLM 분류가 맡고, 여기서는 구조/스팸/지역/누수만 차단한다.
 *
 * 규칙을 바꾸면 keywords 후보 캐시 버전을 함께 올려 옛 결과 재유입을 막는다.
 * 테스트는 categoryGate.test.ts.
 */

/** 첫 토큰이 매장 지역어인지(생성기에 지역 박힘 방지). route의 axis 추론에도 쓰임. */
export function isRegionWord(word: string): boolean {
  return /^(장림|장림시장|공주|신관|장유|김해|충남대|궁동|심곡|진해|서면|둔산|유성|부산|대전|서울|인천|대구|광주|울산|수원|창원)/.test(word);
}

export function startsWithRegionWord(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return isRegionWord(first);
}

/** 2~3단어 조합 키워드인지(빈 토큰 없이). ※ keywordCombiner의 "정확히 2단어"판과 다름. */
export function isValidTwoWordKeyword(keyword: string): boolean {
  const parts = keyword.trim().split(/\s+/);
  return parts.length >= 2 && parts.length <= 3 && parts.every((part) => part.length >= 1);
}

/** "야간운전+안경렌즈" 처럼 수식어+상품을 한 토큰으로 붙인 합성축 오류. */
export function hasMalformedCompoundAxis(keyword: string): boolean {
  return keyword
    .trim()
    .split(/\s+/)
    .some((part) =>
    /^(야간운전|고도수|건조한|출근|초보|부모님|어머니|아버지|운전자|처음|40대|50대|60대|직장인|청소년|학생|여자|남자)(안경렌즈|안경알|난시렌즈|콘택트렌즈|원데이렌즈|컬러렌즈|하드렌즈|소프트렌즈|누진렌즈|다초점렌즈|노안안경|노안렌즈|선글라스|안경테|안경)$/.test(part)
      ||
      /^(누진렌즈|다초점렌즈|노안안경|노안렌즈|안경렌즈|안경알|기능렌즈|운전렌즈|사무용렌즈|어린이렌즈|난시렌즈|콘택트렌즈|원데이렌즈|컬러렌즈)(적응|선택|검사|착용감|관리|도수|시야|울렁임|건조|착용시간|실패|코팅|두께|운전)$/.test(part)
    );
}

export function isCategoryAppropriateCandidate(categoryId: string, option: KeywordOption): boolean {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  if (
    !isValidTwoWordKeyword(option.mainKeyword) ||
    !isValidTwoWordKeyword(option.subKeyword1) ||
    !isValidTwoWordKeyword(option.subKeyword2)
  ) {
    return false;
  }
  if (
    hasMalformedCompoundAxis(option.mainKeyword) ||
    hasMalformedCompoundAxis(option.subKeyword1) ||
    hasMalformedCompoundAxis(option.subKeyword2)
  ) {
    return false;
  }
  if (/자연스러운 제목|2단어 키워드|main_keyword|sub_keyword/.test(source)) {
    return false;
  }
  // 결정론 안전망: 브랜드명·전문수치는 정보성 제목/키워드에 부적합 → 후보 자체 드롭(프롬프트 미준수 대비).
  if (/아큐브|알콘|쿠퍼비전|바슈롬|바이오피니티|데일리스|토탈원|클라렌|메다폼|오아시스원데이/.test(source)) {
    return false;
  }
  if (/베이스커브|함수율|산소투과율/.test(source)) {
    return false;
  }
  // 소프트/원데이/일반 콘택트 "직경"은 거의 동일해 비변별(컬러·서클렌즈 직경은 변별 있어 허용).
  if (/직경/.test(source) && !/컬러렌즈|서클렌즈|미용렌즈/.test(source)) {
    return false;
  }
  if (
    startsWithRegionWord(option.mainKeyword) ||
    startsWithRegionWord(option.subKeyword1) ||
    startsWithRegionWord(option.subKeyword2) ||
    startsWithRegionWord(option.title)
  ) {
    return false;
  }
  if (/종합|사야|시간 관계|관계에서|상태가 반복|습관이 흐|검사 가는|검사가 반복|건조 검사가|보관 상태가 반복|착용 보관/.test(source)) {
    return false;
  }
  if (categoryId === "contacts") {
    if (/부모님|가정의달|새학기|자외선|휴가|야외|연말/.test(source)) return false;
  }
  if (categoryId === "frames") {
    if (/렌즈건조|렌즈충혈|원데이렌즈|콘택트렌즈|하드렌즈|소프트렌즈|선글라스|누진|다초점|변색렌즈/.test(source)) return false;
  }
  if (categoryId === "progressive") {
    if (/렌즈세척|렌즈보관|컬러렌즈|원데이렌즈|코패드|안경수리|김서림|여름|휴가|자외선/.test(source)) return false;
    if (/실내용누진 운전|실내렌즈 운전|사무용렌즈 운전|중근용렌즈 운전|운전렌즈 업무|운전렌즈 독서|돋보기안경 적응|돋보기안경 울렁임|노안렌즈 운전|노안렌즈 업무/.test(source)) {
      return false;
    }
    if (/노안렌즈.*(귀 뒤쪽|귀통증|코패드|흘러내림|피팅)/.test(source)) return false;
  }
  if (categoryId === "eye-info") {
    if (/착용시간|원데이|콘택트|렌즈착용|렌즈관리/.test(source)) return false;
    if (/시력검사.*(안경닦이|안경수리|코패드|김서림|흘러내림|피팅|귀통증)/.test(source)) return false;
  }
  if (categoryId === "lenses") {
    // 안경렌즈 카테고리에 콘택트렌즈·선글라스 도메인이 새는 것을 막는다.
    // (예: "콘택트렌즈 도수", "레이벤선글라스 도수"가 안경렌즈 후보에 섞이던 누수.)
    // 변색/블루라이트/자외선/편광/고굴절/압축/코팅렌즈는 안경렌즈이므로 건드리지 않는다.
    if (/콘택트렌즈|콘택트|원데이|소프트렌즈|하드렌즈|컬러렌즈|서클렌즈|토릭렌즈|드림렌즈|미용렌즈|멀티포컬/.test(source)) {
      return false;
    }
    if (/선글라스/.test(source)) return false;
  }
  if (categoryId === "glasses-story") {
    if (/안경수리\s+(흘러내림|착용감)|안경세척\s+코팅.*렌즈와 비교/.test(source)) return false;
    if (/안경닦이.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경케이스.*(원인|증상|시력|노안|근시|난시)/.test(source)) return false;
    if (/안경렌즈\s+원인|안경스크래치\s+처음/.test(source)) return false;
  }
  // 카테고리 적합성(positive 매칭)은 하드코딩 정규식 대신 LLM 분류 단계에서 판정한다.
  // (눈정보·안경이야기 같은 넓은 카테고리의 확장성을 위해.) 여기서는 구조/스팸/지역만 거른다.
  return !/산소투($|\s)/.test(source);
}
