param([Parameter(Mandatory=$true)][string]$IdeaId,[Parameter(Mandatory=$true)][string]$AudioPath)
$ErrorActionPreference='Stop'
$farmRoot=Split-Path -Parent $PSScriptRoot
$farmPassword=(Get-Content (Join-Path $farmRoot '.env') | Where-Object {$_ -match '^REVIEWER_PASSWORD='}).Substring(18)
$farmClient=[Net.Http.HttpClient]::new()
try {
  $farmLogin=[Net.Http.StringContent]::new((@{identifier='demo';password=$farmPassword}|ConvertTo-Json),[Text.Encoding]::UTF8,'application/json')
  $farmPassword=$null
  $farmResponse=$farmClient.PostAsync('http://localhost:8000/auth/login',$farmLogin).GetAwaiter().GetResult()
  $farmResponse.EnsureSuccessStatusCode() | Out-Null
  $farmLogin.Dispose()
  $farmForm=[Net.Http.MultipartFormDataContent]::new()
  $farmContent=[Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $AudioPath)))
  $farmContent.Headers.ContentType=[Net.Http.Headers.MediaTypeHeaderValue]::new('audio/wav')
  $farmForm.Add($farmContent,'file','russian-stt.wav')
  $farmClient.DefaultRequestHeaders.Add('X-Farm-Request','1')
  $farmResponse=$farmClient.PostAsync("http://localhost:8000/ideas/$IdeaId/audio",$farmForm).GetAwaiter().GetResult()
  $farmResponse.EnsureSuccessStatusCode() | Out-Null
  $farmResult=$farmResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  $farmResult | ConvertTo-Json -Depth 5
  $farmForm.Dispose()
} finally { $farmClient.Dispose() }
