param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\migration-input\supabase-public-data.sql'),
  [string]$ConnectionTemplate = 'postgresql://postgres.hpzdccfrouhljqlzczuv:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
)

$ErrorActionPreference = 'Stop'

$pgDumpCommand = Get-Command pg_dump -ErrorAction SilentlyContinue
$pgDumpPath = if ($pgDumpCommand) {
  $pgDumpCommand.Source
} else {
  'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
}

if (-not (Test-Path -LiteralPath $pgDumpPath)) {
  throw 'PostgreSQL command-line tools are required. Install PostgreSQL 17 client tools, reopen the terminal, then run this script again.'
}

if (Test-Path -LiteralPath $OutputPath) {
  throw "Refusing to overwrite existing export: $OutputPath"
}

if (-not $ConnectionTemplate.Contains('[YOUR-PASSWORD]')) {
  throw 'The connection template must contain the [YOUR-PASSWORD] placeholder.'
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$securePassword = Read-Host 'Enter the new Supabase database password (input is hidden)' -AsSecureString
$passwordPointer = [IntPtr]::Zero

try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw 'A database password is required.'
  }

  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $sourceConnection = $ConnectionTemplate.Replace('[YOUR-PASSWORD]', $encodedPassword)

  & $pgDumpPath `
    --dbname=$sourceConnection `
    --schema public `
    --data-only `
    --inserts `
    --rows-per-insert=500 `
    --no-owner `
    --no-privileges `
    --file $OutputPath

  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL data export failed with exit code $LASTEXITCODE."
  }
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $plainPassword = $null
  $encodedPassword = $null
  $sourceConnection = $null
  $securePassword = $null
  Remove-Variable sourceConnection -ErrorAction SilentlyContinue
}

Write-Host "Export created: $OutputPath"
