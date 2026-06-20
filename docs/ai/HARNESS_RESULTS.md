# HARNESS_RESULTS — 검문 결과 기록

공통: `C:\project\_AGENCY_OS\HARNESS_STANDARD.md`. 매 검문마다 아래 형식으로 기록(메인 작업자).

## 형식
```
### [날짜] TASK/작업 — Trigger
- 프로파일: 코드 / UI / 보고서 / 제안서 / 콘텐츠
- 게이트 결과:
  - <게이트> | 기준 | 측정값 | 판정(PASS/P0/P1/P2/미검증)
- 종합 판정: PASS / FAIL
- P0/P1 조치:
- 검수자: harness-reviewer / metrics-auditor / ux-harness-reviewer / test-runner / code-reviewer
```

## 기록
(아직 없음)

### 2026-06-19 파일럿 baseline — Stop hook 신규 적용 + 테스트 점검 (FAST BATCH)
- 프로파일: 코드 (Next.js/TS). Stop hook: 이번에 신규 적용(.claude/settings.json + .claude/hooks/harness-stop-check.sh, detailpage 검증본). bash -n / JSON.parse 문법 검증 OK. .git/info/exclude에 .claude/ 추가.
- 실행 명령: `npx tsc --noEmit` (type-check), `npm test` (vitest run)
- 결과: type-check exit 0 · vitest 4 files / 24 passed / exit 0 (352ms)
- 게이트: 빌드(type-check) 성공=PASS · 테스트 성공=PASS · 민감정보 미열람=PASS · lint=미검증 · 기능 코드 변경 0건(.claude/만 추가)
- 종합 판정: PASS (baseline)
- 비고: 검수자 메인 작업자 직접 실행(exit code 근거).

### 2026-06-19 오늘 사용 가능 점검 — 로컬 실행 + export 핵심 흐름 (naverpost)
- Change-Fingerprint: 45b9ce08cecbf0d7
- Gate Result: PASS
- 프로파일: 코드 (Next.js 로컬 실행 + 순수함수 흐름). Trigger: BeforeComplete (오늘 사용 가능 상태).
- 실행: `npm run dev`(next dev -p 3100) → Ready 7.4s, .env.local 로드. 페이지 HTTP: / 200, /operations 200, /login 200, /admin 200.
- 핵심 흐름(외부 호출 0): 붙여넣기용 export — formatForNaverExport(rich HTML+제목+이미지마커), buildNaverPlainText(제목/불릿/표 셀/이미지마커). vitest 2건 신규로 검증.
- 게이트 결과:
  - 로컬 실행 성공 | P0 | dev 서버 Ready, 4개 화면 200 | PASS
  - 타입 에러 0 | P0 | tsc --noEmit src 에러 0 | PASS
  - 테스트 성공 | P1 | vitest 5 files / 26 passed / 0 fail (export +2) | PASS
  - 핵심 사용 흐름 동작 | P0 | 초안→붙여넣기 export(rich+plain) 산출 확인 | PASS
  - 외부 네이버/AI 라이브 호출 0 | P0 | export·검증은 순수함수, 생성 파이프라인(AI CLI) 미트리거 | PASS
  - 민감정보 0 | P0 | .env.local 미열람(Next 자체 로드) | PASS
- 종합 판정: PASS (오늘 내부 사용 가능 = READY)
- P0/P1 조치: 없음(수정 불필요 — 실행/흐름 모두 정상)
- 미검증: AI 생성 파이프라인(keywords/article/image — 실제 AI CLI 호출·비용이라 의도적 미실행) · 화면 인터랙션 클릭 경로(브라우저 자동화 미사용) · Supabase 의존 화면(sessions/blogops) 런타임
- 기능 코드 변경: 0건 (export 검증 테스트 1개 신규만)
- 검수자: 메인 직접 실행(dev 기동 + curl 200 + vitest/tsc exit code).

### 2026-06-19 T1 — API 라우트 입출력 책임 정리 → WIKI_INDEX (naverpost)
- Gate Result: PASS
- 프로파일: 문서(LLM Wiki 보강). Trigger: BeforeComplete. 코드 변경 0(감지경로 무변경 → Stop hook 무관).
- 산출: docs/ai/WIKI_INDEX.md에 "API 라우트 입출력 맵" 추가 — 23개 route.ts를 콘텐츠생성/이미지/세션·매장·문서·인증/BlogOps 4군으로 분류, 메서드·입력키·출력책임·외부의존(AI/BlogOps/DB/로컬) 표기. AI 라우트 9개 비용주의 명시.
- 검증 방식: 정적 추출(메서드 export, @/lib import, 입력 키 grep). 런타임 호출 없음(외부 AI 비용 회피).
- 게이트: 필수 정보 포함(라우트 23/23·메서드·입출력·외부의존) | 기준 | 23개 전부 매핑 | PASS · 출처 없는 수치 0 | PASS · 기존 문서 보존(덮어쓰기 아님, 플레이스홀더 갱신+append) | PASS
- 종합 판정: PASS
- 미검증: 입력 스키마 상세(zod 타입까지는 미전개 — 각 route.ts/types 참조로 위임) · 런타임 입출력(정적 기준)
- 검수자: 메인 직접(정적 추출 + 표 구성). LOCAL CHECK: dev :3100 200(READY 재확인).

### 2026-06-19 골든 샘플 세팅 — 운영 문서 완성 + T2/T3 (naverpost)
- Gate Result: PASS
- 프로파일: 문서(운영체계 세팅). Trigger: BeforeComplete. 코드 변경 0(docs/ai만 — 감지경로 무변경 → Stop hook 무관).
- 산출(생성 9 + 갱신 3): NAVERPOST_RUNBOOK, PIPELINE_FLOW(T3), SCREEN_FLOW(T2), SUBAGENT_PROTOCOL, EXTERNAL_REVIEW, READY_CHECKLIST, RUN_NEXT_TASK_PROMPT, RUN_LOCAL_TOOL_PROMPT, OPERATING_STANDARD + WIKI_INDEX/AX_CANDIDATE/TASKS 갱신.
- 연결: LLM Wiki·Workflow·Loop·Subagent·Harness·Stop hook·외부리뷰·AX 8개 구조 문서로 연결(OPERATING_STANDARD 5장 표).
- 게이트: 문서 생성/갱신 12개 | 기준 | 12/12 작성 | PASS · 기존 문서 보존(append/placeholder 갱신) | PASS · 출처 없는 수치 0(정적·실행 근거) | PASS · 기능 코드 변경 0 | PASS
- 종합 판정: PASS
- 미검증: UI 버튼 클릭 경로·반응형(ux 별도) · AI 생성 런타임(비용 회피) · Supabase 의존 화면 데이터
- LOCAL 재확인: dev :3100 200, vitest 26, tsc src 0.
- 검수자: 메인 직접(정적 분석 + 기존 실행결과 인용).

