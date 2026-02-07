param(
  [string]$ProjectRoot = (Get-Location)
)

Set-Location "$ProjectRoot/backend"

$mvn = Get-Command mvn -ErrorAction SilentlyContinue
if ($mvn) {
  mvn -q -DskipTests package
  exit $LASTEXITCODE
}

Write-Host "Maven nao encontrado. Usando Docker para build..." -ForegroundColor Yellow
docker run --rm -v "${PWD}:/app" -w /app maven:3.9.6-eclipse-temurin-17 mvn -q -DskipTests package
