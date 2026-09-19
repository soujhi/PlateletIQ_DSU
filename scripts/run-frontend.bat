@echo off
title PlateletIQ frontend
cd /d "%~dp0..\frontend"
echo Starting the PlateletIQ UI on http://localhost:5173
echo Leave this window open. Press Ctrl+C to stop.
echo.
call npm run dev
echo.
echo The frontend stopped.
pause
