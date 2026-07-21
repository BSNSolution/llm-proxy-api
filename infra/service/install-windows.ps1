# Registra o llm-proxy-api como tarefa agendada do Windows (inicia no logon do usuário).
# Roda no contexto do usuário (precisa das CLIs + OAuth logados).
# Uso (PowerShell no diretório do projeto):
#   .\infra\service\install-windows.ps1

param(
  [string]$AppDir = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$NodePath = (Get-Command node).Source
)

$main = Join-Path $AppDir "apps\api\dist\main.js"
if (-not (Test-Path $main)) {
  Write-Error "Build nao encontrado em $main. Rode 'pnpm build' antes."
  exit 1
}

$action  = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$main`"" -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "LLM-Proxy-API" -Action $action -Trigger $trigger `
  -Settings $settings -Description "LLM Proxy API" -Force

Write-Host "Tarefa 'LLM-Proxy-API' registrada. Inicia no proximo logon."
Write-Host "Para iniciar agora: Start-ScheduledTask -TaskName 'LLM-Proxy-API'"
