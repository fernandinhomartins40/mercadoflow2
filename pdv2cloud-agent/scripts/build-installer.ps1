# Build script for PDV2Cloud Desktop Agent Installer
# Requires: Inno Setup installed at C:\Program Files (x86)\Inno Setup 6\ISCC.exe

param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = "..\installer\Output"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PDV2Cloud Installer Build Script" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paths
$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir "dist"
$InstallerDir = Join-Path $RootDir "installer"
$SetupScript = Join-Path $InstallerDir "setup.iss"
$OutputPath = Join-Path $InstallerDir "Output"

# Check if Inno Setup is installed
$InnoSetupPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $InnoSetupPath)) {
    Write-Host "ERROR: Inno Setup not found at $InnoSetupPath" -ForegroundColor Red
    Write-Host "Please install Inno Setup 6 from https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    exit 1
}

# Check if dist folder exists
if (-not (Test-Path $DistDir)) {
    Write-Host "ERROR: dist folder not found at $DistDir" -ForegroundColor Red
    Write-Host "Please prepare the distribution files first." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] Checking distribution files..." -ForegroundColor Green
$RequiredDirs = @(
    (Join-Path $DistDir "python-embed"),
    (Join-Path $DistDir "service"),
    (Join-Path $DistDir "config-ui")
)

foreach ($dir in $RequiredDirs) {
    if (-not (Test-Path $dir)) {
        Write-Host "ERROR: Required directory not found: $dir" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Found: $(Split-Path -Leaf $dir)" -ForegroundColor Gray
}

Write-Host "[2/4] Updating version in setup.iss..." -ForegroundColor Green
$SetupContent = Get-Content $SetupScript -Raw
$SetupContent = $SetupContent -replace 'AppVersion=.*', "AppVersion=$Version"
Set-Content $SetupScript $SetupContent -NoNewline
Write-Host "  ✓ Version updated to $Version" -ForegroundColor Gray

Write-Host "[3/4] Building installer with Inno Setup..." -ForegroundColor Green
& $InnoSetupPath $SetupScript

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Inno Setup build failed" -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] Verifying output..." -ForegroundColor Green
$InstallerFile = Join-Path $OutputPath "PDV2Cloud-Setup.exe"
if (-not (Test-Path $InstallerFile)) {
    Write-Host "ERROR: Installer file not found at $InstallerFile" -ForegroundColor Red
    exit 1
}

$FileSize = (Get-Item $InstallerFile).Length / 1MB
Write-Host "  ✓ Installer created: $InstallerFile" -ForegroundColor Gray
Write-Host "  ✓ Size: $([math]::Round($FileSize, 2)) MB" -ForegroundColor Gray

# Generate checksum
Write-Host ""
Write-Host "Generating SHA256 checksum..." -ForegroundColor Green
$Hash = (Get-FileHash $InstallerFile -Algorithm SHA256).Hash
$HashFile = Join-Path $OutputPath "PDV2Cloud-Setup.exe.sha256"
Set-Content $HashFile $Hash
Write-Host "  ✓ SHA256: $Hash" -ForegroundColor Gray
Write-Host "  ✓ Checksum saved to: $HashFile" -ForegroundColor Gray

# Generate metadata for the web download endpoint (optional but recommended)
$MetaFile = Join-Path $OutputPath "PDV2Cloud-Setup.exe.meta.json"
$Meta = @{
    version        = $Version
    filename       = "PDV2Cloud-Setup.exe"
    sha256         = $Hash
    size           = (Get-Item $InstallerFile).Length
    buildTimestamp = (Get-Date).ToString("o")
}
$Meta | ConvertTo-Json -Depth 3 | Set-Content $MetaFile -Encoding UTF8
Write-Host "  ✓ Metadata saved to: $MetaFile" -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "Installer: $InstallerFile" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
