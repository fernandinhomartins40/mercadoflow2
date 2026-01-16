param(
  [string]$DbPath = "./data/pdv2cloud.db",
  [string]$BackupDir = "./backups"
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $BackupDir "pdv2cloud_$timestamp.db"
Copy-Item $DbPath $backupPath
Write-Host "Backup criado: $backupPath"
