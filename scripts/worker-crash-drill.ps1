$ErrorActionPreference='Stop'
$farmRoot=Split-Path -Parent $PSScriptRoot
Push-Location $farmRoot
try {
    $farmInfo=Get-Content backend/tests/prepare_worker_crash.py -Raw | docker compose exec -T api python - | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $farmInfo.run_id) {throw 'Test run not created'}
    $farmRunningCode="import sqlite3,json; c=sqlite3.connect('/state/runner.sqlite'); print(json.dumps([r[0] for r in c.execute('SELECT id FROM requests WHERE state=?',('running',))]))"
    $farmDeadline=(Get-Date).AddSeconds(90)
    $farmActive=@()
    while ((Get-Date) -lt $farmDeadline) {
        $farmActive=@(docker compose exec -T runner python -c $farmRunningCode | ConvertFrom-Json)
        if ($farmActive.Count -gt 0) {break}
        Start-Sleep -Milliseconds 200
    }
    if ($farmActive.Count -eq 0) {throw 'No active Runner request observed; Worker was not killed'}
    $farmCheckCode="import os; from farm.db import connection; c=connection(); d=c.__enter__(); assert d.execute('SELECT 1 FROM experiment_runs WHERE id=%s AND run_id=%s',(os.environ['TEST_REQUEST_ID'].split(':')[0],os.environ['TEST_RUN_ID'])).fetchone()"
    docker compose exec -T -e "TEST_REQUEST_ID=$($farmActive[0])" -e "TEST_RUN_ID=$($farmInfo.run_id)" api python -c $farmCheckCode
    if ($LASTEXITCODE -ne 0) {throw 'Active request does not belong to test run'}
    docker compose kill -s SIGKILL worker
    $farmAfter=@(docker compose exec -T runner python -c $farmRunningCode | ConvertFrom-Json)
    $farmInfo | Add-Member NoteProperty active_request_before_kill $farmActive[0]
    $farmInfo | Add-Member NoteProperty request_still_active_after_kill ($farmAfter -contains $farmActive[0])
    $farmInfo | ConvertTo-Json | Set-Content .local/qa/worker-crash-drill.json -Encoding utf8
    $farmInfo | ConvertTo-Json -Compress
} finally {
    docker compose up -d worker
    Pop-Location
}
