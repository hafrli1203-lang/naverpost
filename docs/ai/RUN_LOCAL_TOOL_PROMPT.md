# RUN_LOCAL_TOOL_PROMPT — naverpost 오늘 바로 쓰기

> 오늘 naverpost를 내부 업무에 바로 쓰고 싶을 때 붙여넣는다. 배포 기준 아님.
> 기준: `_AGENCY_OS/RUN_LOCAL_TOOL_PROMPT.md`의 naverpost 전용본 + `READY_CHECKLIST.md`.

---

```
대상: C:\project\naverpost

목표: 오늘 내부 업무에 바로 쓸 수 있는지 확인하고 가능하게 만든다(배포 아님).

1) NAVERPOST_RUNBOOK.md, READY_CHECKLIST.md, PIPELINE_FLOW.md 읽기.
2) 서버 기동: npm run dev → http://localhost:3100
3) 접속 확인: / , /operations 가 200인지(curl 또는 브라우저).
4) 핵심 흐름 확인(무비용): export(contentFormatter)·검증(validation) 동작 — vitest 또는 샘플.
5) AI 생성(키워드/본문/이미지)은 실제 비용 → 실행하지 마라(사람 승인 시만).
   외부 네이버 API·실계정 발행 금지.
6) 막히면 P0만 작은 수정(import/경로/포트/env 기본값/스크립트). 그 이상은 멈추고 승인 요청.
7) READY / PARTIAL / BLOCKED 판정.
8) docs/ai/HARNESS_RESULTS.md 기록(Change-Fingerprint 아래 줄에 Gate Result).
9) 쓸만한 기능/데이터/UI는 docs/ai/AX_CANDIDATE.md에 반영. 실패는 ERROR_LOG.md.

금지: 패키지 설치 / package.json·lockfile 수정 / DB 마이그레이션 / 외부 API·실발행·AI 비용 호출 /
.env·토큰 열람·출력 / commit·push / 리디자인 / 다른 프로젝트 수정.

보고: 서버 기동·접속 URL·핵심 흐름 결과 / 외부 호출 여부 / 수정(있으면)·P0/P1 /
통과·실패·미검증 / HARNESS_RESULTS·TASKS·AX_CANDIDATE 반영 /
최종 판정(READY/PARTIAL/BLOCKED) + 오늘 쓰는 법 + 다음 1개.
```

## 비고(자동검증 레벨2)
- 내부 사용 점검도 소스 변경이 있으면 완료 직전 자동검증(type-check+test)이 돈다. 무비용(외부/AI 호출 없음).
