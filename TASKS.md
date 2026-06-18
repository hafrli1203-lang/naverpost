# TASKS — 네이버 블로그 자동 작성 (안경원)

> 이 파일은 흩어진 작업을 한곳에 모으는 **단일 작업 목록**이다. 설계는 `docs/designs/`, 누적 지식은 `memory/MEMORY.md`, 변경 이력은 `CHANGELOG.md`에 둔다. 이 파일은 "지금 무엇을, 어떤 순서로"만 담는다.

## 작업 루프 (모든 작업에 적용)

1. 관련 파일을 먼저 찾는다 (`CLAUDE.md` 모듈 경계 + `docs/designs/` 확인).
2. 수정 계획을 짧게 쓴다.
3. 필요한 파일만 수정한다 (한 번에 여러 기능 갈아엎기 금지).
4. **완료 기준(DoD)을 충족할 때까지** 검증 루프를 돈다.
5. 프롬프트/규칙을 바꿨으면 **캐시 버전(WORKFLOW_STATE_VERSION 등)을 올리고**, 새 사실은 `memory/`·`CHANGELOG.md`에 기록한다.

### 완료 기준 기본값 (DoD)
- `pnpm type-check` 통과 (에러 0)
- 기존 기능 회귀 없음 (관련 검증 스크립트/오탐0)
- 규칙 변경 시 사용자 승인 받음 ([[feedback_ask_before_update]])
- "should work"가 아니라 실제 실행 증거로 확인

---

## 진행 중 (In Progress)

- _없음_

## 다음 (Backlog — 우선순위 순)

1. **citation 인식 범위 비대칭 정리** — research-side(`parseCitations`)는 언론/앱까지 넓게 받는데 body-side(`extractCitationsFromContent`)는 기관/제조사만 인식. 둘의 기준을 맞출지(언론사 패턴 추가 vs research에서 언론 배제) 결정 필요. 라이브에서 동아일보/닥터나우 반환으로 드러남.
2. **pre-existing lint 실패 정리(내 변경 아님)** — `CRankAudit.tsx:95`·`CadenceTracker.tsx:52` `react-hooks/set-state-in-effect`. 세션 이전부터 존재. `pnpm lint`가 빨간 상태라 DoD의 "lint clean"을 막음.
3. **운영자용 발행 후 반응 관리 가이드(선택)** — export 산출물에 "발행 후 1~2시간 반응 관리" 한 줄 동봉 여부 결정. 자동화 불가 영역.
4. ~~키워드 밀도 게이트 마진~~ → 완료(advisory 표면화). 8~19회 구간을 UI 참고신호로 노출. 하드게이트(8회+ 자동수정)는 오탐 위험이라 실발생 증거 모이면 별도 판단.

## 완료 (Done)

