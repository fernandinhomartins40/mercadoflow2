# PDV2Cloud - Guia de Implantação Empresarial

Este guia descreve como implantar o PDV2Cloud Agent em múltiplas máquinas em ambiente corporativo.

## Instalação Silenciosa

### Método 1: Instalação com Parâmetros de Linha de Comando

```powershell
PDV2Cloud-Setup-Silent.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART `
    /APIKEY="pdv2_SuaChaveAquiBase64..." `
    /WATCHPATHS="C:/SAT/XML;C:/NFe/Emitidas" `
    /APIURL="https://mercadoflow.com"
```

#### Parâmetros Disponíveis:

| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| `/VERYSILENT` | Instalação completamente silenciosa | Obrigatório |
| `/SUPPRESSMSGBOXES` | Suprime mensagens de erro | Recomendado |
| `/NORESTART` | Não reinicia o computador | Recomendado |
| `/DIR="path"` | Diretório de instalação customizado | `/DIR="D:\Apps\PDV2Cloud"` |
| `/APIKEY="..."` | Chave de API do MercadoFlow | `/APIKEY="pdv2_..."` |
| `/WATCHPATHS="..."` | Pastas para monitoramento (separadas por `;`) | `/WATCHPATHS="C:/SAT/XML;C:/NFe"` |
| `/APIURL="..."` | URL da API (padrão: https://mercadoflow.com) | `/APIURL="https://api.custom.com"` |
| `/LOG="path"` | Arquivo de log da instalação | `/LOG="C:\Temp\install.log"` |

### Método 2: Implantação via GPO (Group Policy)

1. **Preparar o pacote:**
   ```powershell
   # Copiar instalador para share de rede
   Copy-Item PDV2Cloud-Setup-Silent.exe \\servidor\deploy\PDV2Cloud\
   ```

2. **Criar script de instalação (deploy.ps1):**
   ```powershell
   $installer = "\\servidor\deploy\PDV2Cloud\PDV2Cloud-Setup-Silent.exe"
   $apiKey = "pdv2_SuaChaveEmpresa..."
   $watchPaths = "C:/SAT/XML;C:/NFe/Emitidas"

   Start-Process -FilePath $installer -ArgumentList @(
       "/VERYSILENT",
       "/SUPPRESSMSGBOXES",
       "/NORESTART",
       "/LOG=C:\Windows\Temp\pdv2cloud-install.log",
       "/APIKEY=$apiKey",
       "/WATCHPATHS=$watchPaths"
   ) -Wait
   ```

3. **Configurar GPO:**
   - Group Policy Management Console → Criar novo GPO
   - Computer Configuration → Policies → Windows Settings → Scripts → Startup
   - Adicionar deploy.ps1
   - Aplicar a OUs desejadas

### Método 3: Implantação via SCCM/Intune

**SCCM Package:**
```
Program Command Line:
PDV2Cloud-Setup-Silent.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /APIKEY="pdv2_..." /WATCHPATHS="C:/SAT/XML"

Install Behavior: Install for system
Logon Requirement: Whether or not a user is logged on
Run: Hidden
```

**Intune Win32 App:**
```powershell
# Install command:
PDV2Cloud-Setup-Silent.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG="C:\Windows\Temp\pdv2cloud.log" /APIKEY="%APIKEY%" /WATCHPATHS="%WATCHPATHS%"

# Uninstall command:
"C:\Program Files\PDV2Cloud\unins000.exe" /VERYSILENT

# Detection rule:
File exists: C:\Program Files\PDV2Cloud\service\main.py
Service exists: PDV2CloudAgent
```

## Configuração Centralizada

### Opção 1: Configuração pré-instalada via GPO

```powershell
# Criar config.json centralizado
$configContent = @"
{
  "api_url": "https://mercadoflow.com",
  "api_key_encrypted": "",
  "watch_paths": ["C:/SAT/XML", "C:/NFe/Emitidas"],
  "poll_interval_seconds": 10,
  "retry_interval_minutes": 5,
  "healthcheck_enabled": true,
  "healthcheck_port": 8765
}
"@

