@echo off
setlocal
set "CANDIDATE=%~dp0MODIFIED_FILE\win-unpacked\Enlumor-Surfing-Candidate.exe"
set "ISOLATED=%~dp0user-data"
if not exist "%CANDIDATE%" exit /b 2
if "%~1"=="--check" (
  echo CANDIDATE_LAUNCHER_CHECK: PASS
  echo Candidate=%CANDIDATE%
  echo IsolatedUserData=%ISOLATED%
  exit /b 0
)
"%CANDIDATE%" "--user-data-dir=%ISOLATED%"
