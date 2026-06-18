# WORKFLOW — naverpost

기준: `C:\project\_AGENCY_OS\WORKFLOW_RULES.md` + 기존 `bot_created_rule.md` 5단계 플로우.

## 작업 순서
1. 기존 `CLAUDE.md`·`bot_created_rule.md`·`docs/ai/`·관련 `docs/designs/` 읽기.
2. `TASKS.md`/`UI_TASKS.md`에서 최우선 1개 선택.
3. 코드 전 `docs/designs/`에 설계 문서 작성(목적/트리거/실패 복구/상태 경계/아웃풋). 스프린트 계약(범위·바꿀 파일·테스트 방법·엣지 케이스) 한 단락.
4. 작은 단위 구현(기능 하나/화면 하나). 모듈 상태 경계 준수.
5. 실행 확인: `pnpm dev`(http://localhost:3100), `pnpm test`, `pnpm type-check`.
6. 기준 충족까지 Loop 반복(`LOOP_PATTERN` 참조 — 워크스페이스 공통).
7. 문서 갱신(`TASKS`/`ERROR_LOG`/`DECISIONS`/UI면 `DESIGN_AUDIT`)·`CHANGELOG.md`.
8. 결과 보고(무엇을 고쳤고 어떤 결과가 나왔는지 + 증거).

## 첫 세션 규칙
- 첫 세션은 코드 수정 금지. 문서 생성/구조 파악/TASK 정리만.

## 실행 메모
- 개발: `pnpm dev` → :3100 / 빌드: `pnpm build` / 타입: `pnpm type-check` / 테스트: `pnpm test`
- 새 기능은 `docs/designs/`에 설계 먼저. 버전은 소수점 관리, 변경은 `CHANGELOG.md`.
