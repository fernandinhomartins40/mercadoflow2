# Bundle Python embeddable + dependências para o instalador do PDV2Cloud.
# Suporta x64 (amd64) e x86 (32-bit) explicitamente.
#
# Uso:
#   .\bundle-dependencies.ps1                        # detecta arquitetura do OS atual
#   .\bundle-dependencies.ps1 -Arch x64              # força x64
#   .\bundle-dependencies.ps1 -Arch x86              # força x86 (Windows 32-bit ou compatibilidade)
#   .\bundle-dependencies.ps1 -PythonVersion 3.11.9 -Arch x64

param(
    [string]$PythonVersion = "3.11.9",
    [string]$OutputDir     = "..\dist",
    # "x64" | "x86" | "" (detecta automaticamente)
    [ValidateSet("x64","x86","")]
    [string]$Arch = ""
)

$ErrorActionPreference = "Stop"

# ── Detectar arquitetura ────────────────────────────────────────────────────
if ($Arch -eq "") {
    $osArch = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
    # Em processo 32-bit rodando em OS 64-bit, PROCESSOR_ARCHITECTURE = x86
    # mas PROCESSOR_ARCHITEW6432 estará definido.
    $isWow64 = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITEW6432")
    if ($osArch -eq "AMD64" -or $isWow64 -eq "AMD64") {
        $Arch = "x64"
    } else {
        $Arch = "x86"
    }
}

# Python 3.11 mínimo requerido para x86: 3.11.9 (última 3.11.x com wheel x86)
# Python 3.9 é a versão mais recente que roda em Windows 7 SP1 sem WUA patches.
# Para Windows 7/8/8.1 recomendamos Python 3.8.20 (última 3.8.x, suporte estendido).
# Para Windows 10+ (build 1607+) usamos 3.11.x.
# A lógica de versão fica no setup.iss; aqui apenas selecionamos o wheel correto.

$ArchSuffix = if ($Arch -eq "x64") { "amd64" } else { "win32" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PDV2Cloud Dependency Bundler"            -ForegroundColor Cyan
Write-Host "Python   : $PythonVersion"               -ForegroundColor Cyan
Write-Host "Arch     : $Arch ($ArchSuffix)"          -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$RootDir        = Split-Path -Parent $PSScriptRoot
$DistDir        = Join-Path $RootDir $OutputDir
$PythonEmbedDir = Join-Path $DistDir "python-embed"
$ServiceDir     = Join-Path $DistDir "service"
$TempDir        = Join-Path $env:TEMP "pdv2cloud-build-$Arch"

# ── [1/8] Estrutura de diretórios ──────────────────────────────────────────
Write-Host "[1/8] Criando diretórios ($Arch)..." -ForegroundColor Green
Remove-Item -Path $DistDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DistDir        | Out-Null
New-Item -ItemType Directory -Force -Path $PythonEmbedDir | Out-Null
New-Item -ItemType Directory -Force -Path $ServiceDir     | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir        | Out-Null

# ── [2/8] Download Python embeddable ──────────────────────────────────────
Write-Host "[2/8] Baixando Python $PythonVersion ($ArchSuffix)..." -ForegroundColor Green
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-$ArchSuffix.zip"
$PythonZip = Join-Path $TempDir "python-embed-$ArchSuffix.zip"

Write-Host "  URL: $PythonUrl" -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonZip -UseBasicParsing
    Write-Host "  ✓ Python embeddable baixado" -ForegroundColor Gray
} catch {
    Write-Host "ERRO: Falha ao baixar Python $PythonVersion $ArchSuffix" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# ── [3/8] Extrair Python ───────────────────────────────────────────────────
Write-Host "[3/8] Extraindo Python..." -ForegroundColor Green
Expand-Archive -Path $PythonZip -DestinationPath $PythonEmbedDir -Force
Write-Host "  ✓ Python extraído em $PythonEmbedDir" -ForegroundColor Gray

# ── [4/8] Configurar python._pth (habilitar site-packages) ────────────────
Write-Host "[4/8] Configurando paths do Python..." -ForegroundColor Green
$PthFile = Get-ChildItem -Path $PythonEmbedDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    Write-Host "  Arquivo pth: $($PthFile.Name)" -ForegroundColor Gray
    $pthContent = Get-Content $PthFile.FullName
    # Remove linha "#import site" e adiciona "import site" ativo
    $pthContent = $pthContent | Where-Object { $_ -notmatch "^#import site" }
    foreach ($entry in @("..", "..\service", "Lib\site-packages", "", "import site")) {
        if (-not ($pthContent -contains $entry)) { $pthContent += $entry }
    }
    Set-Content -Path $PthFile.FullName -Value $pthContent
    Write-Host "  ✓ pth configurado" -ForegroundColor Gray
} else {
    Write-Host "  AVISO: Arquivo ._pth não encontrado — site-packages pode não funcionar" -ForegroundColor Yellow
}