### 2026-06-19 자동검증 레벨2 + 외부리뷰 준비 (naverpost)
- Change-Fingerprint: none
- Gate Result: PASS
- 프로파일: 운영 자동화/문서. Trigger: BeforeComplete. 기능 코드 변경 0(.claude 훅 + docs만).
- LEVEL 2 적용: .claude/hooks/validate-stop-check.sh 추가(settings.json Stop에 2번째 훅). 감지경로 소스 변경 시 type-check+test 자동 실행, 실패 시 block. build 제외.
- 검증: JSON 유효·bash -n OK · PASS 경로 exit 0(~12s) · BLOCK 경로(실패테스트 주입→block→제거) 확인 · loop-prevention(stop_hook_active) OK.
- 외부리뷰: 환경 가능(gh 로그인·codex CLI), 변경범위 docs+.claude+test(소스 로직 0). 실행은 commit/push·AI CLI 비용이 1회 승인 필요 → C안(준비완료, 실행보류). PR본문+@codex 문구 EXTERNAL_REVIEW.md에 준비.
- 게이트: type-check src 에러 0 | P0 | PASS · test 26 passed | P1 | PASS · 자동검증 훅 동작(PASS+BLOCK 경로) | P0 | PASS · 기능 코드 변경 0 | P0 | PASS · 외부 API/AI 호출 0 | P0 | PASS
- 종합 판정: PASS
- 미검증: 외부 리뷰 실제 실행(승인 대기) · build(자동화 제외, 수동)
- 검수자: 메인 직접(훅 PASS/BLOCK 경로 실측 + 환경 점검).

---

## ★ clean PR 기준 검증 (chore/naverpost-agency-ai-os-clean, 2026-06-19)
> 주의: 위쪽 "vitest 26 passed" 등 일부 기록은 **이전 브랜치(chore/agency-os-setup) 기준**이며 master 기반 clean PR에서는 재현 불가(test 스크립트·vitest devDep이 master에 없음). 아래가 **clean PR diff 기준** 결과다.

