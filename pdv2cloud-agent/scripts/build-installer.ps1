# Build do instalador PDV2Cloud para uma arquitetura específica.
#
# Uso:
#   .\build-installer.ps1 -Version 1.2.3 -Arch x64             # só x64
#   .\build-installer.ps1 -Version 1.2.3 -Arch x86             # só x86
#   .\build-installer.ps1 -Version 1.2.3 -BothArch              # x64 + x86 (padrão CI)
#   .\build-installer.ps1 -Version 1.2.3 -BothArch -PrepareArtifacts -Sign

param(
    [string]$Version    = "1.0.0",
    [string]$OutputDir  = "..\\installer\\Output",
    [ValidateSet("x64","x86","")]
    [string]$Arch       = "x64",
    [switch]$BothArch,          # compila x64 E x86
    [switch]$PrepareArtifacts,
    [switch]$Sign,
    [string]$PfxPath       = $env:PDV2CLOUD_CODESIGN_PFX,
    [string]$PfxPassword   = $env:PDV2CLOUD_CODESIGN_PFX_PASSWORD,
    [string]$TimestampUrl  = $env:PDV2CLOUD_CODESIGN_TIMESTAMP_URL
)

$ErrorActionPreference = "Stop"

$RootDir      = Split-Path -Parent $PSScriptRoot
$RepoRoot     = Split-Path -Parent $RootDir
$InstallerDir = Join-Path $RootDir "installer"
$SetupScript  = Join-Path $InstallerDir "setup.iss"

$OutputPath = Join-Path $InstallerDir "Output"
if ($OutputDir -and $OutputDir.Trim() -ne "") {
    $OutputPath = Join-Path $PSScriptRoot $OutputDir
}
try { $r = Resolve-Path -Path $OutputPath -ErrorAction Stop; $OutputPath = $r.Path } catch {}
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

# Determina lista de arquiteturas a construir
$archList = if ($BothArch) { @("x64","x86") } else { @($Arch) }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PDV2Cloud Installer Build"                -ForegroundColor Cyan
Write-Host "Versão  : $Version"                      -ForegroundColor Cyan
Write-Host "Arq.    : $($archList -join ' + ')"      -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── Localizar Inno Setup ───────────────────────────────────────────────────
$InnoSetupPath = "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
if (-not (Test-Path $InnoSetupPath)) {
    $bundled = Join-Path $RepoRoot "tools\\innosetup\\ISCC.exe"
    if (Test-Path $bundled) { $InnoSetupPath = $bundled }
}
if (-not (Test-Path $InnoSetupPath)) {
    Write-Host "ERRO: ISCC.exe não encontrado. Instale o Inno Setup 6." -ForegroundColor Red; exit 1
}

# ── Localizar signtool ─────────────────────────────────────────────────────
function Resolve-SignToolPath {
    $patterns = @(
        "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe",
        "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\*\\x86\\signtool.exe",
        "C:\\Program Files\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe"
    )
    foreach ($p in $patterns) {
        $items = Get-ChildItem -Path $p -ErrorAction SilentlyContinue
        if ($items) { return ($items | Sort-Object FullName -Descending | Select-Object -First 1).FullName }
    }
    return $null
}

if (-not $TimestampUrl -or $TimestampUrl.Trim() -eq "") { $TimestampUrl = "http://timestamp.digicert.com" }

