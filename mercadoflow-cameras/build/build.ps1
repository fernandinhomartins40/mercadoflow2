# Gera o instalador: pwsh build/build.ps1 [-Version 1.0.0]
# Precisa de Python 3.13 e do Inno Setup. O modelo é baixado aqui e conferido pelo hash.
param([string]$Version = "1.0.0")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$model = "assets/yolox_tiny.onnx"
$modelSha = "427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7"
if (-not (Test-Path $model)) {
  Invoke-WebRequest "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx" -OutFile $model
}
if ((Get-FileHash $model -Algorithm SHA256).Hash.ToLower() -ne $modelSha) { throw "Modelo com hash diferente do esperado" }

python -m pip install -q -r requirements.txt pyinstaller==6.20.0
python tests/check_core.py
if ($LASTEXITCODE -ne 0) { throw "Verificação do núcleo falhou" }

python -m PyInstaller --noconfirm --clean --windowed --name MercadoFlowCameras --icon build/icon.ico `
  --add-data "assets;assets" --add-data "THIRD_PARTY.txt;." `
  --exclude-module matplotlib --exclude-module scipy --exclude-module pandas main.py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller falhou" }

$check = Start-Process dist/MercadoFlowCameras/MercadoFlowCameras.exe -ArgumentList "--check" -Wait -PassThru
if ($check.ExitCode -ne 0) { throw "O executável não passou na autoverificação ($($check.ExitCode))" }

$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" }
& $iscc "/DAppVersion=$Version" build/setup.iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup falhou" }

$setup = "build/Output/MercadoFlowCameras-Setup.exe"
(Get-FileHash $setup -Algorithm SHA256).Hash.ToLower() | Out-File "$setup.sha256" -Encoding ascii -NoNewline
Write-Host "Pronto: $setup"
