# READY_CHECKLIST — naverpost 오늘 내부 사용 점검

> 내부 사용 가능 여부 체크. 기준: `OPERATING_STANDARD.md`. 갱신: 2026-06-19.
> 판정: 전부 ✅ → READY · 일부 미검증/제한 → PARTIAL · 핵심 ✗ → BLOCKED.

## 체크리스트
| # | 항목 | 확인 방법 | 2026-06-19 결과 |
|---|---|---|---|
| 1 | 서버 실행 | `npm run dev`(:3100) Ready | ✅ Ready 7.4s |
| 2 | 첫 화면 200 | `curl http://localhost:3100/` | ✅ 200 |
| 3 | operations 접근 | `curl .../operations` | ✅ 200 (login/admin도 200) |
| 4 | export 동작 | contentFormatter vitest | ✅ rich+plain 생성(2 passed) |
| 5 | 외부 API 호출 없음(점검 중) | AI 흐름 미트리거 | ✅ 0 |
| 6 | AI CLI 비용 호출 주의 | 생성 버튼=비용 표시 | ✅ RUNBOOK 명시 |
| 7 | Stop hook 통과 | 훅 실행 exit 0 | ✅ PASS |
| 8 | HARNESS_RESULTS 기록 | 최근 블록 존재 | ✅ |
| 9 | TASKS 최신화 | T1/T2/T3 반영 | ✅ |
| 10 | 타입/테스트 | `tsc` src 0, vitest 26 | ✅ |

## 판정: **READY** (오늘 내부 업무 바로 사용 가능)

## 빠른 재점검 명령
```bash
cd C:\project\naverpost
curl -s -o NUL -w "%{http_code}" http://localhost:3100/    # 200 기대 (bash: -o /dev/null)
npm test                                                    # vitest green
echo '{}' | bash .claude/hooks/harness-stop-check.sh        # exit 0 = pass
```

## 주의
- AI 생성 버튼은 실제 비용 → 무비용으로 쓰려면 export/검증만.
- 발행 금지(붙여넣기 수동 임시저장).

## 자동 검증 레벨 2 (2026-06-19)
- 완료 직전 자동검증: ✅ `.claude/hooks/validate-stop-check.sh` (감지경로 소스 변경 시 type-check+test, 실패 시 block)
- PASS 경로 검증: ✅ ~12s, exit 0 · BLOCK 경로 검증: ✅ 실패 테스트 주입→block→제거 확인
- build: 자동검증 제외(수동) · docs-only 변경: 자동검증 skip

## P2-F4 test 인프라 반영 (2026-06-19) — FULL PASS
- test 스크립트/vitest devDep 추가(clean PR). `pnpm test` 2 passed, `pnpm run type-check` src 0.
- 자동검증 레벨2: 이제 type-check + test **둘 다 실행**(이전 'test 미검증' 해소).
