@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem Real-model benchmark: a fixed paper with its checks in a QR code, your own service and key.
if not exist ".venv\Scripts\python.exe" (
  echo 未找到开发环境，请先运行 setup.ps1。
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install -q -r requirements-acceptance.txt

rem Prefer "Attention Is All You Need" from Downloads; otherwise use the built-in test paper.
set "PAPER="
for %%f in ("%USERPROFILE%\Downloads\*attention*.pdf" "%USERPROFILE%\Downloads\1706.03762*.pdf") do if not defined PAPER set "PAPER=%%~ff"
if defined PAPER (
  echo 使用论文：%PAPER%
  set "ENLUMOR_ACCEPTANCE_PDF=%PAPER%"
  set "ENLUMOR_ACCEPTANCE_MANIFEST=%~dp0tests\acceptance\attention-benchmark.json"
) else (
  echo 下载文件夹里没有找到 Attention Is All You Need，改用内置测试论文。
)
echo.
set /p "ENLUMOR_ACCEPTANCE_ENDPOINT=接口地址（例如 https://api.openai.com/v1）: "
set /p "ENLUMOR_ACCEPTANCE_MODEL=模型 ID（直接回车 = 自动选择）: "
for /f "usebackq delims=" %%k in (`powershell -NoProfile -Command "$s=Read-Host 'API 密钥（输入时不显示）' -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"`) do set "ENLUMOR_ACCEPTANCE_KEY=%%k"

call npm run acceptance
set "ENLUMOR_ACCEPTANCE_KEY="

for /f "delims=" %%d in ('dir /b /ad /o-d ".cache\acceptance" 2^>nul') do (
  if exist ".cache\acceptance\%%d\report.html" (
    start "" ".cache\acceptance\%%d\report.html"
    goto :opened
  )
)
:opened
pause