# ── [5/8] Instalar pip ─────────────────────────────────────────────────────
Write-Host "[5/8] Instalando pip..." -ForegroundColor Green
$GetPipUrl  = "https://bootstrap.pypa.io/get-pip.py"
$GetPipPath = Join-Path $PythonEmbedDir "get-pip.py"
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath -UseBasicParsing

$PythonExe = Join-Path $PythonEmbedDir "python.exe"
& $PythonExe $GetPipPath --no-warn-script-location 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao instalar pip" -ForegroundColor Red; exit 1
}
Write-Host "  ✓ pip instalado" -ForegroundColor Gray

# ── [6/8] Instalar dependências Python ────────────────────────────────────
Write-Host "[6/8] Instalando dependências Python ($ArchSuffix)..." -ForegroundColor Green
$RequirementsFile = Join-Path $RootDir "service\requirements.txt"
$SitePackages     = Join-Path $PythonEmbedDir "Lib\site-packages"

if (-not (Test-Path $RequirementsFile)) {
    Write-Host "  AVISO: requirements.txt não encontrado em $RequirementsFile" -ForegroundColor Yellow
} else {
    # pip install com --platform garante wheels compatíveis quando o runner é x64 mas o
    # target é x86. Requer --only-binary :all: obrigatoriamente.
    # greenlet não tem wheel win32 para cp311 — instalamos SQLAlchemy com --no-deps
    # e depois instalamos suas deps reais (typing-extensions) manualmente.
    # O serviço usa apenas SQLAlchemy síncrono; greenlet só é necessário para AsyncSession.
    $pipPlatform = if ($Arch -eq "x64") { "win_amd64" } else { "win32" }
    $pyVersion   = ($PythonVersion -replace '(\d+\.\d+)\.\d+','$1')
    $commonFlags = @(
        "--no-warn-script-location",
        "--target", $SitePackages,
        "--python-version", $pyVersion,
        "--platform", $pipPlatform,
        "--implementation", "cp",
        "--only-binary", ":all:"
    )

    if ($Arch -eq "x86") {
        # x86: greenlet não tem wheel win32/cp311 — instala SQLAlchemy com --no-deps
        # para contornar a dep obrigatória declarada no metadata do pacote.

        # Pacotes base (sem SQLAlchemy, que arrasta greenlet)
        $reqSemSqlalchemy = (Get-Content $RequirementsFile) | Where-Object { $_ -notmatch '^\s*SQLAlchemy' }
        $tmpReqBase = Join-Path $env:TEMP "requirements-x86-base.txt"
        $reqSemSqlalchemy | Set-Content $tmpReqBase -Encoding UTF8

        Write-Host "  [x86] Instalando pacotes base..." -ForegroundColor Gray
        $argsBase = @("-m","pip","install","-r",$tmpReqBase) + $commonFlags
        & $PythonExe $argsBase
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: Falha ao instalar pacotes base" -ForegroundColor Red; exit 1 }

        # SQLAlchemy sem deps (evita resolução do greenlet)
        $sqlalchemyLine = (Get-Content $RequirementsFile) | Where-Object { $_ -match '^\s*SQLAlchemy' } | Select-Object -First 1
        Write-Host "  [x86] Instalando $($sqlalchemyLine.Trim()) --no-deps..." -ForegroundColor Gray
        $argsSqlite = @("-m","pip","install",$sqlalchemyLine.Trim(),"--no-deps") + $commonFlags
        & $PythonExe $argsSqlite
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: Falha ao instalar SQLAlchemy" -ForegroundColor Red; exit 1 }

        # typing-extensions (única dep real do SQLAlchemy sync)
        Write-Host "  [x86] Instalando typing-extensions..." -ForegroundColor Gray
        $argsTyping = @("-m","pip","install","typing-extensions","--no-deps") + $commonFlags
        & $PythonExe $argsTyping
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: Falha ao instalar typing-extensions" -ForegroundColor Red; exit 1 }

        Write-Host "  ✓ Dependências instaladas (x86, sem greenlet)" -ForegroundColor Gray
    } else {
        # x64: instala normalmente, greenlet resolve via dep transitiva do SQLAlchemy
        Write-Host "  Instalando para platform=$pipPlatform..." -ForegroundColor Gray
        $argsAll = @("-m","pip","install","-r",$RequirementsFile) + $commonFlags
        & $PythonExe $argsAll
        if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: Falha ao instalar dependências" -ForegroundColor Red; exit 1 }
        Write-Host "  ✓ Dependências instaladas" -ForegroundColor Gray
    }
}

