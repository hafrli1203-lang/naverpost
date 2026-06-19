#!/usr/bin/env bash
# naverpost 자동 검증 레벨 2 (naverpost 전용 — 전체 확장 금지)
# 완료 직전(Stop) 안전 검증: 감지 경로의 "소스 코드" 변경이 있을 때만 type-check + test 실행.
# docs-only/변경 없음 → 건너뜀. 실패 시 완료 차단(soft block). 외부 API/AI CLI/네트워크 호출 없음.
# build는 무거워 자동화 제외(수동 검증 항목). 읽기/로컬 실행만.

input=$(cat)

# 무한 루프 방지 (차단 후 재완료 시 재실행 안 함)
echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

# 검증 트리거: 소스/매니페스트/tsconfig 변경(문서·.claude·빌드산출물 제외)
PATHS_RE='^(src|app|pages|components|lib|services|api|server|client|db|styles|backend|frontend|tests|tools)/|(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|tsconfig\.json)$'
EXCLUDE_RE='(^|/)(node_modules|\.git|\.claude|dist|build|out|\.next|coverage|venv|\.venv)/'
changed=$( { git status --porcelain 2>/dev/null | grep -vE '^\?\?' | awk '{print $NF}';
             git ls-files --others --exclude-standard 2>/dev/null; } \
           | grep -E "$PATHS_RE" | grep -vE "$EXCLUDE_RE" | sort -u )

# 소스 변경 없음(docs-only 등) → 자동 검증 불필요, 통과
[ -z "$changed" ] && exit 0

# 1) type-check (tsc --noEmit). .next 자동생성물 노이즈는 무시하고 src/ 에러만 게이트.
tc_out=$(npm run type-check 2>&1)
src_errs=$(printf '%s\n' "$tc_out" | grep -E "error TS" | grep -cE "(^|/)src/")

# 2) test (vitest run, 오프라인)
ts_out=$(npm test 2>&1)
ts_rc=$?

if [ "${src_errs:-0}" -gt 0 ] || [ "$ts_rc" -ne 0 ]; then
  tc_sum=$(printf '%s\n' "$tc_out" | grep -E "error TS" | grep -E "(^|/)src/" | head -3 | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-300)
  ts_sum=$(printf '%s\n' "$ts_out" | grep -E "Tests |Test Files|FAIL|failed" | head -3 | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-200)
  printf '{"decision":"block","reason":"naverpost 자동검증 레벨2 실패 — 완료 불가. src 타입에러=%s, test exit=%s. [type] %s [test] %s. 기능 코드를 고쳐 통과시키고, docs/ai/HARNESS_RESULTS.md에 결과(Change-Fingerprint 아래 Gate Result)를 기록한 뒤 다시 완료하세요. (build는 자동검증 제외 — 수동 확인)"}' "${src_errs:-0}" "$ts_rc" "${tc_sum:-none}" "${ts_sum:-?}"
  exit 0
fi

# 통과 → 조용히 통과(완료 보고 시 HARNESS_RESULTS에 자동검증 PASS 기록은 메인 작업자 책임)
exit 0
