@echo off
title SENTINEL AI Backend Server
color 0B
cd /d %~dp0
echo Starting FastAPI AI Backend on http://localhost:8000 ...
py -3.10 backend/main.py 2>nul || py backend/main.py 2>nul || python backend/main.py
pause
