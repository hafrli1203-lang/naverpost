@echo off
REM Naverpost launcher — start dev server (if needed) and open browser.

cd /d "%~dp0\.."

REM If port 3100 is already listening, just open the browser.
netstat -ano | findstr ":3100 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    start http://localhost:3100
    exit /b
)

REM Otherwise start the dev server in a new minimized cmd window.
start "Naverpost server" /min cmd /c "pnpm dev"

REM Wait until the server starts listening (max ~30s).
set /a tries=0
:wait_loop
set /a tries+=1
if %tries% gtr 30 goto open_anyway
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":3100 " | findstr "LISTENING" >nul
if errorlevel 1 goto wait_loop

:open_anyway
start http://localhost:3100
exit /b
