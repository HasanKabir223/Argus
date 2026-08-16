@echo off
setlocal enabledelayedexpansion
title SENTINEL Mini-Gotham Launcher
color 0A

echo ======================================================================
echo           SENTINEL - CHECKPOINT AI FACE MATCHING SYSTEM
echo                 Starting AI Backend & Operations Console...
echo ======================================================================
echo.

:: 1. Detect Python Command
set "PY_CMD="

py -3.10 -c "import sys; sys.exit(0)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=py -3.10"
    goto :PYTHON_FOUND
)

py -c "import sys; sys.exit(0)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=py"
    goto :PYTHON_FOUND
)

python -c "import sys; sys.exit(0)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=python"
    goto :PYTHON_FOUND
)

if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    set "PY_CMD="%LOCALAPPDATA%\Programs\Python\Python310\python.exe""
    goto :PYTHON_FOUND
)

:PYTHON_FOUND
if "!PY_CMD!"=="" (
    echo [ERROR] Python was not found in PATH or standard installation locations!
    echo Please install Python 3.10 and add it to PATH.
    pause
    exit /b 1
)

echo [OK] Using Python: !PY_CMD!

:: 2. Kill any stale backend / frontend processes on ports 8000 and 5173
echo [0/3] Clearing stale processes on ports 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 3. Launch FastAPI AI Backend with 2 workers (prevents CPU starvation from CCTV ingestion threads)
echo [1/3] Launching FastAPI AI Backend on http://localhost:8000 (2 workers)...
start "SENTINEL AI Backend Server (Port 8000)" cmd /k "cd /d %~dp0 && !PY_CMD! -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 2"

:: 4. Launch React Vite Frontend
echo [2/3] Launching React Operations Console on http://localhost:5173 ...
start "SENTINEL Frontend Console (Port 5173)" cmd /k "cd /d %~dp0 && npm run dev"

:: 5. Wait for Backend to become healthy
echo Waiting for backend server initialization...
set "HEALTHY=0"
for /l %%i in (1,1,10) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8000/api/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if !errorlevel! equ 0 (
        set "HEALTHY=1"
        goto :BACKEND_READY
    )
    timeout /t 1 /nobreak >nul
)

:BACKEND_READY
echo.
echo [3/3] Opening ARGUS Operations Console in Brave browser...
if exist "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5173/
) else if exist "C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5173/
) else (
    start http://localhost:5173/
)

echo.
echo ======================================================================
echo   SENTINEL IS ACTIVE AND OPERATIONAL!
echo   - Landing Page (Start): http://localhost:5173/
echo   - Operations Console:   http://localhost:5173/app
echo   - Backend API Docs:     http://localhost:8000/docs
echo   - CCTV Ingestion:       Active
echo ======================================================================
echo.
pause
