@echo off
title ARGUS Frontend Console
color 09
cd /d %~dp0
echo Starting ARGUS React Frontend (Landing: http://localhost:5173 / Console: http://localhost:5173/app) ...
npm run dev
pause
