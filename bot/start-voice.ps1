$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workerScript = Join-Path $PSScriptRoot 'voice-worker.js'
$logFolder = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
$nodeBinary = (Get-Command node -ErrorAction Stop).Source
Start-Process -FilePath $nodeBinary -ArgumentList ('"' + $workerScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logFolder 'voice-worker.log') -RedirectStandardError (Join-Path $logFolder 'voice-worker-error.log')
Write-Host '已啟動語音 Bot。請到網站管理後台 → 語音統計確認連線，或查看 .local/voice-worker-error.log。'
