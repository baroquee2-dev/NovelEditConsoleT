@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Run from this script's directory (NovelEditConsoleT project root).
cd /d "%~dp0"

set "ROOT=%~dp0"
set "ROOT_EXE=%ROOT%NovelEditConsole.exe"
set "RELEASE_DIR=%ROOT%src-tauri\target\release"

if /i "%~1"=="rebuild" set "FORCE=1"

if exist "%ROOT_EXE%" if not defined FORCE (
  echo [build-release] %ROOT_EXE% already exists.
  echo Use: build-release.bat rebuild   to force a new build and copy.
  exit /b 0
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [build-release] ERROR: npm not found. Install Node.js and add it to PATH.
  exit /b 1
)

if not exist "%ROOT%node_modules\" (
  echo [build-release] Installing npm dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

echo [build-release] Building Tauri release ^(this may take several minutes^)...
call npm run tauri build
if errorlevel 1 (
  echo [build-release] ERROR: tauri build failed.
  exit /b 1
)

set "BUILD_EXE="
if exist "%RELEASE_DIR%\NovelEditConsole.exe" set "BUILD_EXE=%RELEASE_DIR%\NovelEditConsole.exe"
if not defined BUILD_EXE if exist "%RELEASE_DIR%\noveleditconsolet.exe" set "BUILD_EXE=%RELEASE_DIR%\noveleditconsolet.exe"

if not defined BUILD_EXE (
  echo [build-release] ERROR: Release exe not found under:
  echo   %RELEASE_DIR%
  echo Expected NovelEditConsole.exe or noveleditconsolet.exe
  exit /b 1
)

copy /Y "%BUILD_EXE%" "%ROOT_EXE%" >nul
if errorlevel 1 (
  echo [build-release] ERROR: Failed to copy exe to project root.
  exit /b 1
)

echo [build-release] Done.
echo   Source: %BUILD_EXE%
echo   Output: %ROOT_EXE%
exit /b 0
