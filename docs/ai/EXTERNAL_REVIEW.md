# EXTERNAL_REVIEW — naverpost 외부 Agent(Codex) 리뷰

> 기준: `_AGENCY_OS/EXTERNAL_REVIEW_PROTOCOL.md` + `_AGENCY_OS/CODEX_PR_REVIEW_TEMPLATE.md`. 갱신: 2026-06-19.

## 역할
- **Claude = 메인 작업자**(구현·실행·기록·반영).
- **subagent = 내부 검수자**(test-runner/code-reviewer/harness-reviewer/metrics-auditor/ux-harness-reviewer).
- **Codex/외부 Agent = PR 외부 리뷰어**(Claude 내부 자동 실행 아님).

## 위치
```
구현 → 내부 subagent 검수 → Harness P0/P1 통과 → Stop hook 통과
  → PR 생성 → @codex review → 피드백 → Claude 반영 → 재검수
```
- **PR 전 내부 하네스 통과 필수**(HARNESS_RESULTS에 PASS/명시된 미검증만).

## PR 리뷰 요청 문구
```
@codex review
Change: <요약>. Internal harness PASS (vitest <X passed>, tsc src 0, fp <fp>).
Focus: 보안 회귀(authz/IDOR), 데이터 흐름, 기존 동작 삭제 위험, 테스트 누락,
       금지어/의료법 필터 우회, 발행 금지 정책 위반 여부.
Standard: naverpost AGENTS.md + docs/ai/CODE_REVIEW.md. Severity P0~P3.
```

## 반영 규칙
- **P0/P1**: 반드시 반영 → 내부 하네스 재실행 → 머지. 미반영 시 머지 금지.
- **P2**: 판단(반영 시 근거, 보류 시 `ERROR_LOG.md`/`REVIEW_QUEUE` 기록).
- **P3**: 선택.
- 반영 결과는 `HARNESS_RESULTS.md`에 "외부 리뷰 반영" 블록으로 기록.

## 리뷰 기준 문서
- `AGENTS.md`(작업 원칙·모듈 경계) + `docs/ai/CODE_REVIEW.md`(6대 항목·P0~P3) + `docs/ai/HARNESS_RESULTS.md`(이미 통과한 게이트).

## naverpost 주의
- 발행 금지(writePost.json 2020 종료) 정책 위반·AI 비용 호출 누락 검증 포함 요청.
- commit/push/PR 생성은 사용자 승인 후. Claude 임의 push 금지.

---

## 실행 상태 (2026-06-19)
### 환경 점검
- git repo: ✅ (branch `chore/agency-os-setup` — main/master 아님)
- remote: ✅ origin github.com/hafrli1203-lang/naverpost.git
- gh CLI: ✅ 로그인됨(hafrli1203-lang) · codex CLI: ✅ 0.138.0
- 변경 범위: docs + .claude(훅/설정) + 테스트 1개. **소스 로직(.ts/.tsx) 변경 0** → 저위험.

### 경로 판정
- **A안(GitHub draft PR)**: 환경 가능하나 `commit`+`push` 필요 → 세션 표준 "commit/push 금지" + 허용목록("draft PR 생성 **계획**")에 따라 **1회 명시 승인 대기**.
- **B안(codex 로컬 diff 리뷰)**: codex CLI 존재하나 호출이 이번 절대금지 "AI CLI 비용 호출 금지"에 해당 → **1회 명시 승인 대기**.
- **현재 판정: C안(준비 완료, 실행 보류)** — 아티팩트 전부 준비됨. 실행만 승인 시 즉시 가능.

### 실행에 필요한 수동 조치(내가 클릭/승인할 것)
- **A안 실행 시**(승인하면 Claude가 수행): `git add` (docs+.claude+test만) → `git commit` → `git push origin chore/agency-os-setup` → `gh pr create --draft` → PR 댓글에 아래 @codex 문구. **merge/deploy 금지.**
- **B안 실행 시**: `codex` 로컬 리뷰로 uncommitted diff 검토(푸시 없음). 결과를 본 파일에 기록.

