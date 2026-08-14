@echo off
title SENTINEL Frontend Console
color 0A
cd /d %~dp0
echo Starting ARGUS React Frontend (Landing: http://localhost:5173 / Console: http://localhost:5173/app) ...
npm run dev
pause
