# OPERATING_STANDARD — naverpost 운영 기준 (골든 샘플)

> naverpost는 AGENCY AI OS의 **기준 프로젝트(골든 샘플)**. 모든 작업이 LLM Wiki → Workflow → Loop → subagent → harness → Stop hook → (PR)외부리뷰 → AX 순으로 돈다. 갱신: 2026-06-19.
> 상위: `_AGENCY_OS/OPERATING_PROTOCOL.md`, `MASTER_RULES.md`.

## 1. 위치(단계)
- **naverpost는 내부 사용 로컬 도구다.** 지금은 **배포하지 않는다.**
- 팀원이 생기고 운영 규모가 커지면 그때 **배포/권한/멀티테넌트/운영 보안**을 강화한다(별도 단계).
- **지금 우선순위**: READY 상태 유지 + AX 후보 정리.

## 2. 절대 기준
- 외부 API/네이버 실계정 **발행 금지**(붙여넣기 export → 사람이 수동 임시저장. writePost.json 2020 종료).
- **AI CLI 비용 호출은 사람이 승인할 때만**(키워드/본문/이미지 생성). 내부 점검은 무비용 흐름(export/검증/타입/빌드)만.
- 민감정보(.env.local, 키/토큰/쿠키, 계정/매장 정보) 열람·출력 금지.
- 기존 기능/모듈 삭제 금지, 모듈 상태 경계(CLAUDE.md) 준수.

## 3. 작업 방식
- **모든 작업은 TASK 하나씩** 처리한다.
- **모든 작업은 실행/검증/기록을 남긴다**(test/typecheck/build 또는 정적 + HARNESS_RESULTS).
- **모든 완료는 Stop hook + HARNESS_RESULTS 통과**가 전제(미기록 시 완료 차단).
- 코드 변경은 **계획 보고 → 승인 → 구현 → 검수 → 기록** 순. 문서 TASK는 계획 알리고 진행 가능.

## 4. 운영 문서 지도 (이 폴더)
- 사용: `NAVERPOST_RUNBOOK.md`, `READY_CHECKLIST.md`, `RUN_LOCAL_TOOL_PROMPT.md`
- 작업: `RUN_NEXT_TASK_PROMPT.md`, `WORKFLOW.md`, `SUBAGENT_PROTOCOL.md`
- 구조: `WIKI_INDEX.md`(라우트 맵), `PIPELINE_FLOW.md`, `SCREEN_FLOW.md`
- 품질: `HARNESS.md`, `QUALITY_GATES.md`, `METRICS.md`, `HARNESS_RESULTS.md`
- 외부/승격: `EXTERNAL_REVIEW.md`(+ CODE_REVIEW.md), `AX_CANDIDATE.md`
- 기록: `TASKS.md`, `ERROR_LOG.md`, `DECISIONS.md`

## 5. 6대 구조 연결 상태 (골든 샘플)
| 구조 | 연결 |
|---|---|
| LLM Wiki | docs/ai 전체 + WIKI_INDEX 라우트 맵 ✅ |
| Workflow | WORKFLOW.md + RUN_NEXT_TASK_PROMPT ✅ |
| Loop Pattern | P0/P1 통과까지 반복(LOOP_PATTERN) ✅ |
| Subagent 검증 | SUBAGENT_PROTOCOL(5종) ✅ |
| Harness 검증 | QUALITY_GATES/METRICS/HARNESS_RESULTS ✅ |
| Stop hook | v2(tracked+untracked) ✅ |
| 외부 Agent 리뷰 | EXTERNAL_REVIEW + Codex 템플릿 ✅ |
| AX 승격 | AX_CANDIDATE + _AGENCY_OS/AX_CANDIDATE_INDEX ✅ |

## 6. 나중 단계(보류 — 지금 하지 않음)
- AfterEdit/PostToolUse 자동화, 배포 파이프라인, 로그인/권한/멀티테넌트, 비밀관리, 모니터링.

## 7. 자동 검증 레벨 (2026-06-19)
- **LEVEL 1**: 문서 + Stop hook v2(fingerprint 기록 게이트) — 적용됨.
- **LEVEL 2**: 완료 직전 자동 type-check + test(감지경로 소스 변경 시만), 실패 시 완료 차단 — **적용됨**(`.claude/hooks/validate-stop-check.sh`). build는 자동화 제외(수동). naverpost 전용, 전체 확장 안 함.
- **LEVEL 3**: 외부 리뷰 준비(EXTERNAL_REVIEW.md + PR/@codex 문구) — 준비됨.
- **LEVEL 4**: 외부 리뷰 실제 실행 — 보류(commit/push·AI CLI 호출 1회 승인 필요).
- 자동검증은 외부 API/AI CLI/네트워크 호출 없음(type-check·vitest 오프라인). 측정 소요: type-check ~7.5s + test ~6.4s(합 ~12s, 완료 시 1회).

## 8. 자동검증 레벨2 FULL (2026-06-19, P2-F4)
- test 인프라 도입(package.json test + vitest devDep + lockfile)으로 validate-stop-check.sh가 type-check + test 모두 실행 → 레벨2 **FULL**(이전 type-check 중심 PARTIAL 해소).
- 여전히 build는 자동검증 제외(수동), naverpost 전용(전체 미확장).

> 명령어 레이어: docs/ai/COMMANDS.md
