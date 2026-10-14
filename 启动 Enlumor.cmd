@echo off
set "ENLUMOR_PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "%ENLUMOR_PYTHON%" (
  echo Run setup.ps1 first.
  pause
  exit /b 1
)
start "" "%~dp0release\Enlumor 0.1.0.exe"
