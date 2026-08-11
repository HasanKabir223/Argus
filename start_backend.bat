@echo off
title SENTINEL AI Backend Server
color 0B
cd /d %~dp0
echo Starting FastAPI AI Backend on http://localhost:8000 ...
python backend/main.py
pause
