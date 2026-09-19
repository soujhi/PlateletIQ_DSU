@echo off
title PlateletIQ backend
cd /d "%~dp0..\backend"
echo Starting the PlateletIQ API on http://127.0.0.1:8000
echo Leave this window open. Press Ctrl+C to stop.
echo.
".venv\Scripts\python.exe" -m uvicorn main:app --port 8000
echo.
echo The backend stopped.
pause
