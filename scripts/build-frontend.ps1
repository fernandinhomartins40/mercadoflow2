param(
  [string]$ProjectRoot = (Get-Location)
)

Set-Location "$ProjectRoot/frontend"

npm install
npm run build
