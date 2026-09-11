@echo off
title NAVIS AI Launcher
echo ========================================================
echo           NAVIS // AI-DRIVEN EPC PROGRESS ENGINE
echo ========================================================
echo Freeing port 8000 and port 5173 if already in use...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

echo Starting FastAPI Backend (Port 8000)...
start "NAVIS Backend (FastAPI)" cmd /k "python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Vite Frontend (Port 5173)...
start "NAVIS Frontend (Vite/React)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "CURRENT_IP=%%a"
if "%CURRENT_IP%"=="" set "CURRENT_IP=localhost"

echo.
echo ========================================================
echo Both servers are launching in separate windows!
echo - PC Browser:     http://localhost:5173
echo - Phone on Wi-Fi: http://%CURRENT_IP%:5173
echo - Backend API:    http://%CURRENT_IP%:8000/docs
echo ========================================================
echo.
pause
