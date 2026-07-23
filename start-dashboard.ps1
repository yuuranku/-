$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$url = 'http://127.0.0.1:4173/'
$logFile = Join-Path $env:TEMP 'orbital-globe-dashboard.log'

function Test-DashboardReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  }
  catch {
    return $false
  }
}

if (Test-DashboardReady) {
  Start-Process $url
  exit 0
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js was not found. The dashboard cannot start.' -ForegroundColor Red
  Write-Host 'Install Node.js LTS and run this launcher again.'
  exit 1
}

Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'First run: installing project dependencies...' -ForegroundColor Cyan
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Dependency installation failed.' -ForegroundColor Red
    exit 1
  }
}

Write-Host 'Starting the globe dashboard...' -ForegroundColor Cyan

$command = 'npm.cmd run dev -- --host 127.0.0.1 --port 4173 1> "' + $logFile + '" 2>&1'
Start-Process `
  -FilePath $env:ComSpec `
  -ArgumentList @('/d', '/c', $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden | Out-Null

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (Test-DashboardReady) {
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 350
}

Write-Host 'The server did not become ready in time. Log file:' -ForegroundColor Red
Write-Host $logFile
exit 1
