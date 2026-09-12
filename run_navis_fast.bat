@echo off
title NAVIS Blazing Fast Launcher (Production Build)
echo ========================================================
echo       NAVIS // ULTRA-FAST LAUNCHER (OPTIMIZED FOR MOBILE)
echo ========================================================
echo 0. Freeing port 8000 and port 5173 if already in use...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

echo.
echo 1. Building optimized frontend bundle (Takes ~8s once)...
cd /d "%~dp0frontend"
call npm run build

echo.
echo 2. Starting FastAPI Backend on 0.0.0.0:8000...
cd /d "%~dp0"
start "NAVIS Backend" cmd /k "python -m uvicorn server.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload"

echo.
echo 3. Starting Optimized Frontend Server on 0.0.0.0:5173...
cd /d "%~dp0frontend"
start "NAVIS Fast Frontend" cmd /k "npx vite preview --host 0.0.0.0 --port 5173"

for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "CURRENT_IP=%%a"
if "%CURRENT_IP%"=="" set "CURRENT_IP=localhost"

echo.
echo ========================================================
echo NAVIS is now running at maximum speed!
echo - Phone URL (Make sure phone is on the same Wi-Fi / Hotspot):
echo   http://%CURRENT_IP%:5173
echo.
echo - PC URL:
echo   http://localhost:5173
echo ========================================================
echo.
pause
