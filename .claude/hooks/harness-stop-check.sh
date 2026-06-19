#!/usr/bin/env bash
# 변경 단위(fingerprint) 하네스 Stop 훅 (공통 v2 — detailpage/naver-sa 검증본 + untracked 보강)
# tracked 변경(git diff)뿐 아니라 감지 경로의 untracked 파일 내용 변경까지 지문에 반영한다.
# 감지 경로에 변경이 있으면, "현재 변경 묶음 지문(Change-Fingerprint)"이
# docs/ai/HARNESS_RESULTS.md에 게이트 결과와 함께 기록돼 있어야 통과한다.
# 읽기 전용(git status/diff/ls-files + grep/sha256sum)만 사용. 빌드/lint/설치/파일 수정 없음.
# 민감/대용량/빌드 산출물은 절대 읽거나 해시하지 않는다.

input=$(cat)

# 무한 루프 방지
echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

# 프로젝트 루트로 이동
cd "$(dirname "$0")/../.." 2>/dev/null || exit 0
HR="docs/ai/HARNESS_RESULTS.md"

PATHS_RE='^(src|app|pages|components|lib|services|api|server|client|db|styles|backend|frontend|tests|tools)/|(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|requirements\.txt|pyproject\.toml)$'
PATHSPECS='src app pages components lib services api server client db styles backend frontend tests tools package.json pnpm-lock.yaml yarn.lock package-lock.json requirements.txt pyproject.toml'
# 절대 읽거나 해시하지 않을 민감/대용량/빌드 경로
EXCLUDE_RE='(^|/)\.env($|\.)|(^|/)(secrets?|credentials?)(/|$)|\.(key|pem|p12|pfx)$|(^|/)(node_modules|\.git|\.claude|dist|build|out|\.next|coverage|venv|\.venv)/'
MAX_BYTES=1048576

# 1) tracked 감지 변경 (수정/스테이지; untracked '??' 제외)
tracked=$(git status --porcelain 2>/dev/null | grep -vE '^\?\?' | awk '{print $NF}' | grep -E "$PATHS_RE" | sort)
# 2) untracked 감지 경로 개별 파일 (디렉토리가 아닌 파일 단위로 열거)
untracked=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E "$PATHS_RE" | grep -vE "$EXCLUDE_RE" | sort)

# 감지 대상 변경 없음 → 통과
[ -z "$tracked" ] && [ -z "$untracked" ] && exit 0

# 3) untracked 파일별 (경로 + 내용 sha256). 대용량/읽기불가는 내용 미열람, 마커만.
untracked_hashes=$(
  printf '%s\n' "$untracked" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
    if [ -z "$sz" ]; then echo "U $f unreadable-미검증"; continue; fi
    if [ "$sz" -gt "$MAX_BYTES" ]; then
      echo "U $f size=$sz large-untracked-미검증"
    else
      echo "U $f $(sha256sum "$f" 2>/dev/null | awk '{print $1}')"
    fi
  done
)

# 4) 현재 변경 묶음 지문 = (tracked 목록 + tracked diff + untracked 경로/해시) 의 sha256 앞 16자
fp=$( { printf '%s\n' "$tracked";
        echo '---DIFF---';
        git diff 2>/dev/null -- $PATHSPECS;
        git diff --cached 2>/dev/null -- $PATHSPECS;
        echo '---UNTRACKED---';
        printf '%s\n' "$untracked_hashes"; } \
      | sha256sum | awk '{print $1}' | cut -c1-16)

# 5) HARNESS_RESULTS 안에 현재 지문 + 같은 블록(8줄 내)에 게이트 키워드가 있으면 통과
if [ -f "$HR" ] && grep -qF "Change-Fingerprint: $fp" "$HR"; then
  if grep -A8 -F "Change-Fingerprint: $fp" "$HR" | grep -qE 'PASS|FAIL|P0|P1|P2|P3|미검증|판단 필요'; then
    exit 0
  fi
fi

# 6) 현재 지문 기록 없음 → 완료 차단(soft block). 기록해야 할 지문을 안내.
printf '{"decision":"block","reason":"하네스 미기록 차단(변경 단위 v2): 감지 경로의 tracked/untracked 변경이 있으나 현재 변경 묶음 지문이 docs/ai/HARNESS_RESULTS.md에 없습니다. 완료 전 docs/ai/HARNESS.md / QUALITY_GATES.md / METRICS.md 기준으로 검수하고, HARNESS_RESULTS.md에 [Change-Fingerprint: %s] 와 게이트 결과(PASS/FAIL/P0/P1/P2/P3/미검증/판단 필요 중 1개 이상)를 같은 블록에 기록하세요. 오늘 날짜만 있으면 통과되지 않습니다. (대용량/민감 파일은 내용 미열람 — 미검증 표시)"}' "$fp"
exit 0
