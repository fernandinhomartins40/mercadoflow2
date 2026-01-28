# PDV2Cloud Desktop Agent

O PDV2Cloud Agent é um serviço Windows que monitora automaticamente pastas de arquivos XML de NFe, processa e transmite os dados para a nuvem PDV2Cloud.

## 📦 Componentes

- **Service** (`service/`): Serviço Windows Python que monitora pastas e processa XMLs
- **Installer** (`installer/`): Scripts de instalação e configuração do Inno Setup
- **Config UI** (`../pdv2cloud-config/`): Interface Electron para configuração e monitoramento

## 🔨 Build do Instalador

### Pré-requisitos

1. **Inno Setup 6**: Baixe de [https://jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php)
2. **Python 3.11**: Embarcado no instalador
3. **Node.js 18+**: Para build da UI Electron

### Build Local

```powershell
# 1. Build da UI de configuração (Electron)
cd pdv2cloud-config
npm install
npm run build

# 2. Preparar arquivos de distribuição
# Certifique-se que a pasta dist/ contém:
# - python-embed/     # Python embarcado
# - service/          # Código do serviço
# - config-ui/        # UI Electron compilada

# 3. Build do instalador
cd ..\pdv2cloud-agent\scripts
powershell -ExecutionPolicy Bypass -File build-installer.ps1

# O instalador será gerado em:
# pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe
```

### Build Script

O script `scripts/build-installer.ps1` automatiza:
- Verificação de dependências (Inno Setup)
- Validação de arquivos de distribuição
- Atualização de versão no setup.iss
- Build com Inno Setup Compiler
- Geração de checksum SHA256

## 📤 Upload para VPS

Após gerar o instalador localmente, faça upload para a VPS:

```bash
# Upload do instalador
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/

# Upload do checksum
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.sha256 \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/
```

## 🌐 Download via Web

### API Endpoints

**Download do Instalador:**
```
GET https://mercadoflow.com/api/v1/downloads/agent-installer
Content-Type: application/octet-stream
```

**Informações do Instalador:**
```
GET https://mercadoflow.com/api/v1/downloads/agent-installer/info
Content-Type: application/json

Response:
{
  "filename": "PDV2Cloud-Setup.exe",
  "size": 271581184,
  "sizeFormatted": "259.00 MB",
  "lastModified": "2026-01-24 23:08:15",
  "lastModifiedTimestamp": 1737768495000,
  "sha256": "abc123...",
  "downloadUrl": "/api/v1/downloads/agent-installer"
}
```

**Versão do Instalador:**
```
GET https://mercadoflow.com/api/v1/downloads/agent-installer/version
Content-Type: application/json

Response:
{
  "version": "1.0.0",
  "status": "available"
}
```

### Interface Web

Os usuários podem baixar o instalador através do painel web:

```
https://mercadoflow.com/download-agente
```

Essa página fornece:
- Botão de download direto
- Informações do arquivo (tamanho, data, checksum)
- Instruções de instalação passo a passo
- Requisitos do sistema
- Documentação de uso

## 🔧 Instalação

### Como Usuário Final

1. Acesse `https://mercadoflow.com/download-agente` no painel web
2. Clique em "Download do Instalador"
3. Execute `PDV2Cloud-Setup.exe` como **Administrador**
4. Siga o assistente de instalação
5. Configure sua API Key na interface de configuração
6. O serviço iniciará automaticamente

### Instalação Manual do Serviço

Se o serviço não foi instalado automaticamente:

```powershell
# Execute como Administrador
& "C:\Program Files\PDV2Cloud\python\python.exe" `
  "C:\Program Files\PDV2Cloud\service\installer\service_installer.py" install
```

### Verificar Status do Serviço

```powershell
# Verificar se está instalado
sc query PDV2CloudAgent

# Iniciar serviço
net start PDV2CloudAgent

# Parar serviço
net stop PDV2CloudAgent

# Ver logs
Get-Content "C:\ProgramData\PDV2Cloud\logs\agent.log" -Tail 50
```

## 📁 Estrutura de Arquivos Instalados

```
C:\Program Files\PDV2Cloud\
├── python\                     # Python 3.11 embarcado
├── service\                    # Código do serviço
│   ├── main.py
│   ├── watcher.py
│   ├── parser.py
│   ├── transmitter.py
│   └── installer\
│       └── service_installer.py
└── config-ui\                  # Interface Electron

C:\ProgramData\PDV2Cloud\
├── config.json                 # Configuração do agente
├── status.json                 # Status de sincronização
├── logs\
│   └── agent.log              # Logs do serviço
└── queue\                      # Fila de processamento
    ├── pending\
    ├── processing\
    ├── error\
    └── dead_letter\
```

## 🔐 Segurança

- **API Key**: Cada mercado tem uma chave única gerada no painel web
- **HMAC Signature**: Todas as requisições são assinadas com HMAC-SHA256
- **HTTPS**: Comunicação criptografada
- **Encryption at Rest**: API Keys são armazenadas criptografadas localmente

## 🐛 Troubleshooting

### Serviço não inicia

```powershell
# Verificar se está instalado
sc query PDV2CloudAgent

# Se não estiver instalado, instalar manualmente
& "C:\Program Files\PDV2Cloud\python\python.exe" `
  "C:\Program Files\PDV2Cloud\service\installer\service_installer.py" install

# Ver logs de erro
Get-Content "C:\ProgramData\PDV2Cloud\logs\agent.log" -Tail 100
```

### Interface de configuração mostra "Serviço não instalado"

A UI agora detecta automaticamente e oferece um botão para instalar o serviço. Se falhar:

1. Execute a UI como Administrador
2. Clique em "Instalar Serviço"
3. Ou instale manualmente usando o comando acima

### "Configuração não carregada"

Verifique se o arquivo existe:
```powershell
Test-Path "C:\ProgramData\PDV2Cloud\config.json"
```

Se não existir, configure através da UI de configuração.

## 📝 Logs

Localização: `C:\ProgramData\PDV2Cloud\logs\agent.log`

Ver logs em tempo real:
```powershell
Get-Content "C:\ProgramData\PDV2Cloud\logs\agent.log" -Wait -Tail 50
```

## 🔄 Atualização

Para atualizar o agente:

1. Baixe a nova versão do instalador do painel web
2. Execute o novo instalador (ele desinstalará a versão antiga automaticamente)
3. Suas configurações serão preservadas

## 📞 Suporte

Para problemas ou dúvidas:
- Documentação: `https://mercadoflow.com/docs`
- Suporte: `support@mercadoflow.com`
