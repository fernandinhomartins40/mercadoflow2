param(
  [string]$BackupDir = "./backups",
  [string]$Service = "postgres",
  [string]$DbName = "pdv2cloud",
  [string]$DbUser = "pdv2cloud"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $BackupDir "pdv2cloud_$timestamp.dump"

$containerId = (docker compose ps -q $Service).Trim()
if (-not $containerId) {
  throw "Container do servico '$Service' nao encontrado. Rode 'docker compose up -d' primeiro."
}

$tmpPath = "/tmp/pdv2cloud_backup_$timestamp.dump"

Write-Host "Criando backup do Postgres (db=$DbName, user=$DbUser)..." -ForegroundColor Cyan
docker compose exec -T $Service pg_dump -U $DbUser -d $DbName -Fc -f $tmpPath
docker cp "${containerId}:${tmpPath}" $backupPath
docker compose exec -T $Service rm -f $tmpPath | Out-Null

Write-Host "Backup criado: $backupPath"
