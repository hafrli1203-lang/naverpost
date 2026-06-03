# 블라이 글쓰기 신호 본문 연결 (설계 문서)

> 상태: 구현 완료(2026-06-03). 사용자 승인 후 G1+G2+G3 전부 구현, G3는 "자완 전용 보강 1회 허용" 방식 채택. type-check/lint 통과. 라이브 본문 스모크는 미실행.
> 작성일: 2026-06-03
> 선행: 키워드 단계 정상화 완료([[project_keyword_pipeline_fix]]). 이 문서는 "본문이 독자가 실제로 궁금해하는 글이 되게" 만드는 단계.

## 1. 목적
계산만 되고 본문 프롬프트에 안 들어가던 블라이 신호 3종을 본문 생성/수정에 실제 주입한다.
- 상위노출 글의 **본문 구조**(체크리스트/단계형/FAQ 등)와 **주의점/본문 명사**를 본문 작성 지시에 반영
- **스마트블록 하위키워드**를 본문 소제목 소재로 반영
- 작성된 초안에서 **자완 색인(자동완성) 누락 키워드**를 찾아 수정 단계에서 자연스럽게 보강

원칙: 외부 사이트 연동 없음(원천은 네이버 OpenAPI/자동완성, 이미 보유). 하드코딩 문장 삽입 금지 — 신호는 "지시/소재"로만 주입하고 문장은 LLM이 쓴다.

## 2. 현재 상태 (확인 완료)
- `api/article/route.ts`: research(Perplexity)+RSS+competitorMorphology 병렬 → `buildArticleBrief` → `buildArticlePrompt`(info)/`buildPromoPrompt`(promo) → `writeArticle` → `validateContent` → 필요시 `reviseArticle`(1회).
- `buildArticleBrief`는 competitorMorphology **전체**(commonNouns/titleNouns/bodyNouns/bodyHighlights/titleAngles/contentBlocks/cautionPoints)를 brief에 담는다.
- 그러나 `buildArticlePrompt`는 **commonNouns + titleNouns만** 렌더링. 나머지(contentBlocks/cautionPoints/bodyNouns)는 brief에 있지만 미사용.
- `inferSmartBlockSubKeywords(mainKeyword)`: 키워드 라우트에서만 호출, 본문 라우트엔 전달 안 됨.
- `analyzeAutocompleteIndex({title,mainKeyword,sub1,sub2,body})`: body 필요 → 작성 후 신호. 현재 `/api/analysis`에서만 호출, 본문 생성 흐름엔 미연결.

## 3. 설계 (3개 작업, 위험 낮은 순 = 구현 순서)

### G1. 상위노출 구조/주의점 주입 (작성 전, 위험 낮음)
- 대상: `src/lib/prompts/articlePrompt.ts`의 competitorSection.
- 변경: brief에 이미 있는 `contentBlocks`(상위글 구조 힌트), `cautionPoints`(노출 주의), `bodyNouns`(본문 반복 명사)를 프롬프트에 명시 주입.
- 지시문 예: "상위 노출 글 다수가 다음 구조를 사용합니다: [contentBlocks]. 주제에 맞으면 본문에 반영하세요." / "다음 본문 명사를 질의 의도 형태소로 본문 전반에 분산하세요: [bodyNouns]."
- 강제 아님(주제 부적합 시 생략 허용). 데이터 없으면 섹션 미출력.

### G2. 스마트블록 하위키워드 소재 주입 (작성 전, 위험 중)
- 대상: `api/article/route.ts` 병렬 블록 + `buildArticlePrompt`.
- 변경: 본문 생성 전 `inferSmartBlockSubKeywords(keyword.mainKeyword)`를 research 병렬에 추가(graceful, 실패 시 무시). `recommendedTitleKeyword`/상위 `subKeywordCandidates`를 brief에 실어 "본문 소제목·단락 소재로 활용(제목 자동 치환은 하지 않음)" 지시로 주입.
- 제목 자동 치환은 위험하므로 하지 않음 — 본문 소재로만.

### G3. 자완 색인 누락 키워드 수정 보강 (작성 후, 위험 중상)
- 대상: `api/article/route.ts` writeArticle 직후 + revision 경로.
- 변경: 초안 작성 후 `analyzeAutocompleteIndex({title,mainKeyword,sub1,sub2,body:rawContent})` 호출(graceful, 타임아웃). `suggestions`(본문에 없는 조합형 자동완성어)가 있으면 기존 수정 프롬프트에 "다음 키워드 중 말이 되는 것만 1회씩 자연스럽게 본문에 녹이세요: [suggestions]" 블록 추가.
- 검증 실패로 인한 수정이 없을 때도 suggestions가 충분하면 1회 보강 수정 허용할지는 옵션(기본: 기존 수정 사이클에만 얹어 추가 LLM 호출/지연 최소화).

## 4. 트리거 조건
- 본문 생성 API(`POST /api/article`) 호출 시 자동. articleType=info 우선, promo는 G1만 우선 적용.

## 5. 실패 복구 (graceful, 절대 크래시 금지)
- smartBlock/autocomplete/competitor 각각 try-catch + 타임아웃. 실패 시 해당 섹션만 미주입하고 본문 생성은 계속.
- 자완색인 자격증명(NAVER_CLIENT_*) 없으면 unavailable → G3 스킵.
- G3의 추가 수정은 1회로 제한(무한 루프/지연 방지).

## 6. 상태 경계
- `articlePrompt.ts`(순수 프롬프트 빌더), `articleBrief.ts`(brief 조립), `api/article/route.ts`(오케스트레이션)만 수정. 키워드 파이프라인·검증 규칙은 건드리지 않음(이번 세션에서 막 정상화함).
- 분석 모듈(`smartBlock`/`autocompleteIndex`/`competitorMorphology`)은 읽기만. 인터페이스 변경 없음.

## 7. 아웃풋 정의
- 본문: 기존과 동일한 `ArticleContent`(문자열 본문 + validation + brief). 변화는 "내용 품질"(상위 구조 반영, 누락 자동완성어 보강)로 나타남.
- 검증: `pnpm type-check`/`lint` 통과. `POST /api/article` 스모크에서 크래시 없음.
- 수용 기준: (a) competitor contentBlocks가 있을 때 본문이 그 구조(체크/단계 등)를 반영, (b) 자완 suggestions가 있을 때 수정본에 일부가 자연스럽게 포함, (c) 자격증명/신호 부재 시 graceful.

## 8. 미적용/후순위
- 키워드 잔여 폴리시(제목 쉼표 금지, 어미 반복)는 별도 소작업.
- §3-1 쉼표 정책(본문 전면 쉼표 금지 완화)은 사용자 결정 필요 — 이 문서 범위 밖.
