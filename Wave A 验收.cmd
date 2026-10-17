@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0.cache\v04-wave-a-package\win-unpacked\Enlumor.exe" (
  echo Candidate build not found.
  pause
  exit /b 1
)
start "" "%~dp0.cache\v04-wave-a-package\win-unpacked\Enlumor.exe" "--user-data-dir=%~dp0.cache\wave-a-live-userdata"
