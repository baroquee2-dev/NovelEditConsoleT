@echo off
setlocal EnableExtensions
title NovelEditConsoleT

cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot enter project folder:
  echo %~dp0
  pause
  exit /b 1
)

echo ========================================
echo  NovelEditConsoleT
echo  %CD%
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found.
  pause
  exit /b 1
)

if exist ".git\" (
  where git >nul 2>&1
  if not errorlevel 1 (
    echo [UPDATE] git pull --ff-only
    git pull --ff-only
    if errorlevel 1 (
      echo [WARN] git pull failed. Continue with local files.
    ) else (
      echo [OK] Code sync done.
    )
    echo.
  )
) else (
  echo [INFO] Not a git repo. Skip git pull.
  echo.
)

echo [UPDATE] npm install
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)
echo.

echo [START] npm run tauri dev
echo Close this window to stop the app.
echo.
call npm run tauri dev
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [EXIT] Failed. Code: %EXITCODE%
  pause
  exit /b %EXITCODE%
)

echo [EXIT] Closed.
pause
exit /b 0
