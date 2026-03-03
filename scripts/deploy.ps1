param(
  [string]$ProjectRoot = (Get-Location),
  [string]$ComposeFile = "docker-compose.yml",
  [string]$ProjectName = ""
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

$composeArgs = @("compose")
if ($ProjectName) {
  $composeArgs += @("--project-name", $ProjectName)
}
$composeArgs += @("-f", $ComposeFile)

Write-Host "Validating docker compose..."
docker @composeArgs config -q

Write-Host "Pulling base images..."
docker pull postgres:16-alpine | Out-Host
docker pull nginx:alpine | Out-Host

Write-Host "Building application images..."
docker @composeArgs build --pull | Out-Host

Write-Host "Updating services without removing volumes..."
docker @composeArgs up -d --build --force-recreate --remove-orphans | Out-Host

Write-Host "Current service status:"
docker @composeArgs ps | Out-Host
