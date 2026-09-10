$ErrorActionPreference='Stop'
$farmRoot=Split-Path -Parent $PSScriptRoot
$farmStamp=Get-Date -Format 'yyyyMMddHHmmss'
$farmDb='farm_restore_'+$farmStamp
$farmVolume='product-farm-restore-'+$farmStamp
$farmRunnerVolume='product-farm-restore-runner-'+$farmStamp
$farmContainer='product-farm-restore-storage-'+$farmStamp
$farmBackup=Join-Path $farmRoot ('.local/qa/restore-'+$farmStamp)
New-Item -ItemType Directory -Path $farmBackup | Out-Null
function Invoke-FarmDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw 'Docker restore drill command failed' }
}
$farmSecrets=@{}
Get-Content -LiteralPath (Join-Path $farmRoot '.env') | ForEach-Object {
    if ($_ -match '^(S3_ACCESS_KEY|S3_SECRET_KEY)=(.*)$') {$farmSecrets[$matches[1]]=$matches[2]}
}
$farmEnv=Join-Path $farmBackup '.minio.env'
[IO.File]::WriteAllLines($farmEnv,@(('MINIO_ROOT_USER='+$farmSecrets['S3_ACCESS_KEY']),('MINIO_ROOT_PASSWORD='+$farmSecrets['S3_SECRET_KEY'])),[Text.UTF8Encoding]::new($false))
$farmSecrets.Clear()
Push-Location $farmRoot
try {
    Invoke-FarmDocker compose stop api worker runner
    Invoke-FarmDocker run --rm --network none --mount 'type=volume,source=product-farm_runner_state,target=/source,readonly' --mount "type=bind,source=$farmBackup,target=/backup" --entrypoint tar postgres:15-alpine -cf /backup/runner.tar -C /source .
    Invoke-FarmDocker volume create $farmRunnerVolume
    Invoke-FarmDocker run --rm --network none --mount "type=volume,source=$farmRunnerVolume,target=/target" --mount "type=bind,source=$farmBackup,target=/backup,readonly" --entrypoint tar postgres:15-alpine -xf /backup/runner.tar -C /target
    Invoke-FarmDocker run --rm --network none --read-only --mount 'type=volume,source=product-farm_runner_state,target=/source,readonly' --mount "type=volume,source=$farmRunnerVolume,target=/target,readonly" --entrypoint python product-farm-runner -c "import sqlite3,json; a=sqlite3.connect('file:/source/runner.sqlite?mode=ro',uri=True); b=sqlite3.connect('file:/target/runner.sqlite?mode=ro',uri=True); x=a.execute('SELECT * FROM requests ORDER BY id').fetchall(); y=b.execute('SELECT * FROM requests ORDER BY id').fetchall(); assert x==y; print(json.dumps({'runner_requests_restored':len(x),'row_equality':True}))"
    Invoke-FarmDocker compose exec -T postgres pg_dump -U farm -d farm -Fc -f /tmp/farm-drill.dump
    Invoke-FarmDocker cp product-farm-postgres-1:/tmp/farm-drill.dump (Join-Path $farmBackup 'farm.dump')
    Invoke-FarmDocker compose stop storage
    Invoke-FarmDocker run --rm --network none --mount 'type=volume,source=product-farm_objects,target=/source,readonly' --mount "type=bind,source=$farmBackup,target=/backup" --entrypoint tar postgres:15-alpine -cf /backup/objects.tar -C /source .
    Invoke-FarmDocker volume create $farmVolume
    Invoke-FarmDocker run --rm --network none --mount "type=volume,source=$farmVolume,target=/target" --mount "type=bind,source=$farmBackup,target=/backup,readonly" --entrypoint tar postgres:15-alpine -xf /backup/objects.tar -C /target
    Invoke-FarmDocker compose exec -T postgres createdb -U farm $farmDb
    Invoke-FarmDocker compose exec -T postgres pg_restore -U farm -d $farmDb --exit-on-error /tmp/farm-drill.dump
    Invoke-FarmDocker run -d --name $farmContainer --network product-farm_default --env-file $farmEnv --mount "type=volume,source=$farmVolume,target=/data" minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
    Invoke-FarmDocker compose start storage api
    $farmVerifier=Get-Content -LiteralPath (Join-Path $farmRoot 'backend/tests/verify_restore.py') -Raw
    $farmVerifier | docker compose exec -T -e "TEST_RESTORE_DB=$farmDb" -e "TEST_RESTORE_STORAGE=http://${farmContainer}:9000" api python -
    if ($LASTEXITCODE -ne 0) {throw 'Restored content verification failed'}
    Write-Output "Restore verified. Backup directory: $farmBackup"
} finally {
    & docker compose start storage api runner worker
    & docker stop $farmContainer 2>$null
    if (Test-Path -LiteralPath $farmEnv) {Remove-Item -LiteralPath $farmEnv}
    Pop-Location
}
