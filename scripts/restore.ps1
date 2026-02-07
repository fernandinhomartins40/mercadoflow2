param(
  [string]$BackupPath,
  [string]$Service = "postgres",
  [string]$DbName = "pdv2cloud",
  [string]$DbUser = "pdv2cloud"
)

$ErrorActionPreference = "Stop"

if (-not $BackupPath) {
  Write-Host "Uso: restore.ps1 -BackupPath <caminho>"
  exit 1
}

if (-not (Test-Path $BackupPath)) {
  throw "Arquivo de backup nao encontrado: $BackupPath"
}

$containerId = (docker compose ps -q $Service).Trim()
if (-not $containerId) {
  throw "Container do servico '$Service' nao encontrado. Rode 'docker compose up -d' primeiro."
}

$tmpPath = "/tmp/pdv2cloud_restore.dump"

Write-Host "Restaurando backup no Postgres (db=$DbName, user=$DbUser)..." -ForegroundColor Cyan
Write-Host "Dica: pare o API antes (docker compose stop api cron-jobs) para evitar locks." -ForegroundColor Yellow

docker cp $BackupPath "${containerId}:${tmpPath}"
docker compose exec -T $Service pg_restore --clean --if-exists --no-owner --no-privileges -U $DbUser -d $DbName $tmpPath
docker compose exec -T $Service rm -f $tmpPath | Out-Null

Write-Host "Backup restaurado"
