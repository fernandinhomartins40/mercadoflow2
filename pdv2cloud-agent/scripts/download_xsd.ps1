param(
  [string]$TargetDir = "C:/ProgramData/PDV2Cloud/xsd"
)

$url = "https://github.com/nfephp-org/sped-nfe/archive/refs/heads/master.zip"
$zipPath = Join-Path $env:TEMP "sped-nfe.zip"
$extractPath = Join-Path $env:TEMP "sped-nfe"

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

Invoke-WebRequest -Uri $url -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

$src = Join-Path $extractPath "sped-nfe-master\\schemes"
Copy-Item $src -Destination $TargetDir -Recurse -Force

Remove-Item $zipPath -Force
Remove-Item $extractPath -Recurse -Force

Write-Host "XSDs copiados para $TargetDir"
