@echo off
setlocal
cd /d "%~dp0"
set "CANDIDATE=%~dp0.cache\editing-production-package\win-unpacked\Enlumor.exe"
set "PROFILE=%~dp0.cache\editing-production-userdata"
if not exist "%CANDIDATE%" (
  echo Editing production candidate has not been built.
  exit /b 1
)
"%CANDIDATE%" --editing-preview "--user-data-dir=%PROFILE%"
exit /b %errorlevel%
