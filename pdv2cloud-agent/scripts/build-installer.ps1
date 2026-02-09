# Build script for PDV2Cloud Desktop Agent Installer
# Requires: Inno Setup installed at C:\Program Files (x86)\Inno Setup 6\ISCC.exe

param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = "..\\installer\\Output",
    [switch]$PrepareArtifacts,
    [switch]$Sign,
    [string]$PfxPath = $env:PDV2CLOUD_CODESIGN_PFX,
    [string]$PfxPassword = $env:PDV2CLOUD_CODESIGN_PFX_PASSWORD,
    [string]$TimestampUrl = $env:PDV2CLOUD_CODESIGN_TIMESTAMP_URL
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PDV2Cloud Installer Build Script" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paths
$RootDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $RootDir
$DistDir = Join-Path $RepoRoot "dist"
$InstallerDir = Join-Path $RootDir "installer"
$SetupScript = Join-Path $InstallerDir "setup.iss"
$OutputPath = Join-Path $InstallerDir "Output"

if ($OutputDir -and $OutputDir.Trim() -ne "") {
    $OutputPath = Join-Path $PSScriptRoot $OutputDir
}
try {
    $resolved = Resolve-Path -Path $OutputPath -ErrorAction Stop
    if ($resolved -and $resolved.Path) {
        $OutputPath = $resolved.Path
    }
} catch {
    # Keep the provided output path; we'll create it below.
}

New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

# Optionally prepare dist/ (python-embed, service, config-ui) from the repo scripts.
if ($PrepareArtifacts) {
    Write-Host "[0/5] Preparando artifacts em dist/..." -ForegroundColor Green
    $PrepareScript = Join-Path $RepoRoot "scripts\\build-installer.ps1"
    if (-not (Test-Path $PrepareScript)) {
        Write-Host "ERROR: Script nao encontrado: $PrepareScript" -ForegroundColor Red
        exit 1
    }
    & powershell -ExecutionPolicy Bypass -File $PrepareScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Falha ao preparar dist/" -ForegroundColor Red
        exit 1
    }
}

# Check if Inno Setup is installed
$InnoSetupPath = "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
if (-not (Test-Path $InnoSetupPath)) {
    $bundled = Join-Path $RepoRoot "tools\\innosetup\\ISCC.exe"
    if (Test-Path $bundled) {
        $InnoSetupPath = $bundled
    }
}
if (-not (Test-Path $InnoSetupPath)) {
    Write-Host "ERROR: ISCC.exe (Inno Setup) nao encontrado." -ForegroundColor Red
    Write-Host "Instale o Inno Setup 6 ou use o bundle em tools/innosetup." -ForegroundColor Yellow
    exit 1
}

# Check if dist folder exists
if (-not (Test-Path $DistDir)) {
    Write-Host "ERROR: dist folder not found at $DistDir" -ForegroundColor Red
    Write-Host "Please prepare the distribution files first." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/5] Checking distribution files..." -ForegroundColor Green
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

Write-Host "[2/5] Updating version in setup.iss..." -ForegroundColor Green
$SetupContent = Get-Content $SetupScript -Raw
$SetupContent = $SetupContent -replace 'AppVersion=.*', "AppVersion=$Version"
Set-Content $SetupScript $SetupContent -NoNewline
Write-Host "  ✓ Version updated to $Version" -ForegroundColor Gray

Write-Host "[3/5] Building installer with Inno Setup..." -ForegroundColor Green
& $InnoSetupPath ("/O`"" + $OutputPath + "`"") $SetupScript

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Inno Setup build failed" -ForegroundColor Red
    exit 1
}

Write-Host "[4/5] Verifying output..." -ForegroundColor Green
$InstallerFile = Join-Path $OutputPath "PDV2Cloud-Setup.exe"
if (-not (Test-Path $InstallerFile)) {
    Write-Host "ERROR: Installer file not found at $InstallerFile" -ForegroundColor Red
    exit 1
}

$FileSize = (Get-Item $InstallerFile).Length / 1MB
Write-Host "  ✓ Installer created: $InstallerFile" -ForegroundColor Gray
Write-Host "  ✓ Size: $([math]::Round($FileSize, 2)) MB" -ForegroundColor Gray

function Resolve-SignToolPath {
    $candidates = @(
        "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe",
        "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\*\\x86\\signtool.exe",
        "C:\\Program Files\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe",
        "C:\\Program Files\\Windows Kits\\10\\bin\\*\\x86\\signtool.exe"
    )
    foreach ($pattern in $candidates) {
        $items = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
        if ($items) {
            # Pick the newest SDK folder if multiple match
            return ($items | Sort-Object FullName -Descending | Select-Object -First 1).FullName
        }
    }
    return $null
}

if (-not $TimestampUrl -or $TimestampUrl.Trim() -eq "") {
    $TimestampUrl = "http://timestamp.digicert.com"
}

if ($Sign) {
    Write-Host ""
    Write-Host "[5/5] Signing installer (Authenticode)..." -ForegroundColor Green

    if (-not $PfxPath -or $PfxPath.Trim() -eq "") {
        Write-Host "ERROR: PfxPath nao informado. Use -PfxPath ou defina PDV2CLOUD_CODESIGN_PFX" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $PfxPath)) {
        Write-Host "ERROR: Certificado nao encontrado em: $PfxPath" -ForegroundColor Red
        exit 1
    }
    if (-not $PfxPassword -or $PfxPassword.Trim() -eq "") {
        Write-Host "ERROR: PfxPassword nao informado. Use -PfxPassword ou defina PDV2CLOUD_CODESIGN_PFX_PASSWORD" -ForegroundColor Red
        exit 1
    }

    $SignTool = Resolve-SignToolPath
    if (-not $SignTool) {
        Write-Host "ERROR: signtool.exe nao encontrado. Instale o Windows SDK (App Certification Kit / SignTool)." -ForegroundColor Red
        Write-Host "Sugestao: instale 'Windows 10/11 SDK' e tente novamente." -ForegroundColor Yellow
        exit 1
    }

    & $SignTool sign `
        /fd SHA256 `
        /td SHA256 `
        /tr $TimestampUrl `
        /f $PfxPath `
        /p $PfxPassword `
        $InstallerFile

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Falha ao assinar o instalador" -ForegroundColor Red
        exit 1
    }

    & $SignTool verify /pa /v $InstallerFile | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Assinatura nao passou na verificacao do signtool" -ForegroundColor Red
        exit 1
    }

    Write-Host "  ✓ Assinatura aplicada com sucesso" -ForegroundColor Gray
}

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
