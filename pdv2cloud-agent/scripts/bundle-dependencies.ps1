# Bundle all Python dependencies into the installer
# This script downloads Python embeddable, installs dependencies, and prepares the dist folder

param(
    [string]$PythonVersion = "3.11.9",
    [string]$OutputDir = "..\dist"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PDV2Cloud Dependency Bundler" -ForegroundColor Cyan
Write-Host "Python Version: $PythonVersion" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Setup paths
$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir $OutputDir
$PythonEmbedDir = Join-Path $DistDir "python-embed"
$ServiceDir = Join-Path $DistDir "service"
$TempDir = Join-Path $env:TEMP "pdv2cloud-build"

# Clean and create directories
Write-Host "[1/7] Creating directory structure..." -ForegroundColor Green
Remove-Item -Path $DistDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path $PythonEmbedDir | Out-Null
New-Item -ItemType Directory -Force -Path $ServiceDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Download Python embeddable
Write-Host "[2/7] Downloading Python $PythonVersion embeddable..." -ForegroundColor Green
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZip = Join-Path $TempDir "python-embed.zip"

try {
    Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonZip
    Write-Host "  ✓ Downloaded Python embeddable" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: Failed to download Python" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Extract Python
Write-Host "[3/7] Extracting Python..." -ForegroundColor Green
Expand-Archive -Path $PythonZip -DestinationPath $PythonEmbedDir -Force
Write-Host "  ✓ Python extracted to $PythonEmbedDir" -ForegroundColor Gray

# Download and install pip
Write-Host "[4/7] Setting up pip..." -ForegroundColor Green
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$GetPipPath = Join-Path $PythonEmbedDir "get-pip.py"
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath

# Modify python*._pth to enable site-packages
$PthFile = Get-ChildItem -Path $PythonEmbedDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    Write-Host "  ✓ Configuring Python paths ($($PthFile.Name))..." -ForegroundColor Gray
    $pthContent = Get-Content $PthFile.FullName
    $pthContent = $pthContent | Where-Object { $_ -notmatch "^#import site" }
    if (-not ($pthContent -contains "..")) {
        $pthContent += ".."
    }
    if (-not ($pthContent -contains "..\service")) {
        $pthContent += "..\service"
    }
    if (-not ($pthContent -contains "Lib\site-packages")) {
        $pthContent += "Lib\site-packages"
    }
    if (-not ($pthContent -contains "import site")) {
        $pthContent += ""
        $pthContent += "import site"
    }
    Set-Content -Path $PthFile.FullName -Value $pthContent
}

# Install pip
$PythonExe = Join-Path $PythonEmbedDir "python.exe"
& $PythonExe $GetPipPath --no-warn-script-location
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install pip" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ pip installed" -ForegroundColor Gray

# Install dependencies from requirements.txt
Write-Host "[5/7] Installing Python dependencies..." -ForegroundColor Green
$RequirementsFile = Join-Path $RootDir "service\requirements.txt"

if (Test-Path $RequirementsFile) {
    & $PythonExe -m pip install -r $RequirementsFile --no-warn-script-location --target (Join-Path $PythonEmbedDir "Lib\site-packages")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ All dependencies installed" -ForegroundColor Gray
} else {
    Write-Host "WARNING: requirements.txt not found" -ForegroundColor Yellow
}

# Copy service files
Write-Host "[6/7] Copying service files..." -ForegroundColor Green
$SourceServiceDir = Join-Path $RootDir "service"
Copy-Item -Path (Join-Path $SourceServiceDir "*") -Destination $ServiceDir -Recurse -Force
Write-Host "  ✓ Service files copied" -ForegroundColor Gray

# Copy config-ui (if exists)
$ConfigUISource = Join-Path $RootDir "..\pdv2cloud-config\dist"
$ConfigUITarget = Join-Path $DistDir "config-ui"
if (Test-Path $ConfigUISource) {
    Write-Host "[7/7] Copying config UI..." -ForegroundColor Green
    Copy-Item -Path $ConfigUISource -Destination $ConfigUITarget -Recurse -Force
    Write-Host "  ✓ Config UI copied" -ForegroundColor Gray
} else {
    Write-Host "[7/7] Skipping config UI (not built)" -ForegroundColor Yellow
}

# Create version info file
$VersionInfo = @{
    python_version = $PythonVersion
    build_date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    bundled_dependencies = $true
}
$VersionInfo | ConvertTo-Json | Set-Content -Path (Join-Path $DistDir "bundle-info.json")

# Cleanup
Write-Host "Cleaning up temporary files..." -ForegroundColor Gray
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

# Calculate sizes
$PythonSize = (Get-ChildItem -Path $PythonEmbedDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$ServiceSize = (Get-ChildItem -Path $ServiceDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$TotalSize = (Get-ChildItem -Path $DistDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Bundle Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Python embeddable: $([math]::Round($PythonSize, 2)) MB" -ForegroundColor Gray
Write-Host "Service files: $([math]::Round($ServiceSize, 2)) MB" -ForegroundColor Gray
Write-Host "Total size: $([math]::Round($TotalSize, 2)) MB" -ForegroundColor Gray
Write-Host ""
Write-Host "Output directory: $DistDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: Run build-installer.ps1 to create the setup.exe" -ForegroundColor Yellow