# ── Função de build para uma arquitetura ──────────────────────────────────
function Build-Installer([string]$arch) {
    Write-Host ""
    Write-Host "── Build $arch ───────────────────────────────────────────" -ForegroundColor Cyan

    $DistDir = Join-Path $RepoRoot "dist-$arch"

    # [0] Preparar artefatos (bundle Python + deps) se solicitado
    if ($PrepareArtifacts) {
        Write-Host "[0] Preparando artefatos dist-$arch..." -ForegroundColor Green
        $BundleScript = Join-Path $PSScriptRoot "bundle-dependencies.ps1"
        if (-not (Test-Path $BundleScript)) {
            Write-Host "ERRO: bundle-dependencies.ps1 não encontrado" -ForegroundColor Red; exit 1
        }
        & pwsh -ExecutionPolicy Bypass -File $BundleScript `
            -Arch $arch `
            -OutputDir "..\\dist-$arch"
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: bundle falhou para $arch" -ForegroundColor Red; exit 1 }
    }

    # Verificar pasta dist
    if (-not (Test-Path $DistDir)) {
        Write-Host "ERRO: pasta dist-$arch não encontrada em $DistDir" -ForegroundColor Red; exit 1
    }
    foreach ($sub in @("python-embed","service","config-ui")) {
        if (-not (Test-Path (Join-Path $DistDir $sub))) {
            Write-Host "ERRO: subpasta '$sub' não encontrada em dist-$arch" -ForegroundColor Red; exit 1
        }
        Write-Host "  ✓ $sub" -ForegroundColor Gray
    }

    # [1] Atualizar versão e arquitetura no setup.iss (cópia por arch)
    Write-Host "[1] Configurando setup.iss para $arch..." -ForegroundColor Green
    $setupContent = Get-Content $SetupScript -Raw
    $setupContent = $setupContent -replace 'AppVersion=.*', "AppVersion=$Version"
    # OutputDir dinâmico
    if ($setupContent -match '(?m)^OutputDir=') {
        $setupContent = $setupContent -replace '(?m)^OutputDir=.*$', "OutputDir=$OutputPath"
    } else {
        $setupContent += "`r`nOutputDir=$OutputPath`r`n"
    }
    # Apontar dist para a pasta correta desta arquitetura
    $setupContent = $setupContent -replace '\\\\dist\\\\', "\\dist-$arch\\"
    $setupContent = $setupContent -replace '\.\./\.\./dist/', "../../dist-$arch/"
    $setupContent = $setupContent -replace '\.\.\\\.\.\\dist\\', "..\..\dist-$arch\"

    $tempIss = Join-Path $InstallerDir "setup-$arch.iss"
    Set-Content $tempIss $setupContent -NoNewline

    # [2] Compilar com ISCC passando /DArch
    Write-Host "[2] Compilando com Inno Setup (Arch=$arch)..." -ForegroundColor Green
    & $InnoSetupPath $tempIss /DArch=$arch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Inno Setup falhou para $arch" -ForegroundColor Red
        Remove-Item $tempIss -ErrorAction SilentlyContinue
        exit 1
    }
    Remove-Item $tempIss -ErrorAction SilentlyContinue

    # [3] Verificar saída
    $suffix = if ($arch -eq "x86") { "-x86" } else { "" }
    $installerFile = Join-Path $OutputPath "AgenteMercadoFlow-Setup$suffix.exe"
    if (-not (Test-Path $installerFile)) {
        Write-Host "ERRO: Arquivo de saída não encontrado: $installerFile" -ForegroundColor Red; exit 1
    }
    $sizeMB = [math]::Round((Get-Item $installerFile).Length / 1MB, 2)
    Write-Host "  ✓ $installerFile ($sizeMB MB)" -ForegroundColor Gray

    # [4] Assinar (opcional)
    if ($Sign) {
        Write-Host "[3] Assinando $arch..." -ForegroundColor Green
        if (-not $PfxPath -or -not (Test-Path $PfxPath)) {
            Write-Host "ERRO: Certificado PFX não encontrado: $PfxPath" -ForegroundColor Red; exit 1
        }
        if (-not $PfxPassword) {
            Write-Host "ERRO: PfxPassword não informado" -ForegroundColor Red; exit 1
        }
        $signTool = Resolve-SignToolPath
        if (-not $signTool) {
            Write-Host "ERRO: signtool.exe não encontrado" -ForegroundColor Red; exit 1
        }
        & $signTool sign /fd SHA256 /td SHA256 /tr $TimestampUrl /f $PfxPath /p $PfxPassword $installerFile
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: falha ao assinar" -ForegroundColor Red; exit 1 }
        & $signTool verify /pa $installerFile | Out-Null
        Write-Host "  ✓ Assinatura válida" -ForegroundColor Gray
    }

    # [5] SHA-256
    Write-Host "[4] Gerando SHA-256..." -ForegroundColor Green
    $hash     = (Get-FileHash $installerFile -Algorithm SHA256).Hash.ToLower()
    $hashFile = Join-Path $OutputPath "AgenteMercadoFlow-Setup$suffix.exe.sha256"
    Set-Content $hashFile $hash
    Write-Host "  ✓ SHA256: $hash" -ForegroundColor Gray

    # [6] meta.json por arch
    $metaFile = Join-Path $OutputPath "AgenteMercadoFlow-Setup$suffix.exe.meta.json"
    $meta = @{
        version        = $Version
        arch           = $arch
        filename       = "AgenteMercadoFlow-Setup$suffix.exe"
        sha256         = $hash
        size           = (Get-Item $installerFile).Length
        buildTimestamp = (Get-Date).ToString("o")
    }
    $meta | ConvertTo-Json -Depth 3 | Set-Content $metaFile -Encoding UTF8
    Write-Host "  ✓ Metadata: $metaFile" -ForegroundColor Gray
}

# ── Executar para cada arquitetura ─────────────────────────────────────────
foreach ($a in $archList) {
    Build-Installer -arch $a
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Build concluído!"                         -ForegroundColor Green
foreach ($a in $archList) {
    $suffix = if ($a -eq "x86") { "-x86" } else { "" }
    $f = Join-Path $OutputPath "AgenteMercadoFlow-Setup$suffix.exe"
    if (Test-Path $f) { Write-Host "  $a : $f" -ForegroundColor Gray }
}
Write-Host "========================================" -ForegroundColor Green