### PR 본문(준비됨, draft 전용)
```
## What changed
naverpost 골든 샘플 운영 세팅: 자동검증 레벨2 훅 + 운영 문서 10종 + 라우트/파이프라인/화면 맵.
소스 로직 변경 없음(docs + .claude 훅 + 테스트 1개).

## Internal harness (passed)
- type-check: src 에러 0 · vitest: 26 passed (5 files) · 자동검증 레벨2: PASS(block 경로 검증 완료)
- Stop hook v2 + validate hook 통과 · 기능 코드 변경 0

## Review focus
보안 회귀 / 테스트 누락 / 데이터 흐름 / 외부 API·AI CLI 비용 호출 위험 /
네이버 실계정 발행 위험 / 기존 export 기능 회귀 / HARNESS_RESULTS·TASKS 기록 누락 / AX 후보 문서 누락

## Constraints
내부 사용 단계. 배포/권한/멀티테넌트 범위 밖. naverpost AGENTS.md + docs/ai/CODE_REVIEW.md, P0~P3.
merge/deploy 금지(draft only).

@codex review
Focus: security regressions, missing tests, data-flow, external/AI-CLI cost-call risk, Naver live-publish risk, export regression, missing harness/TASKS records, AX-candidate doc gaps. Standard: AGENTS.md + docs/ai/CODE_REVIEW.md. P0~P3.
```

### 리뷰 결과 기록란
- (실행 시 여기에 Codex P0~P3 지적과 Claude 반영 내역 기록)
- 미실행 사유: commit/push 및 AI CLI 호출이 세션 정책상 1회 승인 필요(위).

---

## Codex P1 대응 + 기능 backlog 분리 (2026-06-19)
- **P1(혼합 PR)**: PR #1이 기존 기능 커밋 + 운영체계 커밋 혼합 → "no source change"가 PR diff 기준 부정확. **clean 브랜치(`chore/naverpost-agency-ai-os-clean`)로 분리** 대응. PR #1은 merge 안 함(superseded, draft 유지).
- **WIKI analysis route 수정**: `analysis`를 단일 "로컬"에서 mode별(posting-audit=로컬 / smart-block·autocomplete-index=외부 네이버 호출·credentials 필요)로 정정.
- **기능 이슈 → P2 backlog 분리(이번 PR 미수정)**: keyword cache version bump / detail photo pool 없을 때 detail prompt drop / ArticlePreview citations stale. (TASKS.md P2-F1~F3)

---

## PR #2 2차 리뷰 요청 (2026-06-19, P2-F4 반영)
- 변경: test 인프라 추가(package.json test/vitest devDep, pnpm-lock.yaml, export 테스트). 기능 소스 로직 0.
- clean PR 기준 **FULL PASS**: type-check src 0 + pnpm test 2 passed. 자동검증 레벨2가 type-check+test 모두 실행(PARTIAL→FULL).
- PR #2에 추가 commit push 후 **@codex review 2차 요청**(test infra/lockfile/package regression 포커스).
- merge/deploy/main push 금지 유지.

---

## 이미지 파이프라인 수정 리뷰 요청 준비 (2026-06-20)
### 범위 (origin/master..HEAD, 2 commits, clean)
- `1609d1a` fix: 1:1 강제(sharp 센터크롭) + 워싱 회전 제거 + 프롬프트 누수 필터 + 참조 충실도 + 진단옵션
- `c40a79e` docs: AGENCY-OS COMMANDS.md + 포인터 (운영문서, 기능과 분리됨)
- 진짜 diff: 14파일(+289/−33). 코드 6 + 신규필터/참조/테스트 4 + 문서 4. **로컬 master(e2c63c1)는 stale — origin/master=98084a3 기준.**

