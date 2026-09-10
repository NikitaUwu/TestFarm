$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$farmPython=Join-Path $projectRoot '.venv\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $farmPython)){
  $farmPython='C:\Users\nikit\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}
Push-Location (Join-Path $projectRoot 'backend')
try{ & $farmPython -m unittest discover -s tests -v; if($LASTEXITCODE -ne 0){throw 'Tests failed'} }finally{Pop-Location}