# Distribuir via GPO Preferences
# Computer Configuration → Preferences → Windows Settings → Files
# Source: \\servidor\config\pdv2cloud-config.json
# Destination: C:\ProgramData\PDV2Cloud\config.json
```

### Opção 2: Configuração via Registry

```powershell
# Definir chave de API via Registry (requer extensão futura)
New-ItemProperty -Path "HKLM:\SOFTWARE\PDV2Cloud" `
    -Name "ApiKey" `
    -Value "pdv2_..." `
    -PropertyType String `
    -Force
```

## Monitoramento Centralizado

### Health Check Remoto

```powershell
# Verificar status do agente remotamente
$computers = Get-ADComputer -Filter * -SearchBase "OU=PDV,DC=empresa,DC=com"

foreach ($computer in $computers) {
    $status = Invoke-WebRequest -Uri "http://$($computer.Name):8765/health" -UseBasicParsing
    $data = $status.Content | ConvertFrom-Json

    Write-Host "$($computer.Name): $($data.online ? 'Online' : 'Offline')"
}
```

### Coleta de Logs Centralizada

```powershell
# Script para coletar logs de todos os agentes
$logShare = "\\servidor\logs\pdv2cloud"
$computers = Get-Content "computers.txt"

foreach ($computer in $computers) {
    $remotePath = "\\$computer\C$\ProgramData\PDV2Cloud\logs\agent.log"
    $localPath = "$logShare\$computer-agent.log"

    if (Test-Path $remotePath) {
        Copy-Item $remotePath $localPath
    }
}
```

## Troubleshooting Empresarial

### Verificar instalação em massa

```powershell
$computers = Get-Content "computers.txt"

foreach ($computer in $computers) {
    $service = Get-Service -ComputerName $computer -Name "PDV2CloudAgent" -ErrorAction SilentlyContinue

    if ($service) {
        Write-Host "$computer : $($service.Status)" -ForegroundColor Green
    } else {
        Write-Host "$computer : NOT INSTALLED" -ForegroundColor Red
    }
}
```

### Desinstalação em massa

```powershell
Invoke-Command -ComputerName (Get-Content computers.txt) -ScriptBlock {
    & "C:\Program Files\PDV2Cloud\unins000.exe" /VERYSILENT
}
```

## Segurança Empresarial

### Gerenciamento de Chaves de API

**Recomendação:** Gerar uma chave de API única por loja/filial, não por máquina.

```
Loja 01 - Matriz: pdv2_matriz_abc123...
Loja 02 - Filial Sul: pdv2_filial_sul_def456...
Loja 03 - Filial Norte: pdv2_filial_norte_ghi789...
```

### Criptografia de Chaves

As chaves são criptografadas automaticamente no primeiro uso e armazenadas em:
- `C:\ProgramData\PDV2Cloud\config.json` (campo `api_key_encrypted`)
- Chave de criptografia: Windows DPAPI (Data Protection API)

### Firewall Corporativo

**Regras necessárias:**

```powershell
# Permitir saída HTTPS para API
New-NetFirewallRule -DisplayName "PDV2Cloud API" `
    -Direction Outbound `
    -Action Allow `
    -Protocol TCP `
    -RemotePort 443 `
    -RemoteAddress "mercadoflow.com"

# Permitir health check local (opcional)
New-NetFirewallRule -DisplayName "PDV2Cloud Health Check" `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8765
```

## Manutenção

### Atualização em Massa

```powershell
# Deploy de nova versão
$computers = Get-Content "computers.txt"
$newInstaller = "\\servidor\deploy\PDV2Cloud-Setup-Silent-v2.exe"

foreach ($computer in $computers) {
    # Parar serviço
    Get-Service -ComputerName $computer -Name "PDV2CloudAgent" | Stop-Service

    # Copiar novo instalador
    Copy-Item $newInstaller "\\$computer\C$\Temp\"

    # Executar atualização
    Invoke-Command -ComputerName $computer -ScriptBlock {
        Start-Process "C:\Temp\PDV2Cloud-Setup-Silent-v2.exe" `
            -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" `
            -Wait
    }
}
```

## Licenciamento e Suporte

Para implantações empresariais (>10 máquinas), entre em contato:
- Email: enterprise@mercadoflow.com
- Telefone: (11) 9999-9999

**Benefícios Enterprise:**
- Suporte prioritário 24/7
- Gestão centralizada de chaves
- Dashboard de monitoramento em tempo real
- SLA de 99.9% de uptime
