@echo off
REM ===========================================================================
REM  PlateletIQ launcher (Windows)
REM
REM  Sets up whatever is missing, then starts the backend, waits until it is
REM  actually answering, and only then starts the frontend. Order matters: the
REM  UI reads the API's configuration on load.
REM
REM  Double-click this file, or run  start.bat  from a Command Prompt.
REM ===========================================================================
setlocal
cd /d "%~dp0"

echo.
echo   PlateletIQ
echo   ==========
echo.

REM --- Find Python -----------------------------------------------------------
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY (
  where py >nul 2>&1 && set "PY=py"
)
if not defined PY goto no_python

REM --- Find Node -------------------------------------------------------------
where npm >nul 2>&1 || goto no_node

REM --- Backend environment ---------------------------------------------------
if not exist "backend\.venv\Scripts\python.exe" (
  echo [1/5] Creating the Python virtual environment...
  %PY% -m venv "backend\.venv"
  if errorlevel 1 goto venv_failed
) else (
  echo [1/5] Python virtual environment already present.
)

echo [2/5] Installing backend dependencies...
"backend\.venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "backend\requirements.txt"
if errorlevel 1 goto pip_failed

echo [3/5] Checking backend configuration...
"backend\.venv\Scripts\python.exe" "scripts\bootstrap_env.py"
if errorlevel 1 goto env_failed

REM --- Frontend dependencies -------------------------------------------------
if not exist "frontend\node_modules" (
  echo [4/5] Installing frontend dependencies. This takes a minute the first time...
  pushd frontend
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    popd
    goto npm_failed
  )
  popd
) else (
  echo [4/5] Frontend dependencies already installed.
)

REM --- Start the backend, then wait for it to answer -------------------------
echo [5/5] Starting the backend...
start "PlateletIQ backend" cmd /k "%~dp0scripts\run-backend.bat"

echo       Waiting for the API to come up...
set /a attempts=0
:wait_api
set /a attempts+=1
curl -s -o nul http://127.0.0.1:8000/api/v1/auth/config && goto api_ready
if %attempts% GEQ 90 goto api_timeout
timeout /t 1 /nobreak >nul
goto wait_api

:api_ready
echo       The API is up.

REM --- Start the frontend ----------------------------------------------------
echo       Starting the frontend...
start "PlateletIQ frontend" cmd /k "%~dp0scripts\run-frontend.bat"

echo       Waiting for the UI to come up...
set /a attempts=0
:wait_ui
set /a attempts+=1
curl -s -o nul http://127.0.0.1:5173/ && goto ui_ready
if %attempts% GEQ 90 goto ui_timeout
timeout /t 1 /nobreak >nul
goto wait_ui

:ui_ready
echo.
echo   Both services are running.
echo.
echo     UI       http://localhost:5173
echo     API      http://127.0.0.1:8000/api/v1/health
echo     API docs http://127.0.0.1:8000/docs
echo.
echo   Two hospitals on one machine: sign in here with one email and pick a
echo   facility, then open an incognito window at the same address, sign in
echo   with a different email, and pick another facility.
echo.
echo   Closing the two service windows stops everything.
echo.
start "" http://localhost:5173
goto done

REM --- Failure paths ---------------------------------------------------------
:no_python
echo ERROR: Python was not found on PATH.
echo Install it from https://www.python.org/downloads/ and tick
echo "Add python.exe to PATH" during setup, then run this again.
goto fail

:no_node
echo ERROR: Node.js (npm) was not found on PATH.
echo Install the LTS build from https://nodejs.org/ then run this again.
goto fail

:venv_failed
echo ERROR: Could not create the Python virtual environment in backend\.venv.
goto fail

:pip_failed
echo ERROR: Installing the backend dependencies failed. Scroll up for the reason.
goto fail

:env_failed
echo ERROR: Could not write backend\.env.
goto fail

:npm_failed
echo ERROR: npm install failed. Scroll up for the reason.
goto fail

:api_timeout
echo ERROR: This build's API did not answer within 90 seconds.
echo.
echo If the "PlateletIQ backend" window says the port is already in use, an
echo older server is still holding port 8000. Close it, or run:
echo     taskkill /F /IM python.exe
echo and start this again.
goto fail

:ui_timeout
echo ERROR: The frontend did not answer within 90 seconds.
echo Look at the "PlateletIQ frontend" window for the error.
goto fail

:fail
echo.
pause
exit /b 1

:done
pause
exit /b 0
