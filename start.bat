@echo off
title 네이버 블로그 자동 작성
cd /d "C:\project\naverpost"
echo.
echo  ========================================
echo    네이버 블로그 자동 작성 시작 중...
echo  ========================================
echo.
echo  브라우저에서 http://localhost:3100 이 열립니다.
echo  이 창을 닫으면 서버가 종료됩니다.
echo.
rem 성과 측정(BlogOps) API도 함께 켠다. 이미 켜져 있으면 그대로 둔다.
call "C:\project\naverpost\scripts\start-blogops.bat"
start "" http://localhost:3100
npx next dev --port 3100
