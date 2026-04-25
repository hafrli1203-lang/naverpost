# 바탕화면에 Naverpost 바로가기 1개 만들기
# 사용: pnpm shortcut

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$iconPath    = Join-Path $projectRoot "public\app.ico"
$cmdPath     = Join-Path $projectRoot "scripts\run-naverpost.cmd"
$desktop     = [Environment]::GetFolderPath("Desktop")

if (-not (Test-Path $iconPath)) {
    Write-Error "Icon not found at $iconPath. Run 'pnpm build:icon' first."
    exit 1
}

$shell = New-Object -ComObject WScript.Shell

# Remove legacy two-shortcut layout if present.
$legacyStart = Join-Path $desktop "Naverpost Start.lnk"
if (Test-Path $legacyStart) { Remove-Item $legacyStart -Force }

$lnk = Join-Path $desktop "Naverpost.lnk"
$sc  = $shell.CreateShortcut($lnk)
$sc.TargetPath       = $cmdPath
$sc.WorkingDirectory = $projectRoot
$sc.IconLocation     = "$iconPath,0"
$sc.WindowStyle      = 7  # 7 = minimized (don't flash a black cmd window)
$sc.Description      = "Naverpost — start dev server (if needed) and open browser"
$sc.Save()

Write-Host "Done."
Write-Host "  $lnk"
Write-Host ""
Write-Host "Double-click the desktop icon. It will:"
Write-Host "  1. Start 'pnpm dev' if the port is free, OR skip if already running"
Write-Host "  2. Wait until http://localhost:3100 is listening (up to 30s)"
Write-Host "  3. Open the dashboard in your default browser"
