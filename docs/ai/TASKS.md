# TASKS — naverpost

> 현재 코드 구조 기준 TASK 후보. 작은 단위. 상태: [ ] 대기 · [~] 진행 · [x] 완료
> ※ 루트 `TASKS.md`(프로젝트 자체 백로그)와 별개. 이 파일은 운영구조 관점 TASK.

## 기능 TASK 후보
- [x] T1. `src/app/api/` 라우트별 입력/출력 책임 정리 → `WIKI_INDEX.md` (2026-06-19 완료: 23라우트 입출력 맵)
- [x] T2. 화면 흐름 문서화 → `SCREEN_FLOW.md` (2026-06-19 완료: 4화면+메인 워크플로우 클릭순서+AX UI)
- [x] T3. 파이프라인 데이터 흐름 → `PIPELINE_FLOW.md` (2026-06-19 완료: 단계별 입출력·외부의존·비용지점·HITL)
- [ ] T4. validation(금지어/키워드 규칙/반복 검사) 적용 지점 점검
- [ ] T5. BlogOps/Supabase 연동 경로와 실패 복구 동작 확인

## 메모
- 1차는 파악/문서 중심. 기능 변경은 `docs/designs/` 설계 후 5단계 플로우.
- 모듈 상태 경계(`CLAUDE.md`) 침범 금지. 발행 금지. 민감정보 열람 금지.
C:/project/naverpost/docs/ai/TASKS.md

## FAST BATCH 파일럿 (2026-06-19)
- [x] Stop hook 신규 적용(.claude/settings.json + hooks, detailpage 검증본) + 테스트 baseline — type-check exit 0, vitest 24 passed. 기능 코드 변경 0건. HARNESS_RESULTS 기록 완료.

- [x] 오늘 사용 가능 점검(2026-06-19): naverpost 로컬 실행(:3100) + 4화면 200 + 붙여넣기 export 흐름 검증(vitest 26 passed, tsc 0). 판정 READY. 기능 코드 변경 0건. AI 생성 파이프라인은 외부호출이라 미트리거(미검증).

- [x] RUN_LOCAL_TOOL 점검(2026-06-19): naverpost dev :3100 200, export 흐름·vitest 26·tsc 0 → 판정 READY(내부 사용 가능).

## 골든 샘플 세팅 (2026-06-19)
- [x] naverpost 운영 문서 10종 작성/갱신(RUNBOOK·PIPELINE_FLOW·SCREEN_FLOW·SUBAGENT_PROTOCOL·EXTERNAL_REVIEW·READY_CHECKLIST·RUN_NEXT_TASK_PROMPT·RUN_LOCAL_TOOL_PROMPT·OPERATING_STANDARD + WIKI_INDEX/AX_CANDIDATE 보강). 6대 구조 연결 완료. 기능 코드 변경 0.

## 자동화 + 외부검증 (2026-06-19)
- [x] 자동검증 레벨2 적용(validate-stop-check.sh): 완료 직전 type-check+test, 실패 시 block. PASS+BLOCK 경로 검증. naverpost 전용.
- [~] 외부 Agent 리뷰: 준비완료(PR본문+@codex 문구). 실행은 commit/push·codex 1회 승인 대기(C안).

## 별도 기능 TASK backlog (Codex 리뷰 분리, P2) — 2026-06-19
> 이번 clean PR(운영체계 문서/훅/테스트) 범위 밖. 기능 소스 변경이라 별도 TASK로 처리(승인 후).
- [ ] P2-F1. keyword cache version bump 필요 가능성 점검 (캐시 무효화/버전 키)
- [ ] P2-F2. detail photo pool 없을 때 detail prompt drop 문제 (이미지 프롬프트 누락 처리)
- [ ] P2-F3. ArticlePreview citations stale 문제 (본문 변경 후 인용 갱신)
- [ ] P2-F4. export test / vitest 인프라 도입 (package.json test 스크립트 + vitest devDep) — clean PR 범위 밖, 별도 승인 TASK.
