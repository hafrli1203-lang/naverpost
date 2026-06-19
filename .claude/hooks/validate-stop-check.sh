#!/usr/bin/env bash
# naverpost 자동 검증 레벨 2 (naverpost 전용 — 전체 확장 금지)
# 완료 직전(Stop) 안전 검증: 감지 경로의 "소스 코드" 변경이 있을 때만 실행.
# package.json scripts를 감지해 있는 것만 실행한다:
#   - type-check 스크립트 있으면 → tsc --noEmit (src/ 에러만 게이트)
#   - test 스크립트 있으면      → test 실행. 없으면 건너뛰고 "test: 미검증 — test script 없음".
# 실패 시 완료 차단(soft block). 외부 API/AI CLI/네트워크 호출 없음. build 자동화 제외.

input=$(cat)
echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

PATHS_RE='^(src|app|pages|components|lib|services|api|server|client|db|styles|backend|frontend|tests|tools)/|(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|tsconfig\.json)$'
EXCLUDE_RE='(^|/)(node_modules|\.git|\.claude|dist|build|out|\.next|coverage|venv|\.venv)/'
changed=$( { git status --porcelain 2>/dev/null | grep -vE '^\?\?' | awk '{print $NF}';
             git ls-files --others --exclude-standard 2>/dev/null; } \
           | grep -E "$PATHS_RE" | grep -vE "$EXCLUDE_RE" | sort -u )
[ -z "$changed" ] && exit 0   # docs-only/변경 없음 → 통과

# 스크립트 존재 감지(없는 스크립트는 실행하지 않음 → "Missing script" 오탐 방지)
has_script() { node -e "process.exit(((require('./package.json').scripts||{})['$1'])?0:1)" 2>/dev/null; }

fail=0; reasons=""

# 1) type-check (스크립트 있을 때만). .next 자동생성물 무시, src/ 에러만 게이트.
if has_script "type-check"; then
  tc_out=$(npm run type-check 2>&1)
  src_errs=$(printf '%s\n' "$tc_out" | grep -E "error TS" | grep -cE "(^|/)src/")
  if [ "${src_errs:-0}" -gt 0 ]; then
    fail=1; reasons="$reasons [type] src 타입에러 ${src_errs}건"
  fi
else
  reasons="$reasons [type] 미검증 — type-check script 없음"
fi

# 2) test (스크립트 있을 때만). 없으면 미검증(차단 안 함).
if has_script "test"; then
  ts_out=$(npm test 2>&1); ts_rc=$?
  if [ "$ts_rc" -ne 0 ]; then
    fail=1; ts_sum=$(printf '%s\n' "$ts_out" | grep -E "Tests |Test Files|FAIL|failed" | head -2 | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-200)
    reasons="$reasons [test] 실패: ${ts_sum:-?}"
  fi
else
  reasons="$reasons [test] 미검증 — test script 없음"
fi

if [ "$fail" -eq 1 ]; then
  printf '{"decision":"block","reason":"naverpost 자동검증 레벨2 실패 — 완료 불가.%s. 기능 코드를 고쳐 통과시키고 docs/ai/HARNESS_RESULTS.md에 결과(Change-Fingerprint 아래 Gate Result)를 기록한 뒤 다시 완료하세요. (build는 자동검증 제외)"}' "$(printf '%s' "$reasons" | sed 's/"/\\"/g')"
  exit 0
fi

# 통과(또는 일부 미검증) → 완료 허용. 미검증 항목은 HARNESS_RESULTS에 메인 작업자가 정직히 기록.
exit 0
