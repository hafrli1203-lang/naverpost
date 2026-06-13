# BlogOps 주간 운영: 기발행 글 백필 → 키워드 노출 순위 측정 → 로그 저장.
#
# 전제: naverpost 서버(:3100)가 떠 있어야 함 (start.bat). BlogOps API(:8002)는 이 스크립트가 기동.
#
# Windows 작업 스케줄러 등록 (관리자 PowerShell에서 1회 실행):
#   schtasks /Create /TN "naverpost-blogops-weekly" `
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\project\naverpost\scripts\blogops-weekly.ps1" `
#     /SC WEEKLY /D MON /ST 09:30
# 해제: schtasks /Delete /TN "naverpost-blogops-weekly" /F

$ErrorActionPreference = "Continue"
$logFile = "C:\project\naverpost\data\blogops-weekly.log"
function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Output $line
  Add-Content -Path $logFile -Value $line
}

Log "=== weekly run start ==="

# 1. BlogOps API 기동 확인
$blogops = Test-NetConnection -ComputerName localhost -Port 8002 -WarningAction SilentlyContinue
if (-not $blogops.TcpTestSucceeded) {
  Log "BlogOps API not running - starting"
  Start-Process -FilePath "C:\project\naverpost\scripts\start-blogops.bat" -WindowStyle Hidden
  Start-Sleep -Seconds 12
}

# 2. naverpost 서버 확인 (측정 라우트가 여기 있음)
$naverpost = Test-NetConnection -ComputerName localhost -Port 3100 -WarningAction SilentlyContinue
if (-not $naverpost.TcpTestSucceeded) {
  Log "ERROR: naverpost(:3100) not running - start.bat 실행 후 다시 시도하세요"
  exit 1
}

# 3. 백필 (신규 발행 글 등록 - 멱등)
try {
  $bf = Invoke-RestMethod -Method Post -Uri "http://localhost:3100/api/blogops/backfill" `
    -ContentType "application/json" -Body "{}" -TimeoutSec 120
  foreach ($r in $bf.data) { Log ("backfill {0}: found={1} registered={2} {3}" -f $r.shopId, $r.found, $r.registered, $r.reason) }
} catch {
  Log ("backfill FAILED: {0}" -f $_.Exception.Message)
}

# 4. 노출 순위 측정
try {
  $ex = Invoke-RestMethod -Method Post -Uri "http://localhost:3100/api/blogops/exposure" `
    -ContentType "application/json" -Body "{}" -TimeoutSec 180
  foreach ($r in $ex.data) { Log ("exposure {0}: measured={1} ranked={2} {3}" -f $r.shopId, $r.measured, $r.ranked, $r.reason) }
} catch {
  Log ("exposure FAILED: {0}" -f $_.Exception.Message)
}

Log "=== weekly run done ==="
