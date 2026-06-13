@echo off
rem Start BlogOps performance API on :8002 (skip if already running).
rem Port 8001 is taken by another app, so 8002 is used to match
rem BLOGOPS_API_URL in naverpost .env.local.

netstat -ano | findstr ":8002" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo BlogOps API already running on :8002
  goto :eof
)

echo Starting BlogOps API on :8002 ...
cd /d C:\project\blogoperator
start "blogops-api" /min cmd /c "uv --directory apps/api run uvicorn blogops_api.main:app --app-dir src --port 8002 >> .blogops-api-8002.log 2>&1"
cd /d C:\project\naverpost
echo Started. Log: C:\project\blogoperator\.blogops-api-8002.log
