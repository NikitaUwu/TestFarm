$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envFile) { Write-Output '.env already exists; preserved.'; exit 0 }
function New-FarmSecret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToHexString($bytes).ToLowerInvariant()
}
$entries = @{
  POSTGRES_PASSWORD = New-FarmSecret
  S3_ACCESS_KEY = 'farm-local'
  S3_SECRET_KEY = New-FarmSecret
  OWNER_PASSWORD = New-FarmSecret
  REVIEWER_PASSWORD = New-FarmSecret
  SESSION_SECRET = New-FarmSecret
  RUNNER_TOKEN = New-FarmSecret
  GROQ_API_KEY = ''
  GROQ_MODEL = 'openai/gpt-oss-20b'
  STT_PROVIDER = 'groq'
  STT_MODEL = 'whisper-large-v3-turbo'
}
$lines = $entries.GetEnumerator() | Sort-Object Name | ForEach-Object { $_.Key + '=' + $_.Value }
[IO.File]::WriteAllLines($envFile, $lines, [Text.UTF8Encoding]::new($false))
Write-Output 'Created local .env with random credentials. Secrets were not printed.'

