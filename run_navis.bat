@echo off
title NAVIS AI Launcher
echo ========================================================
echo           NAVIS // AI-DRIVEN EPC PROGRESS ENGINE
echo ========================================================
echo.
echo Starting FastAPI Backend (Port 8000)...
start "NAVIS Backend (FastAPI)" cmd /k "python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Vite Frontend (Port 5173)...
start "NAVIS Frontend (Vite/React)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================================
echo Both servers are launching in separate windows!
echo - Backend Swagger API: http://127.0.0.1:8000/docs
echo - Frontend Dashboard:   http://localhost:5173
echo ========================================================
echo.
pause
