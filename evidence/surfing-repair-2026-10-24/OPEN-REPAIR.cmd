@echo off
setlocal
set "APP=%~dp0MODIFIED_FILE\win-unpacked\Enlumor-Surfing-Repair.exe"
if not exist "%APP%" exit /b 2
if "%~1"=="--check" (
 echo REPAIR_LAUNCHER_CHECK: PASS
 exit /b 0
)
"%APP%" "--user-data-dir=%~dp0user-data"
