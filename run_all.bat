@echo off
title SENTINEL Mini-Gotham Launcher
color 0A

echo ======================================================================
echo           SENTINEL - CHECKPOINT AI FACE MATCHING SYSTEM
echo                 Starting AI Backend & Operations Console...
echo ======================================================================
echo.

:: 1. Start Python FastAPI Backend Server in a new window
echo [1/3] Launching FastAPI AI Backend on http://localhost:8000 ...
start "SENTINEL AI Backend Server (Port 8000)" cmd /k "cd /d %~dp0 && python backend/main.py"

:: 2. Wait 2 seconds for backend to initialize SQLite and FAISS
timeout /t 2 /nobreak >nul

:: 3. Start React Vite Frontend Dashboard in a new window
echo [2/3] Launching React Operations Console on http://localhost:5173 ...
start "SENTINEL Frontend Console (Port 5173)" cmd /k "cd /d %~dp0 && npm run dev"

:: 4. Wait 2 seconds and open Brave browser (or fallback to default)
timeout /t 2 /nobreak >nul
echo [3/3] Opening ARGUS Landing Page in Brave browser...
if exist "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5173/
) else if exist "C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5173/
) else (
    start http://localhost:5173/
)

echo.
echo ======================================================================
echo   ALL SERVICES ARE NOW RUNNING!
echo   - Landing Page (Start): http://localhost:5173/
echo   - Operations Console:   http://localhost:5173/app
echo   - Backend API Docs:     http://localhost:8000/docs
echo   - Watchlist & CCTV:     Active
echo ======================================================================
echo.
pause
