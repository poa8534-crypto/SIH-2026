@echo off
title NAVIS Blazing Fast Launcher (Production Build)
echo ========================================================
echo       NAVIS // ULTRA-FAST LAUNCHER (OPTIMIZED FOR MOBILE)
echo ========================================================
echo.
echo 1. Building optimized frontend bundle (Takes ~8s once)...
cd /d "%~dp0frontend"
call npm run build

echo.
echo 2. Starting FastAPI Backend on 0.0.0.0:8000...
cd /d "%~dp0"
start "NAVIS Backend" cmd /k "python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload"

echo.
echo 3. Starting Optimized Frontend Server on 0.0.0.0:5173...
cd /d "%~dp0frontend"
start "NAVIS Fast Frontend" cmd /k "npx vite preview --host 0.0.0.0 --port 5173"

echo.
echo ========================================================
echo NAVIS is now running at maximum speed!
echo - Phone URL (Make sure phone is on Wi-Fi 'Kevin_5G'):
echo   http://192.168.0.106:5173
echo.
echo - PC URL:
echo   http://localhost:5173
echo ========================================================
echo.
pause
