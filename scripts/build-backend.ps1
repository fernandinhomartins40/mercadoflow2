param(
  [string]$ProjectRoot = (Get-Location)
)

Set-Location "$ProjectRoot/backend"

mvn -q -DskipTests package