- ✅ **품질 라운드 3: 키워드 3중복 붕괴(A) + detail 씬 텍스트↔참조(B)** (2026-06-18, 라이브 검증됨)
  - **(A) 키워드 붕괴 수정**: `keywords/route.ts`에 `deriveDistinctSubKeywords()` 추가 → `subKeyword1: main, subKeyword2: main` 폴백 2곳(`buildRealQuerySeedOptions` 1292·`buildFallbackKeywordOptions` 1332) 교체. 같은 head 큐레이션 → 같은 head 실검색어(지역어 제외) → 카테고리 큐레이션 순으로 distinct 실제 2단어만 채움(날조 없음).
    - **라이브검증(검색광고+생성 전체)**: lenses/eye-info 재생성 → 6/16에 3중복이던 변색렌즈 도수×3·근시 증상×3·눈부심 원인×3·노안 검사×3가 전부 distinct로 정상화, **3중복 0/10 (양 카테고리)**. 본문에도 침투: "변색렌즈 자외선 노출이 많은 한낮", "변색렌즈 실내 사용도" 식으로 그물망 작동(missingKw=[]).
  - **(B) detail 씬 충돌 수정**: `shopRefs.ts`에 `detailScenePrompt(category)` + `image/prompts/route.ts`가 detail 실사진 서빙 시 저장 프롬프트를 서빙 카테고리 캡션으로 교체. LLM "진열대" 묘사 ↔ 코받침 매크로 충돌 해소, 재생성 폴백도 주제 일치. regenerate는 `pickDetailCategory`가 새 캡션과 self-consistent.
    - **검증**: vitest 3종(캡션 generation-ready / pickDetailCategory round-trip / 불일치 회귀가드) 추가 → 24/24 통과. 라이브에선 현재 LLM이 detail 씬을 거의 안 만들어(이번 2글 모두 0개) end-to-end 트리거 불가 → 결정론 핵심을 단위테스트로 잠금.
  - **6항목 라이브 점검 결과**: ① 제목 자연 문장 ✅ ② 키워드 3중복 0 ✅ ③ 본문 취지적합·2129자·상담톤 ✅ ④ 이미지 실사 자연 ✅(cut_0/1 AI, cut_9 실매장) ⑤ 손가락 뭉개짐 없음 ✅(본 3장) ⑥ 매장사진=실제 매장·중복가드 ✅. citation: ⑤지시로 본문에 "대한안경사협회" 귀속되나 수치 없어 citations[] 빈값(설계대로).
  - 게이트 전부 통과: type-check 0 / eslint(변경파일) 0 / vitest 24/24.
- ✅ **키워드 밀도 마진 advisory 표면화** (2026-06-17)
  - `ArticlePreview.tsx`: `validation.morphology.repeatedBodyMorphemes` 중 8회+~20회 미만 형태소를 "반복 많은 형태소(참고)" 블록으로 표시. 하드게이트 아님(오탐 없음) — 20회+ 자동보정 전 단계 신호를 운영자에게 가시화해 8~19회 사각지대 해소.
  - 검증: type-check 0에러 / eslint 0. (UI 렌더는 dev 서버 필요 — 데이터는 needsHardRevision이 쓰는 동일 필드라 존재 확인됨.)
- ✅ **품질 라운드 2: 제조사 인용 패턴 + 테스트 인프라 + Perplexity 인용 보강** (2026-06-17)
  - **(2) 제조사·표준 인용 패턴**: `citationExtractor.ts`에 자이스/에실로/호야 등 제조사 + ISO/ANSI 패턴 추가(브랜드+자료유형 접미사 요구로 제품명 오탐 방지). 기존엔 "렌즈" 없는 제조사명을 못 잡아 본문이 제조사를 인용해도 신호 0이었음.
  - **(3) 테스트 인프라**: vitest 도입(`vitest.config.ts`, `pnpm test`). 순수함수 단위테스트 20개(citationExtractor 9 / spellingVariants 7 / repetitionCheck 4) 전부 통과. 회귀가드 확보(이번 세션에 발견한 드리프트류 재발 방지).
  - **(1) Perplexity 인용 2차 조회**: `perplexity.ts` — 1차 citations < 3이면 기관·수치 전용 질의를 후속질문과 병렬로 보강(직렬 지연 0). 라이브 확인: citations 채워짐.
    - **정직한 한계**: 라이브에서 반환된 출처가 동아일보·닥터나우(언론/의료앱)였음 — 최상위 기관 아님. 또 body-side `extractCitationsFromContent`는 이런 언론사명을 인식 못 해(패턴에 없음) UI "AI 인용 신호"엔 안 뜸. research-accept 범위와 extractor-recognize 범위의 비대칭 = 다음 개선 후보.
  - 검증: type-check 0에러 / vitest 20/20 / 변경 파일 eslint 0에러.
  - **pre-existing 이슈(내 변경 아님)**: `pnpm lint`가 `CRankAudit.tsx:95`·`CadenceTracker.tsx:52`의 `react-hooks/set-state-in-effect`로 실패함(세션 이전부터 존재, lock 미변동으로 확인). 별도 처리 필요.