### 2026-06-19 clean PR — 운영체계 문서/훅 외부리뷰 (naverpost)
- Gate Result: PARTIAL (type-check 중심)
- 포함 범위: docs/ai/** + .claude(settings.json·harness-stop-check.sh·validate-stop-check.sh). **기능 소스 로직 변경 0**(src/app·components·lib/ai·api 미포함, package.json/lockfile 미수정).
- type-check: `npm run type-check`(tsc --noEmit) — **src/ 에러 0** (PASS)
- test: **미검증 — master에 test 스크립트/vitest devDep 없음**. export test와 vitest 인프라는 별도 TASK(P2-F4)로 분리. (clean PR 범위 밖)
- 자동검증 레벨2: validate-stop-check.sh가 test 스크립트 부재를 감지해 type-check만 실행(test=미검증). → **PARTIAL(type-check 중심)**
- Stop hook: fingerprint 훅 + validate 훅 통과(감지경로 소스 변경 0 / type-check PASS).
- 종합 판정: PARTIAL (type-check PASS, test 미검증). P0/P1 = 0.
- 검수자: 메인 직접(type-check) + Codex(외부, clean PR).

### 2026-06-19 P2-F4 test 인프라 도입 — clean PR FULL PASS (naverpost)
- Change-Fingerprint: 9db032f8d64bae89
- Gate Result: PASS
- 범위: package.json(test/test:watch 스크립트 + vitest devDep), pnpm-lock.yaml(vitest 트리), src/lib/naver/contentFormatter.export.test.ts(export 테스트). **기능 소스 로직 변경 0**(src/app·components·lib/ai·api 미변경). agency-os-setup에서 경로단위로 가져와 일관성 보장(package.json diff = test/vitest만, frozen-lockfile 검증 통과).
- type-check: `pnpm run type-check` src 에러 0 (PASS)
- test: `pnpm test` (vitest run) **1 file / 2 passed** (export: rich HTML + 평문 폴백, 외부 호출 0) (PASS)
- 자동검증 레벨2: validate-stop-check.sh가 이제 type-check + test **둘 다 실행** → PASS (이전 PARTIAL=type-check중심 해소)
- Stop hook: fingerprint 미기록 시 BLOCK 확인 → 본 지문 기록으로 통과.
- 외부 API/AI CLI 비용 호출 0, 네이버 실발행 0, lockfile frozen 일관.
- 종합 판정: **FULL PASS** (type-check PASS + test PASS, P0/P1 = 0)
- 검수자: 메인 직접(pnpm test/type-check) + Codex(2차 리뷰 요청 예정).

### 2026-06-19 S1 Phase 1 — SEO 검수 엔진 테스트 추가 (feature/naverpost-functional-upgrade)
- Change-Fingerprint: 2fb03ed38f960927 (확정 — 지문은 감지경로 변경분=테스트 4파일로 산정. vitest.config.ts는 PATHS_RE 비매칭, docs/.claude는 제외라 동일값 유지)
- Gate Result: **PASS** (type-check + test 모두 통과, P0/P1 = 0)
- 프로파일: 코드(테스트 추가 + vitest alias config. src/lib 로직·UI·생성흐름 무변경). Trigger: BeforeComplete.
- 범위: 테스트 4파일 신규(`src/lib/validation/repetitionCheck.test.ts`, `morphologyAnalyzer.test.ts`, `keywordRules.test.ts`, `src/lib/analysis/postingAudit.test.ts`) + `vitest.config.ts`(resolve.alias `@`→`./src`, 사용자 A안 승인). 기존 6개 순수함수의 현재 계약을 고정(희망동작 아님).
- 게이트 결과:
  - 타입/컴파일 에러 0 | P0 | `pnpm type-check`(tsc --noEmit) exit 0 | **PASS**
  - 테스트 성공 | P1 | vitest **5 files / 26 passed / 0 fail / 0 skip** (신규 24 + 기존 export 2) | **PASS**
  - 기존 핵심 기능 삭제 0 | P0 | 소스 로직 무변경(테스트 + alias config만) | PASS
  - 민감정보 접근 0 | P0 | .env.local 미열람 | PASS
  - 패키지/lockfile 변경 0 | P1 | package.json/pnpm-lock 무변경, 패키지 설치 0 | PASS
  - 외부 API/AI CLI 비용 호출 0 | P0 | 순수함수 단위테스트(동기 휴리스틱)만 | PASS
  - 네이버 실발행 0 | P0 | write 경로 무관 | PASS
- 인프라 블로커 해소: 직전 FAIL은 vitest `@/` 별칭 부재로 `postingAudit.ts`/`morphologyAnalyzer.ts`의 `@/lib/...` import가 로드 실패한 것(단언 실패 아님). `vitest.config.ts` alias 1파일 추가로 해소 → 단언 실패 0(기대값이 현재 계약과 일치함을 입증).
- 고정한 계약(주요): findOverusedWords 20회 임계·내림차순 / analyzeMorphology 표면토큰·STOPWORD·키워드 미활성 high이슈 / auditPosting coverage·쉼표·금지어·이미지0 항상경고 계약 / validateKeywordOption rule5 12~32 경계·rule9 쉼표·이모지·목록·rule8 금칙어·rule6 키워드소진 / titleContainsMainKeyword 조사허용·순서엄수 / titleSimilarity 동일1·무관<0.5.
- 미검증/제외: Phase 2 휴리스틱 보강(미승인). competitorMorphology·keywordMesh·smartBlock 등 외부/AI 의존 모듈 테스트(별도 backlog).
- 제외 파일: `.claude/settings.local.json`(이번 TASK 무관, 무수정), untracked 백업/`_verify/`(무수정).
- 검수자: 메인 직접(pnpm type-check/test exit code). 커밋/push 0.

### [2026-06-19] 명령어 레이어 적용 — 운영체계 이식(기능 코드 0)
- 프로파일: 문서(명령어/디자인 운영 레이어). 코드 변경 0(docs/ai만 — Stop hook 감지경로 무변경).
- 생성/갱신: COMMANDS.md(+DESIGN_REFERENCE/UI_TASKS 없으면 생성). 전역 `/agency-*` 명령 사용 가능.
- 외부 API/AI 호출 0, package/lock/DB 변경 0, commit/push 0.
- 종합: PASS(문서 이식). 실행 판정은 기존 상태 유지(`/agency-run-local`로 재점검 시 갱신).

### 2026-06-19 S1 Phase 2 — auditPosting 가법적 검수 신호 추가 (feature/naverpost-functional-upgrade)
- Change-Fingerprint: c2e0447e800392bd
- Gate Result: **PASS** (type-check + test 모두 통과, P0/P1 = 0)
- 프로파일: 코드(검수 데이터 산출 + 테스트만. UI/export/생성흐름 무변경). Trigger: BeforeComplete. 사용자 Phase 2 승인(데이터 산출+테스트까지, UI 노출 미승인).
- 범위(허용 파일만): `src/lib/analysis/postingAudit.ts`(가법적 옵셔널 필드 + 헬퍼), `src/lib/analysis/postingAudit.test.ts`(테스트 +8), `docs/ai/HARNESS_RESULTS.md`(기록).
- 추가 필드(전부 backward-compatible 옵셔널, 차단 아님·검수 신호만):
  - `queryIntentFocus.mainKeywordInIntro?: boolean` — 본문 초반 첫 INTRO_WINDOW(200)자 내 메인키워드 등장(titleContainsMainKeyword 재사용, 조사 허용). mainKeyword 미제공 시 undefined.
  - `queryIntentFocus.mainKeywordInSubheading?: boolean` — 마크다운 헤딩(#/##/###) 또는 굵은 단독 라인(**...**)에 메인키워드 등장. 평문이면 false. 미제공 시 undefined.
  - `subKeywordCoverage?: {keyword,present}[]` — sub1/sub2 본문 단순 포함 여부(억지 삽입·자동수정 없음).
- 시그니처/원본 로직: `auditPosting` 시그니처 불변, 기존 반환 필드 불변(추가만). keywordRules/morphologyAnalyzer/repetitionCheck 원본 무수정(titleContainsMainKeyword는 import 재사용). PostingAuditResult는 postingAudit.ts 정의만 갱신, CRankAudit 중복타입은 구조적 타이핑상 무영향(미수정).
- 게이트 결과:
  - 타입/컴파일 에러 0 | P0 | `pnpm type-check` exit 0(중복타입 불일치 없음) | **PASS**
  - 테스트 성공 | P1 | vitest **5 files / 34 passed / 0 fail / 0 skip**(기존 26 + Phase 2 +8) | **PASS**
  - 기존 26 테스트 유지 | P0 | 전부 통과(회귀 0) | PASS
  - 기존 반환 구조 보존 | P0 | 옵셔널 필드만 추가(파괴 0) | PASS
  - 패키지/lockfile 변경 0 / 패키지 설치 0 | P1 | 무변경 | PASS
  - 외부 API/AI CLI 비용 호출 0 | P0 | 순수함수만 | PASS
  - 네이버 실발행 0 | P0 | write 경로 무관 | PASS
  - UI 수정 0 | P0 | app/CRankAudit/FinalConfirm/export 미변경 | PASS
- 미검증/제외: UI 노출(미승인, Phase 2 범위 밖) · 본문 초반 N=200자는 검수 신호 기준값(공식 알고리즘 아님). C-Rank/D.I.A를 공식 알고리즘으로 단정하지 않음(검수 신호로만).
- 주의(내 작업 아님): `docs/ai/OPERATING_STANDARD.md`(M)·`docs/ai/COMMANDS.md`(??)는 "명령어 레이어 적용"(위 블록)에서 생긴 변경으로 이번 Phase 2와 무관·무수정. `.claude/settings.local.json`·untracked 백업·`_verify/`도 무수정.
- 검수자: 메인 직접(pnpm type-check/test exit code). 커밋/push 0.

### 2026-06-19 S2 — CRankAudit에 Phase 2 SEO 검수 신호 최소 노출 (feature/naverpost-functional-upgrade)
- Change-Fingerprint: a5909c9bb57c4dea
- Gate Result: **PASS** (type-check + test + dev 렌더/데이터 흐름 + UI 하네스 모두 통과, P0/P1 = 0)
- 프로파일: UI(컴포넌트 표시만). Trigger: BeforeComplete. 사용자 S2 승인(CRankAudit 최소 노출까지. FinalConfirm/export 연결=S2-b 분리, 미진행).
- 범위(허용 파일만): `src/components/CRankAudit.tsx`(로컬 타입에 Phase2 옵셔널 필드 + "발행 전 SEO 검수 신호" 섹션 + SignalRow 헬퍼), `docs/ai/HARNESS_RESULTS.md`(기록). API/route/postingAudit/page 추가수정 0.
- 표시 내용(체크리스트 3항목, 비차단·참고용):
  - 본문 초반 메인키워드(mainKeywordInIntro) — 통과/확인필요
  - 소제목 메인키워드(mainKeywordInSubheading) — 통과/확인필요
  - 보조 키워드 반영(subKeywordCoverage) — N개 중 M개. 옵셔널 undefined/빈배열이면 섹션 숨김(기존 렌더 영향 0).
- UI/UX 게이트:
  - 기존 라우팅/기능 영향 0 | P0 | 기존 섹션·로딩/오류 상태 보존, 옵셔널이라 데이터 없으면 숨김 | PASS
  - 상태 색상 단독 의존 금지 | P2 | 아이콘(aria-hidden)+"통과/확인필요" 텍스트+설명 병기 | PASS
  - 금지 표현 0 | P0 | "검색노출 보장/공식 점수/상위노출 확정" 미사용, "키워드 더 넣기" 강요 없음. 하단에 "검색 노출 보장 안 함·흐름 해치며 키워드 넣지 말 것" 명시 | PASS
  - 다크모드 대비 | P1 | 기존 토큰(text-green-600/orange-600/muted-foreground) 재사용 | PASS
  - 반응형 | P1 | 기존 카드/리스트 패턴 유지(신규 컴포넌트 없음) | PASS
- 검증:
  - type-check: `pnpm type-check` exit 0 (중복 타입 불일치 없음) | PASS
  - test: `pnpm test` 5 files / **34 passed / 0 fail / 0 skip**(S2는 컴포넌트라 신규 단위테스트 없음; 로직은 Phase2 테스트가 커버) | PASS
  - dev 렌더/데이터: 기존 :3100 서버(현재 코드 재컴파일)에서 `/` 200 + `POST /api/analysis`(posting-audit, 순수 로컬·무비용)이 Phase2 필드 반환 확인(mainKeywordInIntro=true·mainKeywordInSubheading=true·subKeywordCoverage present×2) → CRankAudit가 소비하는 데이터 흐름 입증 | PASS
  - UI 하네스: ux-harness-reviewer 정적 검수 **PASS(P0/P1 없음)** | PASS
- 미검증/제외: 전체 워크플로우 통과 후의 실제 화면 스크린샷(ArticlePreview 도달엔 AI 본문 생성 필요 → 비용 회피로 미트리거. 컴파일+API데이터+정적 UI검수로 대체). S2-b(FinalConfirm/export 연결) 미진행.
- 안전: FinalConfirm/export·app/page·API route·postingAudit·keywordRules/morphologyAnalyzer/repetitionCheck·contentFormatter 무수정. package/lock 0, 패키지설치 0, AI CLI 0, 외부 API write 0, 네이버 실발행 0, commit/push 0. `.claude/settings.local.json`·OPERATING_STANDARD·COMMANDS·백업·`_verify/` 무수정.
- 검수자: 메인 직접(type-check/test/dev curl) + ux-harness-reviewer(UI 정적).

### 2026-06-19 타입 정리 — PostingAuditResult 공유 타입 추출 (feature/naverpost-functional-upgrade)
- Change-Fingerprint: aac14c06379eba7d
- Gate Result: **PASS** (type-check + test 통과, 중복 정의 단일화, P0/P1 = 0)
- 프로파일: 코드(리팩토링 — 타입 단일화만). Trigger: BeforeComplete. 런타임/UI/API 무변경.
- 범위(허용 파일만): 신규 `src/lib/analysis/postingAudit.types.ts`(PostingAuditResult 정의 이동), 수정 `src/lib/analysis/postingAudit.ts`(import type + 하위호환 재노출), `src/components/CRankAudit.tsx`(로컬 중복 타입 제거 → 공유 타입 import), `docs/ai/HARNESS_RESULTS.md`(기록).
- 구현: `PostingAuditResult` 인터페이스를 순수 타입 모듈로 이동(import 0 → 순환참조 없음). postingAudit.ts는 `import type` + `export type { PostingAuditResult } from "./postingAudit.types"`로 기존 import 경로 보존. CRankAudit는 `import type { PostingAuditResult } from "@/lib/analysis/postingAudit.types"`.
- 게이트 결과:
  - 타입/컴파일 에러 0 | P0 | `pnpm type-check` exit 0(필드 동일 → 차이 없음) | PASS
  - 테스트 성공 | P1 | `pnpm test` 5 files / **34 passed / 0 fail / 0 skip**(기대값 무변경) | PASS
  - 중복 정의 제거 | P0 | `grep "interface/type PostingAuditResult ="` → 정의 **1곳(postingAudit.types.ts)만** | PASS
  - 순환참조 0 | P0 | 타입파일 import 0 | PASS
  - 런타임/API/UI 변경 0 | P0 | interface/import type은 컴파일 시 소거, route·렌더 무변경 | PASS
  - 패키지/lockfile 변경 0 | P1 | 무변경 | PASS
  - 외부 API/AI CLI/네이버 실발행 0 | P0 | 타입 전용 | PASS
- 안전/제외: FinalConfirm/export·app/page·API route·posting-audit 응답구조·auditPosting 런타임·CRankAudit 렌더 무변경. `.claude/settings.local.json`·OPERATING_STANDARD·COMMANDS·WIKI_INDEX(내 작업 아님)·백업·`_verify/` 무수정.
- 검수자: 메인 직접(type-check/test exit code + 중복정의 grep). 커밋/push 0(승인 대기).

### 2026-06-19 S2-b — FinalConfirm export 직전 SEO 검수 신호 노출 (A-min, feature/naverpost-functional-upgrade)
- Change-Fingerprint: dbb2b9d04ccff337
- Gate Result: **PASS** (type-check + test + dev 데이터흐름 + UI 하네스 모두 통과, P0/P1 = 0)
- 프로파일: UI(표시 추가만). Trigger: BeforeComplete. 사용자 A-min 승인(FinalConfirm 단일 파일, 공유 컴포넌트 추출·CRankAudit 수정 안 함).
- 범위(허용 파일만): `src/components/FinalConfirm.tsx`(posting-audit 읽기전용 호출 + "발행 전 SEO 검수 신호" 소카드 + SeoSignalRow 헬퍼), `docs/ai/HARNESS_RESULTS.md`(기록).
- 구현: FinalConfirm에서 `POST /api/analysis`(mode posting-audit, 순수 로컬·무비용) 읽기전용 호출 → shared `PostingAuditResult` 타입으로 수신 → 3신호(본문 초반/소제목 메인키워드·보조키워드 반영) 컴팩트 체크리스트. 로딩/실패 시 audit=null로 섹션만 숨김(export 미차단). 위치=‘발행 전 점검 리포트’ 카드 아래·‘요약 정보’ 위.
- UI/UX 게이트:
  - 기존 export 흐름 회귀 0 | P0 | 복사(handleCopyBody)·이미지저장(handleDownloadAllImages)·미리보기·붙여넣기 안내·처음부터다시 핸들러 **무변경**(diff grep로 추가/삭제 0 확인) | PASS
  - audit 실패가 export 미차단 | P0 | seoSignals 빈 배열/실패 시 섹션 숨김, 복사·저장 정상 | PASS
  - 상태 색상 단독 의존 금지 | P2 | SeoSignalRow 아이콘(aria-hidden)+"통과/확인필요" 텍스트+설명 병기 | PASS
  - 금지 표현 0 | P0 | "보장/공식점수/상위노출확정/최적화완료/키워드 더 넣기" 미사용. "검색 노출을 보장하지 않는다"는 부정 안전문구(허용) | PASS
  - 다크모드/반응형 | P1 | 기존 카드 패턴·색 토큰 재사용, max-w-3xl 내 자연 배치 | PASS
- 검증:
  - type-check: `pnpm type-check` exit 0 | PASS
  - test: `pnpm test` 5 files / **34 passed / 0 fail / 0 skip**(FinalConfirm은 컴포넌트, 신규 단위테스트 없음) | PASS
  - dev/데이터: 기존 :3100 `/` 200 + posting-audit(FinalConfirm 동일 호출)이 Phase2 필드 반환(intro/subheading=true·subCov present×2) | PASS
  - UI 하네스: ux-harness-reviewer 정적 검수 **PASS(P0/P1 없음)** | PASS
  - 비용/외부/실발행: posting-audit·export 순수 로컬, AI CLI 0·외부 API write 0·네이버 실발행 0 | PASS
- 미검증/제외: 전체 워크플로우 통한 실제 export 화면 스크린샷(도달엔 AI 본문 생성 필요 → 비용 회피, 컴파일+API+정적검수로 대체). coverage % 표시는 사용자 지시로 backlog.
- 안전/제외: CRankAudit·SeoSignalChecklist(미생성)·app/page·ArticlePreview·API route·postingAudit(.ts/.types)·contentFormatter 무수정. package/lock 0, 패키지설치 0. `.claude/settings.local.json`·OPERATING_STANDARD·WIKI_INDEX·COMMANDS·백업·`_verify/` 무수정. 커밋/push 0(승인 대기).
- 검수자: 메인 직접(type-check/test/dev curl + 핸들러 diff grep) + ux-harness-reviewer(UI 정적).

### 2026-06-20 P2 B안 — FinalConfirm fail-open 순수 함수 테스트 (feature/naverpost-functional-upgrade)
- Change-Fingerprint: 706720083517fb79
- Gate Result: **PASS** (type-check + test 통과, fail-open 데이터 계약 고정, P0/P1 = 0)
- 프로파일: 코드(순수 함수 추출 + 단위 테스트, 무패키지). Trigger: BeforeComplete. 사용자 B안 승인. Codex 리뷰 P2① 대응.
- 범위(허용 파일만): 신규 `src/components/finalConfirmSignals.ts`(buildSeoSignals 추출), `src/components/FinalConfirm.tsx`(useMemo 본문→`buildSeoSignals(seoAudit)` 호출 치환 + import), 신규 `src/components/finalConfirmSignals.test.ts`(5케이스), `docs/ai/HARNESS_RESULTS.md`(기록).
- 구현: `seoSignals` useMemo 본문(audit→신호배열, null→[])을 모듈 레벨 순수 함수 `buildSeoSignals(audit: PostingAuditResult|null): SeoSignalRow[]`로 추출. FinalConfirm은 `useMemo(() => buildSeoSignals(seoAudit), [seoAudit])`로 호출만. **런타임 동작·렌더·문구 불변**(동일 입력→동일 출력). FinalConfirm diff = +2/-34(import 1 + 치환 1, 본문 이동).
- 고정한 fail-open 계약: `buildSeoSignals(null) === []` — posting-audit 실패/미수신 시 신호 없음 → SEO 카드 숨김 → copy/download 핸들러는 seoAudit 미참조(구조적 독립)라 export 미차단.
- 게이트 결과:
  - 타입/컴파일 에러 0 | P0 | `pnpm type-check` exit 0 | PASS
  - 테스트 성공 | P1 | `pnpm test` **6 files / 39 passed / 0 fail / 0 skip**(기존 34 + 신규 5) | PASS
  - 기존 34 유지 | P0 | 전부 통과(회귀 0) | PASS
  - FinalConfirm 핸들러/fetch/문구 변경 0 | P0 | diff grep로 handleCopyBody·handleDownloadAllImages·fetch·useEffect·문구 추가·삭제 0 | PASS
  - 패키지/lockfile 0·설치 0 | P1 | 무변경(기존 vitest로 무패키지 실행) | PASS
  - 외부 API/AI CLI/네이버 실발행 0 | P0 | 순수 함수 단위 테스트 | PASS
- 테스트 케이스(5): null→[] / 전부 pass / intro false·subheading true·보조 일부(check·pass·check) / intro·subheading undefined→행 생략 / subKeywordCoverage undefined·[]→보조행 생략.
- 미검증/제외(backlog): A안 컴포넌트 렌더 테스트(testing-library/jsdom 도입), copy/download 버튼 활성 상태 렌더 단언, fetch 실패→null effect 런타임 테스트. (B안은 데이터 계약 고정까지)
- 안전/제외: CRankAudit·app/page·API route·posting-audit fetch/useEffect·copy/download/preview/export 핸들러·postingAudit(.ts/.types)·contentFormatter 무수정. S3-a 브랜치(fb34f29) 미접촉. `.claude/settings.local.json`·OPERATING_STANDARD·WIKI_INDEX·COMMANDS·백업·`_verify/` 무수정. 커밋/push 0(승인 대기).
- 검수자: 메인 직접(type-check/test exit code + FinalConfirm diff grep).

### 2026-06-20 이미지 생성 결함 1차 수정 (IMG-1/F/A/B/C) (feature/naverpost-image-fixes)
- Change-Fingerprint: 68a7c1bc4233e565
- Gate Result: **PASS (코드 검증)** — type-check 0 + test 46. 단 실제 이미지 생성 결과는 AI 비용 호출 필요라 미검증(아래 명시).
- 프로파일: 코드(이미지 파이프라인). Trigger: BeforeComplete. 사용자 "진행" 승인. 브랜치: master(98084a3)에서 분기.
- 근거: `data/cli-crash.log`에 한국어 설명문("...순서로 구성했습니다.")이 gti 프롬프트로 전달돼 매번 exit1 / `--ar 4:3`은 미드저니 문법(gpt-image 무시) / 매장 사진이 `pool.find(첫 장)`이라 매번 동일.
- 변경(허용 파일만):
  - IMG-1+3: 신규 `src/lib/prompts/imagePromptFilter.ts`(isLikelyImagePrompt, 한글비중>0.3 드롭) + `.test.ts`(7케이스). `prompts/route.ts`가 length필터→영어프롬프트 필터로 교체.
  - IMG-F: `gtiCli.ts` `--size`(기본 1024x1024=1:1) 추가. `imagePrompt.ts`에서 "프롬프트에 --ar 넣지 말 것"으로 교정(잡음 제거).
  - IMG-A: `prompts/route.ts` `pickFreshRandom()` — 매장/디테일 사진을 미사용분 중 무작위 선택(동일사진 해소).
  - IMG-B: `imagePrompt.ts` "마무리에 매장 와이드 의무 배치" 지시 제거 → 원고가 매장 안내·방문을 다룰 때만(조건화).
  - IMG-C: `imagePrompt.ts` 전역 "no logos" 완화 → "읽히는 글자 금지, 글자 없는 브랜드 심볼 형태는 허용"(지니스 심볼 무차별 삭제 교정).
- 게이트: type-check 0 | P0 | PASS · test 46 passed(기존 39 + 필터 7) | P1 | PASS · 패키지/lock 변경 0 | P1 | PASS · AI/외부 호출 0(코드 검증만) | P0 | PASS.
- **미검증(중요)**: 실제 gti 생성 결과(이미지 품질·1:1 적용·심볼 보존·참조 충실도)는 AI 비용 호출이라 미실행. 코드/프롬프트 레벨 수정만 검증. 라이브 검증은 사용자 승인 후 1회 생성으로 확인 필요.
- 미해결(모델 한계, 별도 TASK): IMG-D(참조 캡셔닝+--image 충실도 강화)·IMG-G(--dry-run/--debug 진단 루프). gpt-image-2 참조 충실도는 프롬프트로 "개선"만 가능.
- 검수자: 메인 직접(type-check/test). 커밋/push 0.

### 2026-06-20 이미지 생성 결함 2차 수정 (IMG-D 참조충실도 / IMG-G 진단루프) (feature/naverpost-image-fixes)
- Change-Fingerprint: 45471f70afb2073c (이미지 1차+2차 누적 변경 묶음)
- Gate Result: **PASS (코드 검증)** — type-check 0 + test 49(46 + 참조헬퍼 3). 실제 생성 결과는 AI 비용이라 미검증.
- 프로파일: 코드(이미지 파이프라인). Trigger: BeforeComplete. 사용자 "IMG-D/G 계속" 승인.
- 변경:
  - IMG-D: 신규 `src/lib/prompts/imageRefPrompt.ts`(appendReferenceAdherence — 참조 첨부 시 "실제 환경 충실 재현 + 설비 복제·증식 금지(모빌 1개면 1개)" 지시) + `.test.ts`(3). `one/route.ts`·`regenerate/route.ts`가 생성 직전 적용.
  - IMG-G: `gtiCli.ts` `--dry-run`(무비용 요청형태 출력, env GTI_DRY_RUN=1) + `--debug --debug-dir`(요청/응답 덤프, env GTI_DEBUG_DIR) 추가. `one`·`regenerate` 라우트가 실패 시 `CliError.code`(timeout/non-zero/empty/not-found)를 응답에 노출.
  - IMG-F 잔여: `regenerate/route.ts` 폴백 프롬프트의 "4:3 aspect ratio" 텍스트 제거.
- 게이트: type-check 0 | P0 | PASS · test 49 passed | P1 | PASS · 패키지/lock 0 | P1 | PASS · AI/외부 호출 0(코드 검증만) | P0 | PASS.
- **미검증(중요)**: 참조 충실도 실제 개선폭은 gpt-image-2 능력에 달림(프롬프트로 "개선"만, 완전 보장 불가) — 라이브 1회 생성으로만 확인 가능. dry-run 진단 경로도 라이브로 1회 확인 권장.
- 검수자: 메인 직접(type-check/test + 누수 grep). 커밋/push 0.

### 2026-06-20 이미지 1:1 강제 — 백엔드 --size 무시 → sharp 센터크롭 (feature/naverpost-image-fixes)
- Change-Fingerprint: 0958173d72ae64c5 (이미지 수정 전체 누적 + 크롭)
- Gate Result: **PASS** — type-check 0 + test 49. 1:1 크롭은 실제 생성물에 무비용 적용으로 검증.
- 라이브 발견: `/api/image/one` 1회 생성 → 산출이 1536x1024(stale 서버) / 재기동 후 1448x1086(4:3). dry-run엔 `"size":"1024x1024"` 정상 포함 → **백엔드(private-codex/gpt-image)가 --size를 무시하고 ~4:3 출력**. `--size`만으론 1:1 불가.
- 수정: `gtiCli.ts`가 출력 PNG를 `sharp().resize(1024,1024,{fit:cover,position:centre})`로 **1:1 센터크롭**(sharp는 기존 dep, 설치 0). 크롭 실패 시 원본 폴백.
- 무비용 검증: 기존 생성물(cc540182, 1448x1086)에 동일 sharp 로직 적용 → **1024x1024 확인 ✅**. type-check 에러(Buffer/NonSharedBuffer)는 base64 문자열만 다루도록 구조 정리해 해소.
- 미검증: 재기동+크롭 반영 후 end-to-end 라이브 1장(비용)으로 최종 눈확인은 미실행(무비용 크롭 검증으로 대체). dev 서버는 다음 요청 시 새 gtiCli 재컴파일.
- 검수자: 메인 직접(라이브 1회 + dry-run + sharp 무비용 크롭 검증 + type-check/test). 커밋/push 0.

### 2026-06-20 이미지 워싱 회전 제거 (사용자 지시) (feature/naverpost-image-fixes)
- Change-Fingerprint: 4afa7fc12e939016
- Gate Result: **PASS** — type-check 0 + 워싱 무비용 실측(회전 없음·해시 변경 유지).
- 프로파일: 코드(이미지 워싱). Trigger: BeforeComplete. 사용자 지시 "회전 제거".
- 변경: `src/lib/storage/imageWash.ts` — ±1.1° 미세 회전 단계 삭제. 원본에서 바로 팬 크롭/추출(회전 버퍼 경유 제거로 한 단계 단순화). 팬 크롭·스케일·밝기/채도 지터·JPEG 재압축(mozjpeg)은 유지 → 중복 회피 그대로. 주석도 회전 비적용으로 갱신.
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc --noEmit exit 0 | PASS
  - 회전 미적용 | P0 | 실제 이미지(1254x1254) 워싱 → 출력 1206x1206, 기울기 없음 | PASS
  - 중복 회피 유지 | P1 | md5 5e879ea9 → e6a96753 (해시 변경 확인) | PASS
  - 패키지/lock 변경 0 | P1 | 변경 없음 | PASS
  - AI/외부 호출 0 | P0 | sharp 로컬 처리만 | PASS
- 미검증: 워싱 전용 유닛 테스트는 부재(기능 자체에 테스트 파일 없음) — 무비용 1회 실측으로 대체.
- 검수자: 메인 직접(type-check + sharp 무비용 실측). 커밋/push 0.

### 2026-06-20 외부 리뷰(Codex) 반영 — 워싱 1:1 contain (feature/naverpost-image-fixes)
- Change-Fingerprint: 83b77c6763b1939b
- Gate Result: **PASS** — type-check 0 + test 49 + 무비용 실측(1024x1024 contain·무크롭).
- 외부 리뷰: `codex exec review --base origin/master` (codex-cli 0.141.0). P0/P1 없음. P2 2건.
- **P2-1 반영**: `imageWash.ts` 워싱 출력이 너비만 리사이즈→원본비율(실사진 ~4:3)로 생성(1:1)과 불일치하던 것. 사용자 결정=**contain(레터박스, 무크롭)**. 최종 `resize(1024,1024,{fit:contain,background:white})` 적용(메타 폴백 경로 포함). 생성 경로(gtiCli)는 cover 크롭 유지 — 실사진은 간판 손실 방지 위해 contain.
- **P2-2 미반영(backlog)**: `.claude/settings.local.json` `Bash(gh pr *)` 권한 과대 → 사용자 결정=현행 유지. REVIEW_QUEUE/backlog 기록만.
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc --noEmit exit 0 | PASS
  - 1:1 정사각 출력 | P0 | 4:3 입력→1024x1024, 상단 흰여백(255,255,255)·중앙 원본보존 | PASS
  - 무크롭(contain) | P1 | 레터박스 확인(내용 손실 0) | PASS
  - 테스트 회귀 0 | P1 | vitest 49 passed | PASS
  - AI/외부 비용 | - | codex 리뷰 1회(승인됨), 그 외 0 | PASS
- 검수자: 외부 Codex(P2x2) + 메인 직접(type-check/test/무비용 실측). 커밋/push 0(아래 커밋 예정).

### 2026-06-20 품질 스캔 (/agency-quality-sweep, 읽기 전용)
- Change-Fingerprint: sweep-2026-06-20-readonly (코드 변경 0, 스캔만)
- Gate Result: **PASS (실행 차단 없음)** — type-check 0 · test 49 · next build 성공(6.7s) · P0 없음.
- 안전검사: tsc 0 / vitest 49 passed / `npm run lint` 7건(6E+1W) / `npm run build` exit 0(빌드는 lint 비차단 확인) / 정적 grep.
- 차원별 결점 수: 기능 1(경계검증) · 디자인/UX 3(set-state-in-effect) · 보안 1(입력검증 부재=기능과 중복) · 테스트 0(skip 0) · 문서 2(잡파일·eslintignore).
- 우선순위표:
  - [기능/보안 | API 23라우트 zod 경계검증 0건, 14곳 `body as` 무검증 | grep: zod 사용 0 / request.json 20 | **P1** | 라우트별 소단위 zod 스키마]
  - [디자인/UX | react-hooks/set-state-in-effect 3건(CRankAudit:100·CadenceTracker:52·FinalConfirm:172) | eslint error, 캐스케이드 렌더 위험(빌드 비차단) | **P2** | effect 정리/파생계산화]
  - [기능 | keywords/route.ts 3594줄(800 규칙 4.5배) | wc -l | **P2** | 핸들러/헬퍼 모듈 분리]
  - [코드품질 | `as` 캐스팅 71건(CLAUDE: no-as) | grep | **P2** | 타입가드 점진 치환]
  - [문서/잡파일 | 루트 `.tmp-test-export.mjs` 잔존(6/13) + .codex-review/*.cjs eslintignore 누락 → lint 4건 노이즈 | lint | **P3** | 파일 제거 + ignores 추가]
  - [코드품질 | KeywordOptions 933·searchSignals 839·page 808줄(>800) | wc -l | **P3** | 점진 분리]
  - [관측 | console.* 22건(비테스트) | grep | **P3** | logger 게이트 검토]
- 좋은 신호: any 0 · non-null! 0 · TODO/FIXME 0 · skip/only 0 · type-check 0 · test 49 · build OK.
- TASK 후보: TASKS.md에 P1(zod)·P2(set-state·keywords분리·as캐스팅)·P3(잡파일/eslintignore) 추가.
- 검수자: 메인 직접(읽기). 코드/커밋 0.

### 2026-06-20 P1 zod 경계검증 — image 라우트 4개 (품질스캔 후속)
- Change-Fingerprint: ee6fef9b282db6fd
- Gate Result: **PASS** — type-check 0 + test 58(49+9) + 라이브 400 4종 확인.
- 변경: 신규 `src/lib/validation/imageRequestSchemas.ts`(imageOne/Regenerate/Content/Generate 스키마 + parseRequestBody 헬퍼) + `.test.ts`(9). image/one·regenerate·prompts·generate 라우트가 `body as` 무검증 단언 → zod safeParse로 교체(실패 시 400, 기존 한국어 메시지/SSE 포맷 보존).
- 라이브(무비용, 생성 전 차단): /image/one 필수누락→400"sessionId, index, prompt는 필수입니다." · **문자열 index→400(전엔 as로 통과)** · /image/prompts 빈 content→400 · 잘못된 scene enum→400.
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc exit 0 | PASS
  - 테스트 | P1 | vitest 58 passed (+9 스키마) | PASS
  - 입력 검증 동작 | P1 | 400 4종 라이브 확인, 유효입력 동작 보존 | PASS
  - lint 무증가 | P2 | 7건 유지(새 파일 0건) | PASS
- 남음: 나머지 ~19개 라우트는 후속 TASK(article/*, blogops/*, topics/* 등). 이번은 image/* 우선.
- 검수자: 메인 직접(type-check/test/라이브 400). 커밋 예정.

### 2026-06-20 P2 set-state-in-effect 정리 + P3 eslint ignores (품질스캔 후속)
- Change-Fingerprint: 16e59f881dc34741
- Gate Result: **PASS** — type-check 0 + test 58 + build 성공 + **lint 0(7→0)**.
- P2: CRankAudit:100·CadenceTracker:52·FinalConfirm:172의 effect 내 동기 setState를 async 경로(IIFE)로 감싸 캐스케이드 렌더 경고 제거. 동작 불변(마운트/의존변경 시 fetch, 빈 본문 리셋 동일).
- P3: eslint.config.mjs globalIgnores에 `.codex-review/**`(미추적 로컬 툴링, .codex-push와 동급)·`.tmp-*`(gitignore된 임시파일) 추가 → require-import 3 + unused-var 1 노이즈 제거. 파일 삭제 0(임시파일은 이미 gitignore).
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc exit 0 | PASS
  - lint 0 | P2 | 7→0 problems | PASS
  - 테스트 회귀 0 | P1 | vitest 58 passed | PASS
  - build | P1 | next build 성공(5.7s) | PASS
- 검수자: 메인 직접(lint/type-check/test/build). 커밋 예정.

### 2026-06-20 P1 zod 경계검증 2차 — 단순 라우트 6개 (품질스캔 후속)
- Change-Fingerprint: 3f458f71b1ef8849
- Gate Result: **PASS** — type-check 0 + test 69(58+11) + lint 0 + 라이브 400 5종 + 정상 200 1종.
- 변경: 헬퍼를 `src/lib/validation/parseRequestBody.ts`로 분리(imageRequestSchemas는 재노출로 호환 유지) + 신규 `apiRequestSchemas.ts`(articleValidate/blogopsShop/topicsSuggest/topicsSeries/titleSimilarity 스키마) + `.test.ts`(11). 라우트 6개 적용: article/validate·blogops/backfill·blogops/exposure·topics/series·topics/suggest·title-similarity. `body as` → safeParse→400(기존 한국어 메시지·동작 보존).
- 라이브(무비용, 외부 호출 전 차단): topics/suggest·series 누락→400"shopId와 categoryId는 필수입니다." · article/validate 빈 content→400"content는 필수입니다." · title-similarity comparisonTitles 비문자열→400 · blogops/backfill 비문자열 shopId→400. 정상 content→200(검증 결과 반환).
- 동작 변화(경미·개선): blogops/backfill·exposure가 비문자열 shopId를 전엔 무시(전체 매장)했으나 이제 400 거부. 더 엄격·정확.
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc exit 0 | PASS
  - 테스트 | P1 | vitest 69 passed (+11) | PASS
  - 입력 검증 동작 | P1 | 라이브 400 5종 + 정상 200 | PASS
  - lint 0 | P2 | 유지 | PASS
- 남음: P1 복잡 라우트 — article/route(다필드)·article/chat·article/wash(ArticleContent 모델링)·keywords(3594줄). 다음 배치.
- 검수자: 메인 직접(type-check/test/lint/라이브). 커밋 예정.

### 2026-06-20 P1 zod 경계검증 3차(완료) — 복잡 라우트 4개 (품질스캔 후속)
- Change-Fingerprint: 8a54773f8e1bcb20
- Gate Result: **PASS** — type-check 0 + test 78(69+9) + lint 0 + 재기동 후 라이브 400 4종.
- 변경: apiRequestSchemas.ts에 keywords·article·articleChat·articleWash 스키마 추가(+test 9). KeywordOption/ArticleContent는 z.custom 타입(필수필드 런타임검증)으로 전체 모델링 없이 정확한 타입 확보. article은 enum/charCount 기본값을 스키마로 이전. 라우트 4개(keywords·article·article/chat·article/wash) body-as 단언 → safeParse → 400. ArticleContent import 미사용된 wash는 제거.
- 라이브(무비용, 재기동 후): keywords 누락→400"shopId와 categoryId가 필요합니다." · article keyword 하위필드 누락→400"keyword, shopId, categoryId는 필수입니다." · chat 빈 article→400 · wash 서브키워드 누락→400.
- 주의(절차 교훈): 공유 모듈(apiRequestSchemas)에 export 추가 시 Next dev HMR이 신규 export를 즉시 못 잡아 라이브가 "safeParse undefined" 500을 냄 → **dev 서버 재기동으로 해소**(코드는 tsc/test/node-import 모두 정상). 라이브 검증은 재기동 후 신뢰.
- 게이트 결과:
  - 타입 에러 0 | P0 | tsc exit 0 | PASS
  - 테스트 | P1 | vitest 78 passed (+9) | PASS
  - 입력 검증 동작 | P1 | 재기동 후 라이브 400 4종 | PASS
  - lint 0 | P2 | 유지 | PASS
- **P1 완료**: body-as 14라우트 전부 zod 적용(image 4 + 단순 6 + 복잡 4). request.json만 하던 나머지는 대부분 입력 없음/SSE.
- 검수자: 메인 직접(type-check/test/lint/재기동 라이브). 커밋 예정.

### 2026-06-20 keywords 핵심 로직 테스트 추출 #1 — 제목 결정론 게이트
- Change-Fingerprint: keywords-titlegate-extract
- Gate Result: PASS — type-check 0 + test 92(+14) + lint 0 + 동작 불변(라우트 16곳 사용 유지).
- 배경: keywords/route.ts(3594줄)에 핵심 결정론 게이트가 내부 함수로만 있어 전용 테스트 0이던 고위험 지점. 밥줄 핵심이라 회귀 안전망 우선.
- 변경: isAwkwardGeneratedTitle를 src/lib/keywords/titleGate.ts로 추출(순수 함수, MECHANICAL_TITLE_PATTERNS만 의존). 라우트는 import로 교체(바이트 동일 동작). titleGate.test.ts 14건: v27 전 규칙(쉼표·이모지·번호·반복·나열·슬래시·막연끝맺음·미완성조건절·비문오타·전문용어) 차단 + 오탐0 불변식(고굴절≠굴절률, 누진≠누진대, ~보는 법 통과).
- route 3594→3554줄. 게이트: tsc 0 | P0 | PASS · test 92 | P1 | PASS · lint 0 | P2 | PASS.
- 다음: 카테고리 게이트(isCategoryAppropriateCandidate) + 헬퍼 체인 추출/테스트.
- 검수자: 메인 직접(type-check/test/lint).

### 2026-06-20 keywords 핵심 로직 테스트 추출 #2 — 카테고리 게이트 + 헬퍼
- Change-Fingerprint: keywords-categorygate-extract
- Gate Result: PASS — type-check 0 + test 108(+16) + lint 0 + 동작 불변(라우트 사용 유지).
- 변경: isCategoryAppropriateCandidate + 헬퍼 4개(isRegionWord·startsWithRegionWord·isValidTwoWordKeyword(2~3단어판)·hasMalformedCompoundAxis)를 src/lib/keywords/categoryGate.ts로 추출. 라우트는 import로 교체(바이트 동일). categoryGate.test.ts 16건: 헬퍼 단위 + 메인 게이트(구조/합성축/브랜드/지역/스캐폴드 + 카테고리별 누수 frames·lenses·contacts·eye-info, 고굴절 등 안경렌즈 상품어 통과 불변식).
- route 3554→3457줄(누적 3594→3457, −137). hasMalformedCompoundAxis는 게이트 전용이라 route 직접 사용 0.
- 게이트: tsc 0 | P0 | PASS · test 108 | P1 | PASS · lint 0 | P2 | PASS.
- 남음(#1 잔여): keywords/route.ts 여전히 3457줄 — fan-out·재시도 분류 등은 라우트 상태 의존이라 추가 추출은 별도 TASK. 두 공유 하드게이트는 완료.
- 검수자: 메인 직접(type-check/test/lint).

### 2026-06-20 dead 코드/미구현 흔적 정리 (#3 품질감사 후속)
- Change-Fingerprint: deadcode-cleanup
- Gate Result: PASS — type-check 0 + test 108 + lint 0.
- 제거: (1) `writeArticleWithCodex`(claude.ts, 호출처 0 = dead) + 전용 상수 CODEX_ARTICLE_MODEL + 전용 import runCodex(runCodex 자체는 openaiKeywords가 사용해 유지). (2) env.ts `GOOGLE_SHEETS_ID`(Sheets 미구현, 읽는 코드 0 = 죽은 env) → 미구현 로드맵 NOTE로 대체.
- 보존(의도적): `tokenManager`는 writePost.json 종료로 미사용이나 CLAUDE.md 모듈 경계에 "미사용" 명시된 의도적 보존 → 유지.
- 미해결(문서): CLAUDE.md 기술스택/모듈표가 Google Sheets를 기능처럼 기술 → 실제 미구현. 제품 로드맵 문서라 임의 재작성 보류, 사용자 판단 필요.
- 게이트: tsc 0 | P0 | PASS · test 108 | P1 | PASS · lint 0 | P2 | PASS.
- 검수자: 메인 직접.

### 2026-06-20 파이프라인 골든-런 회귀 고정 (#2 품질감사 후속)
- Change-Fingerprint: pipeline-golden-export
- Gate Result: PASS — type-check 0 + test 111(+3) + lint 0 + 스냅샷 재실행 드리프트 0.
- 배경: 파이프라인 최종 산출물(붙여넣기용 export)이 결정론 순수함수인데 전체 출력 회귀 고정이 없었음. 서식/문단분리/표/이미지마커 로직 변경이 조용히 붙여넣기 품질을 망가뜨릴 위험.
- 변경: src/lib/naver/contentFormatter.golden.test.ts — 대표 원고 1개(도입+소제목2+표+불릿+문단)를 formatForNaverExport(rich HTML)·buildNaverPlainText(평문)에 통과시켜 toMatchSnapshot으로 전체 출력 고정 + 핵심 계약 불변식(제목 포함·이미지마커 3개·마크다운 잔재 0·표 "셀 / 셀"·불릿 •). __snapshots__/*.snap 골든 아티팩트 동반 커밋.
- 눈확인: 평문 골든이 제목→문장분리 문단→표 변환→[사진 N]→불릿(•) 순으로 붙여넣기 적합.
- 게이트: tsc 0 | P0 | PASS · test 111 | P1 | PASS · lint 0 | P2 | PASS.
- 검수자: 메인 직접(스냅샷 생성+재실행 안정성+눈확인).

### 2026-06-20 의료법/광고법 금지어 필터 테스트 (검증 인프라 강화)
- Change-Fingerprint: prohibited-filter-tests
- Gate Result: PASS — type-check 0 + test 131(+20) + lint 0.
- 배경: 금지어 필터(의료법/광고법)는 미검증 모듈 중 법적 리스크 최고(버그=고객 안경원 위법 글). prohibitedWords.ts는 데이터뿐, 실제 탐지로직은 contentValidator.ts(251줄, 테스트 0)에 있었음.
- 변경: isProhibitedWordPresent를 export(스마트 복합어 매칭) + contentValidator.test.ts 20건. (1)미탐 방지: 진짜 금지어(수술·치료·할인·100%) 검출. (2)오탐 방지: ALLOWED_COMPOUNDS 13개 전부(가장자리·예방접종·확실하지않·정확하지않·안전한지·추천하지·최대한·전문가적·질병관리청·의료기기안전·대학병원·치료권고·의사소통)가 정상 통과. (3)복합어+바깥 금지어 동시 검출. (4)validateContent 통합(무비용 fast 모드: sync analyzeMorphology만 써 CLI 0): 위반/정상/주의표현/키워드누락.
- 무비용 근거: validateContent fast 경로의 서브분석기(contentSignal·titleBodyAlignment·networkDuplicate·repetition·analyzeMorphology sync) 전부 CLI/fetch 0 확인.
- 게이트: tsc 0 | P0 | PASS · test 131 | P1 | PASS · lint 0 | P2 | PASS.
- 검수자: 메인 직접(type-check/test/lint + 무비용 경로 grep 확인).
