$root = (Get-Location)
$tools = Join-Path $root 'tools'
$innoDir = Join-Path $tools 'innosetup'
$innoInstaller = Join-Path $tools 'innosetup.exe'

if (-not (Test-Path $innoInstaller)) {
  Invoke-WebRequest -Uri 'https://jrsoftware.org/download.php/is.exe' -OutFile $innoInstaller
}

if (-not (Test-Path $innoDir)) { New-Item -ItemType Directory -Force -Path $innoDir | Out-Null }

& $innoInstaller /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=$innoDir

Write-Host "Inno Setup installed to $innoDir"
