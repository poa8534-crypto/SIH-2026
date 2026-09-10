@echo off
title NAVIS AI Launcher
echo ========================================================
echo           NAVIS // AI-DRIVEN EPC PROGRESS ENGINE
echo ========================================================
echo.
echo Starting FastAPI Backend (Port 8000)...
start "NAVIS Backend (FastAPI)" cmd /k "python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Vite Frontend (Port 5173)...
start "NAVIS Frontend (Vite/React)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================================
echo Both servers are launching in separate windows!
echo - PC Browser:     http://localhost:5173
echo - Phone on Wi-Fi: http://192.168.0.106:5173
echo - Backend API:    http://192.168.0.106:8000/docs
echo ========================================================
echo.
pause
