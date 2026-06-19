# RUN_NEXT_TASK_PROMPT — naverpost 표준 TASK 프롬프트

> Claude Code에 그대로 붙여넣는다. 기준: `_AGENCY_OS/RUN_NEXT_TASK_PROMPT.md`의 naverpost 전용본.

---

```
대상: C:\project\naverpost

_AGENCY_OS/OPERATING_PROTOCOL.md 방식으로 TASK 1개만 처리해라.

1) 읽기(수정 금지): AGENTS.md, CLAUDE.md, docs/ai/(WIKI_INDEX, PROJECT_BRIEF, WORKFLOW, TASKS,
   HARNESS, QUALITY_GATES, METRICS, PIPELINE_FLOW, SCREEN_FLOW, SUBAGENT_PROTOCOL).
2) docs/ai/TASKS.md에서 최우선 TASK 1개만 선택해 5줄 이내 요약.
3) 수정 전 계획 보고: 범위 / 바꿀 파일 / 테스트 방법 / 엣지 케이스.
   → 코드 변경이 필요하면 멈추고 내 승인을 기다려라(승인 전 코드 수정 금지).
4) 승인 후 필요한 파일만 작은 단위로 수정. CLAUDE.md "모듈 상태 경계" 준수.
5) 직접 실행/테스트: npm run type-check, npm test(vitest), 필요시 dev:3100.
   ※ AI 생성 라우트(keywords/article*/image*)는 실제 비용 → 사람 승인 없이 호출 금지(무비용 흐름만).
6) subagent 검수(SUBAGENT_PROTOCOL.md): test-runner → (코드변경시) code-reviewer → metrics-auditor → harness-reviewer → (UI면) ux-harness-reviewer.
   한 줄 응답만 주면 재요청 말고 exit code·테스트 숫자로 직접 요약.
7) P0/P1 FAIL이면 수정 루프. 통과 전 "완료" 금지.
8) docs/ai/HARNESS_RESULTS.md 기록: Change-Fingerprint 바로 아래 줄에 Gate Result(PASS/PARTIAL/FAIL/미검증).
9) docs/ai/TASKS.md, ERROR_LOG.md, DECISIONS.md, WIKI_INDEX.md 갱신. 쓸만하면 AX_CANDIDATE.md.
10) Stop hook 통과 확인 후 완료 보고.

금지: 기능 무관 코드 수정 / 패키지 설치 / package.json·lockfile 수정 / DB 마이그레이션 /
외부 API·네이버 실발행·AI 비용 호출(승인 없이) / .env·토큰 열람·출력 / commit·push /
AfterEdit·PostToolUse 자동화 / 다른 프로젝트 수정.

보고: 한 일 / 실행·테스트 숫자(통과·실패·미검증) / 수정 파일 / P0·P1 잔여 /
HARNESS_RESULTS·TASKS·ERROR_LOG·WIKI 반영 / 다음 TASK 1개.
```

## 비고(자동검증 레벨2)
- 이 프롬프트로 작업 완료 시, 소스 변경이 있으면 Stop 단계에서 type-check+test가 자동 실행되어 실패 시 완료가 차단된다. 통과 후 HARNESS_RESULTS에 자동검증 결과를 기록하라.
