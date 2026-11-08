$ErrorActionPreference = 'Stop'
# Saves the real-model benchmark settings as user environment variables so Claude can run the benchmark.
# The key is stored only in your Windows user environment; nothing is written into the repository.
Write-Host '真实模型验收设置（随时可重新运行覆盖）' -ForegroundColor Cyan
$endpoint = Read-Host '接口地址（例如 https://api.openai.com/v1 或 https://api.deepseek.com/v1）'
$model = Read-Host '模型 ID（直接回车 = 自动选择）'
$protocol = Read-Host '协议（直接回车 = 按地址自动判断；可填 openai-chat / anthropic-messages / gemini）'
$secure = Read-Host 'API 密钥（输入时不显示）' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $endpoint.Trim() -or -not $key.Trim()) { throw '接口地址和密钥都不能为空。' }
[Environment]::SetEnvironmentVariable('ENLUMOR_ACCEPTANCE_ENDPOINT', $endpoint.Trim(), 'User')
[Environment]::SetEnvironmentVariable('ENLUMOR_ACCEPTANCE_MODEL', $model.Trim(), 'User')
[Environment]::SetEnvironmentVariable('ENLUMOR_ACCEPTANCE_PROTOCOL', $protocol.Trim(), 'User')
[Environment]::SetEnvironmentVariable('ENLUMOR_ACCEPTANCE_KEY', $key.Trim(), 'User')
Write-Host '已保存。现在可以运行 scripts/acceptance/run-acceptance.ps1。' -ForegroundColor Green
Read-Host '按回车关闭'
