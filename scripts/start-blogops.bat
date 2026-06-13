@echo off
rem BlogOps API(:8002) 기동. 이미 떠 있으면 그대로 둔다.
rem (8001은 다른 앱이 점유 중이라 8002를 사용 — naverpost .env.local BLOGOPS_API_URL과 일치)

netstat -ano | findstr ":8002" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo BlogOps API already running on :8002
  goto :eof
)

echo Starting BlogOps API on :8002 ...
cd /d C:\project\blogoperator
start "blogops-api" /min cmd /c "uv --directory apps/api run uvicorn blogops_api.main:app --app-dir src --port 8002 >> .blogops-api-8002.log 2>&1"
echo Started. Log: C:\project\blogoperator\.blogops-api-8002.log
