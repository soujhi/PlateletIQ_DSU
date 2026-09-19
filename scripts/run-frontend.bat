@echo off
title PlateletIQ frontend
cd /d "%~dp0..\frontend"
echo Starting the PlateletIQ UI on http://localhost:5173
echo Leave this window open. Press Ctrl+C to stop.
echo.
REM --strictPort matters: if something else already holds 5173, Vite would
REM otherwise move quietly to 5174 and leave the stale server answering the
REM address you actually open. Fail loudly instead.
call npm run dev -- --port 5173 --strictPort
echo.
echo The frontend stopped.
pause
