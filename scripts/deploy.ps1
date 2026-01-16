param(
  [string]$ProjectRoot = (Get-Location)
)

Set-Location $ProjectRoot

docker compose up -d --build
