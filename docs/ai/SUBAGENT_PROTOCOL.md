# SUBAGENT_PROTOCOL — naverpost 내부 검수자 사용 규칙

> 기준: `_AGENCY_OS/SUBAGENT_GUIDE.md` + `OPERATING_PROTOCOL.md`. 갱신: 2026-06-19.
> 공통 규칙: subagent는 읽기/안전실행만, 코드 수정·배포·DB·설치 금지. **한 줄 응답만 주면 재요청에 시간 쓰지 말고 메인이 실행 로그·exit code·테스트 숫자로 직접 요약**(이 프로젝트에서 반복 관찰됨).

| subagent | 언제 호출 | 무엇을 검수 | 남기는 숫자 | 한 줄 응답 시 대체 기준 |
|---|---|---|---|---|
| **test-runner** | 빌드/테스트/실행 확인 필요 시(구현 직후) | `npm run build`/`type-check`/`vitest`/dev 기동 안전 실행 | passed/failed/errors, exit code, 빌드 성공 여부 | 메인이 직접 `npm test`/`tsc` 실행 → exit code·숫자 인용 |
| **code-reviewer** | **코드 변경이 있을 때만** | 품질/보안 회귀(IDOR/authz)/기능 회귀/데이터 흐름/산출물 오류/테스트 누락/UI 영향 | P0~P3 건수 | 메인이 변경 diff 정독 + 정적 grep으로 P0~P3 직접 판정 |
| **harness-reviewer** | 모든 TASK 완료 직전 | `QUALITY_GATES.md` 게이트 PASS/FAIL | 게이트별 PASS/P0/P1/P2/미검증 | 메인이 게이트 표 직접 작성(측정값 근거) |
| **metrics-auditor** | 숫자 집계 필요 시 | `METRICS.md`(빌드/타입/lint/테스트/민감파일/의존성) | 항목별 측정값 | 메인이 명령 실행 결과로 직접 집계 |
| **ux-harness-reviewer** | **UI 화면 작업이 있을 때만** | 반응형/CTA/로딩·빈·오류 상태/접근성/라우팅 영향 | P0~P3 + 상태 3종 존재 여부 | 메인이 페이지 정적 점검(컴포넌트/상태 처리) |

## 호출 순서(표준)
1. 구현 → **test-runner**(실행/테스트) → 2. 코드변경 있으면 **code-reviewer**(보안/회귀) → 3. **metrics-auditor**(숫자) → 4. **harness-reviewer**(게이트 판정) → 5. UI면 **ux-harness-reviewer**.
- P0/P1 FAIL → 수정 루프(`LOOP_PATTERN`), 통과 전 완료 금지.

## naverpost 특이사항
- AI 생성 라우트(keywords/article*/image*)는 실호출=비용 → test-runner도 **AI 흐름은 미트리거**, 무비용 흐름(export/검증/타입/빌드)만 안전 실행.
- 발행 라우트 없음 → "라이브 write" 검수 항목은 N/A.
- 검수 결과 수치는 항상 `HARNESS_RESULTS.md`에 기록(메인 작업자).
