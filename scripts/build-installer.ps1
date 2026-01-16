$ErrorActionPreference = 'Stop'
$root = (Get-Location)
$tools = Join-Path $root 'tools'
$dist = Join-Path $root 'dist'
$pythonDir = Join-Path $dist 'python-embed'
$serviceSrc = Join-Path $root 'pdv2cloud-agent\service'
$installerSrc = Join-Path $root 'pdv2cloud-agent\installer'
$configSrc = Join-Path $root 'pdv2cloud-agent\config'
$configUiRoot = Join-Path $root 'pdv2cloud-config'

New-Item -ItemType Directory -Force -Path $dist, $pythonDir | Out-Null

# Download Python embeddable
$pyZip = Join-Path $tools 'python-embed.zip'
if (-not (Test-Path $pyZip)) {
  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile $pyZip
}
if (Test-Path $pythonDir) { Remove-Item $pythonDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null
Expand-Archive -Path $pyZip -DestinationPath $pythonDir -Force

# Add get-pip
$getPip = Join-Path $pythonDir 'get-pip.py'
Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip

# Copy service + installer + config
$serviceDist = Join-Path $dist 'service'
if (Test-Path $serviceDist) { Remove-Item $serviceDist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $serviceDist | Out-Null
Copy-Item $serviceSrc -Destination $serviceDist -Recurse -Force
Copy-Item $installerSrc -Destination (Join-Path $serviceDist 'installer') -Recurse -Force
Copy-Item $configSrc -Destination (Join-Path $serviceDist 'config') -Recurse -Force

# Build config UI
Set-Location $configUiRoot
npm install
npm run build
npm run package

# Copy win-unpacked into dist/config-ui
$winUnpacked = Join-Path $configUiRoot 'dist\win-unpacked'
$configUiDist = Join-Path $dist 'config-ui'
if (Test-Path $configUiDist) { Remove-Item $configUiDist -Recurse -Force }
Copy-Item $winUnpacked -Destination $configUiDist -Recurse -Force

Set-Location $root
Write-Host 'Build artifacts prepared in dist/'