### 내부 하네스 (PASS)
- type-check src 0 · vitest 49 passed(8 files) · fp 4afa7fc12e939016(회전제거) / 0958173d72ae64c5(누적).
- 라이브 1회 실측: /api/image/one 순수생성 → 1024x1024 정사각·회전없음 확인(AI 비용 1회 승인됨).

### PR 본문 (draft 전용, 준비됨)
```
## What changed
이미지 파이프라인 결함 수정: (1) 백엔드가 --size를 무시해 ~4:3 출력 → sharp로 1024x1024 센터크롭 강제,
(2) 워싱 ±1.1° 미세 회전 제거(사진 기울어짐), (3) Claude가 흘리는 한국어 설명문이 gti에 새어 실패하던 것을
hangulRatio 필터로 차단, (4) 참조 사진 첨부 시 설비 복제·증식 금지 지시, (5) gti --dry-run/--debug 진단 + 실패코드 노출.
운영문서(COMMANDS.md)는 별도 커밋으로 분리.

## Internal harness (passed)
- type-check src 0 · vitest 49 passed (8 files) · 라이브 1회 1024x1024 1:1 확인.

## Review focus
- sharp cover-crop이 비정사각 입력에서 콘텐츠 손실/원본 폴백 경로 타당성
- imageWash 회전 제거 시 .removeAlpha() 동반 삭제 → 투명 PNG 입력의 JPEG 배경 처리(워싱 경로는 매장 JPEG 전용이나 확인)
- 보안 회귀(rawPhoto IDOR 허용목록), 데이터 흐름, 기존 export/생성 동작 삭제 위험, 테스트 누락
- AI CLI 비용 호출 누락/중복, 네이버 발행 금지 정책 위반 여부

## Constraints
내부 사용 단계. naverpost AGENTS.md + docs/ai/CODE_REVIEW.md, P0~P3. merge/deploy 금지(draft only).

@codex review
Focus: sharp square-crop content loss & fallback, imageWash removeAlpha drop on transparent PNG→JPEG, rawPhoto IDOR allowlist, data-flow, export/generation regression, missing tests, AI-CLI cost-call risk, Naver live-publish policy. Standard: AGENTS.md + docs/ai/CODE_REVIEW.md. P0~P3.
```

### 실행 경로 (1회 명시 승인 필요)
- **A안(draft PR)**: `git push origin feature/naverpost-image-fixes` → `gh pr create --draft --base master` → PR 댓글 @codex. merge 금지.
- **B안(codex 로컬 diff)**: `codex`로 origin/master..HEAD diff 리뷰(푸시 없음, AI 비용).
- **현재: 준비 완료·실행 보류(C안)**. 승인 시 즉시 실행.

### Codex 리뷰 결과 (2026-06-20, B안 로컬 diff)
실행: `codex exec review --base origin/master` (codex-cli 0.141.0). Build/type-check/test PASS 전제 확인. **P0/P1 없음.**
- **[P2-1] 워싱(실사진) 경로도 1:1 크롭 필요** — `src/lib/storage/imageWash.ts:58-60`. gtiCli의 1:1 센터크롭은 *생성* 경로에만 적용됨. exterior/interior/detail에서 rawPhoto가 붙으면 one/regenerate가 `washImageBuffer`의 JPEG(원본 비율, width만 리사이즈)를 그대로 반환 → **실사진 슬롯은 ~4:3, 생성 슬롯은 1:1로 불일치**. 1:1 계약이면 워싱 경로도 동일 cover 정사각 크롭 적용.
- **[P2-2] `gh pr *` 권한 과대** — `.claude/settings.local.json:172`. `Bash(gh pr *)`가 merge/close/edit/comment까지 무프롬프트 허용 → draft-only·승인 원칙과 충돌. 정확한 read/draft-create로 좁히거나 제거.
판정/반영: 아래 HARNESS_RESULTS + 사용자 승인 흐름. merge/deploy 안 함.