- ✅ **키워드 밀도 상한 검증 — 코드 변경 없이 검증 완료** (2026-06-17)
  - 확인: `repetitionCheck.ts:18` 한글 2글자+ 단어 ≥20회 플래그 → `contentValidator.ts:78/143/165` 검증 연결 → `article/route.ts` `needsHardRevision`에 `overusedWords.length>0` 포함 = 하드 재수정 게이트까지 연결됨. 알스터 책의 20회 위험선과 동일 임계값에서 백스톱 작동. **빠진 게이트 아님.**
  - 미연결 사실(정직): `morphologyAnalyzer.ts:142` 반복토큰 ≥8 신호는 자문(severity medium)일 뿐 게이트엔 없음.
- ✅ **표기변형 커버리지 2차 확장** (2026-06-17, 라이브 검증됨)
  - `spellingVariants.ts`에 도수/돗수·난시/란시·서클렌즈·컬러렌즈/칼라렌즈·김서림방지·안경닦이·원데이 그룹 추가. 테스트 1건 추가(21개 통과).
  - 라이브: 안경 닦이 8,830 / 컬러 렌즈 7,070 / 서클 렌즈 1,140 / 칼라렌즈 400 / 김서림 방지 360 실볼륨 확인. 20급 변형은 게이트(하한 100)가 제거.
- ✅ **오타/표기변형 키워드 확장 (실볼륨 게이트 통합)** (2026-06-17, 라이브 검증됨)
  - `lib/keywords/spellingVariants.ts`: 큐레이션된 안경 도메인 변형군으로 표기/띄어쓰기/외래어 변형 결정론 생성(순수함수, 도메인 밖 오염 0).
  - `keywords/route.ts`: 변형을 `discoverySeeds`에 합류 → 기존 검색광고 볼륨 조회 1회에 같이 측정, 실볼륨 없는 변형은 기존 볼륨게이트가 제거. 추가 네트워크 호출 0.
  - 단위검증: 콘택트렌즈→콘텍트/컨택트렌즈, 누진다초점→누진 다초점, 선글라스→썬글라스 / 도메인밖 [] / type-check·lint 0에러.
  - **라이브검증(검색광고 API)**: 썬글라스 월 22,930 / 변색 렌즈 13,450 / 누진 다초점 540 / 콘텍트렌즈 110 실볼륨 확인 → 변형이 게이트를 탐. 컨택트렌즈 20은 하한 미만으로 제거(의도대로).
- ✅ **citationExtractor 본문 내장형 되살리기** (2026-06-17, 라이브 검증됨)
  - `articlePrompt.ts`: 인용 자료가 있을 때 기관·연도·수치를 본문에 자연 귀속하는 긍정 지시(④-⑤) + 체크리스트 20 추가. 하단 출처 블록 금지·날조 금지 유지.
  - `article/route.ts`: 최종 본문을 `extractCitationsFromContent`로 스캔 → `article.citations` 채움(소프트 신호, 하드 게이트 아님).
  - `ArticlePreview.tsx`: "AI 검색 인용 신호" 블록으로 표시.
  - `citationExtractor.ts`: `한국소비자원` 직접형 미매칭 잠복버그 수정(`{1,10}`→`{0,10}`). 단위검증: 오탐0.
  - **라이브검증(실 claude 생성)**: 인용 주입 프롬프트로 1662자 본문 생성 → 본문이 "한국소비자원 2023년 자료를 보면 ~38%가 피팅 불량" 식으로 출처 자연 귀속, extractCitationsFromContent가 한국소비자원(2023년)·대한안경사협회 추출 확인.
- ✅ **CLAUDE.md 모듈표 죽은 참조 정정** (2026-06-17) — `rewriteArticleForGeo()` 제거 표기, `citationExtractor.ts` 행 추가.
- ✅ **참고문서: 블로그 수익화(알스터) 4·5·6·7장 정리** (2026-06-17) — `docs/research/blog-monetization-alster.md`.
