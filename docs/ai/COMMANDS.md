# COMMANDS — naverpost 명령어 사용법

> 앞으로 긴 프롬프트를 붙여넣는 대신 아래 전역 슬래시 명령을 쓴다.
> 전역 정의: `~/.claude/commands/agency-*.md`. 공통 기준: `C:\project\_AGENCY_OS`.

## 명령
| 명령 | 언제 | 무엇을 |
|---|---|---|
| `/agency-run-local` | 오늘 이 도구 쓸 수 있나 점검 | 서버·첫 화면·핵심 흐름·테스트 확인 → READY/PARTIAL/BLOCKED. P0/P1만 좁게 수정 |
| `/agency-next-task` | 다음 작업 1개 처리 | TASKS.md 최우선 1개. 계획 보고→승인→구현→테스트→하네스 기록 |
| `/agency-improve-ui` | 화면 디자인 개선 | 한전ON+rightpeople 기준 화면 1개 감사·개선. ux-harness 검수 |
| `/agency-improve-feature` | 기능 결점 수정 | ERROR_LOG/TASKS에서 가장 막히는 P0/P1 1개 |
| `/agency-quality-sweep` | 전체 결점 스캔 | 기능/디자인/보안/테스트/문서 P0~P3 우선순위표(수정 안 함, TASK 후보) |
| `/agency-external-review` | 외부 리뷰 | 내부 하네스 통과 후 draft PR/Codex. merge/deploy 금지 |
| `/agency-auto-improve` | 자동 개선 | 효과 큰 1개를 안전 범위 내 자동 처리(`AUTO_IMPROVE_POLICY.md`) |

## 이 프로젝트 실행/테스트 명령
- 실행: `pnpm dev` (next dev -p 3100, http://localhost:3100). 프로덕션: `pnpm build` → `pnpm start`
- 테스트: `pnpm test` (vitest run). watch: `pnpm test:watch`
- 타입체크/빌드: `pnpm type-check` (tsc --noEmit) · 빌드 `pnpm build` · 린트 `pnpm lint`

## 오늘 내부 사용 기준
- `READY_CHECKLIST.md` / `RUN_LOCAL_TOOL_PROMPT.md` 참조. 네이버 발행 금지(붙여넣기 export), AI CLI 비용 호출은 사람 승인 시만.

## 디자인 개선 시
- `docs/ai/DESIGN_REFERENCE.md`, `UI_TASKS.md`를 먼저 읽는다(상위: `_AGENCY_OS/DESIGN_REFERENCE.md`, `UIUX_HARNESS.md`).

## AX 후보
- `docs/ai/AX_CANDIDATE.md` 참조.
