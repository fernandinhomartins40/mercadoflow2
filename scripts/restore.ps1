param(
  [string]$BackupPath,
  [string]$DbPath = "./data/pdv2cloud.db"
)

if (-not $BackupPath) {
  Write-Host "Uso: restore.ps1 -BackupPath <caminho>"
  exit 1
}

Copy-Item $BackupPath $DbPath -Force
Write-Host "Backup restaurado"