# ── [7/8] Copiar arquivos do serviço ──────────────────────────────────────
Write-Host "[7/8] Copiando arquivos do serviço..." -ForegroundColor Green
$SourceServiceDir = Join-Path $RootDir "service"
Copy-Item -Path (Join-Path $SourceServiceDir "*") -Destination $ServiceDir -Recurse -Force
Write-Host "  ✓ Arquivos do serviço copiados" -ForegroundColor Gray

# Config UI (Electron — target=dir gera win-unpacked; x64 funciona via WOW64 em x86 OS 64-bit)
# Tenta win-unpacked primeiro; fallback para dist raiz (builds alternativos)
$ConfigUIBase   = Join-Path $RootDir "..\pdv2cloud-config\dist"
$ConfigUISource = Join-Path $ConfigUIBase "win-unpacked"
if (-not (Test-Path $ConfigUISource)) { $ConfigUISource = $ConfigUIBase }
$ConfigUITarget = Join-Path $DistDir "config-ui"
if (Test-Path $ConfigUISource) {
    Write-Host "[8/8] Copiando Config UI de $ConfigUISource..." -ForegroundColor Green
    Copy-Item -Path $ConfigUISource -Destination $ConfigUITarget -Recurse -Force
    Write-Host "  ✓ Config UI copiada" -ForegroundColor Gray
} else {
    Write-Host "[8/8] ERRO: Config UI não encontrada em $ConfigUIBase" -ForegroundColor Red
    exit 1
}

# ── Gerar bundle-info.json ─────────────────────────────────────────────────
$VersionInfo = @{
    python_version        = $PythonVersion
    arch                  = $Arch
    arch_suffix           = $ArchSuffix
    build_date            = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    bundled_dependencies  = $true
}
$VersionInfo | ConvertTo-Json | Set-Content -Path (Join-Path $DistDir "bundle-info.json") -Encoding UTF8

# Limpeza
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

# Resumo de tamanhos
$PythonSize = (Get-ChildItem -Path $PythonEmbedDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$ServiceSize= (Get-ChildItem -Path $ServiceDir     -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$TotalSize  = (Get-ChildItem -Path $DistDir        -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Bundle concluído! ($Arch)"               -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Python embeddable : $([math]::Round($PythonSize,  2)) MB" -ForegroundColor Gray
Write-Host "Arquivos serviço  : $([math]::Round($ServiceSize, 2)) MB" -ForegroundColor Gray
Write-Host "Total             : $([math]::Round($TotalSize,   2)) MB" -ForegroundColor Gray
Write-Host ""
Write-Host "Próximo passo: execute build-installer.ps1 -Arch $Arch" -ForegroundColor Yellow
