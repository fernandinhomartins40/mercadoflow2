# PDV2Cloud Agent - Deploy Instructions

## Overview

O instalador do agente desktop (PDV2Cloud-Setup.exe) **NÃO** é versionado no Git devido ao seu tamanho (259 MB). Em vez disso, ele é:

1. **Buildado localmente** no Windows
2. **Enviado manualmente** para a VPS
3. **Servido** pela API backend para download pelos usuários

## Build Local do Instalador (Windows)

### Pré-requisitos

- Windows 10/11
- PowerShell
- Inno Setup 6: [Download aqui](https://jrsoftware.org/isdl.php)

### Passos

```powershell
# 1. Navegue até o diretório de scripts
cd pdv2cloud-agent\scripts

# 2. Execute o script de build
powershell -ExecutionPolicy Bypass -File build-installer.ps1

# 3. Verifique o instalador gerado
ls ..\installer\Output\PDV2Cloud-Setup.exe
ls ..\installer\Output\PDV2Cloud-Setup.exe.sha256
ls ..\installer\Output\PDV2Cloud-Setup.exe.meta.json
```

O instalador será gerado em:
```
pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe
pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.sha256
pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.meta.json
```

## Upload para VPS

### Via SCP (Recomendado)

```bash
# Upload do instalador
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/

# Upload do checksum
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.sha256 \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/

# Upload do metadata (opcional, mas recomendado para /version)
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.meta.json \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/
```

### Via SFTP/FileZilla

1. Conecte-se via SFTP:
   - Host: `72.60.10.112`
   - User: `root`
   - Password: `[VPS_PASSWORD]`

2. Navegue até:
   ```
   /root/mercadoflow-web/pdv2cloud-agent/installer/Output/
   ```

3. Faça upload dos arquivos:
   - `PDV2Cloud-Setup.exe`
   - `PDV2Cloud-Setup.exe.sha256`
   - `PDV2Cloud-Setup.exe.meta.json` (opcional, recomendado)

## Verificação na VPS

Após o upload, verifique se o instalador está disponível:

```bash
# SSH na VPS
ssh root@72.60.10.112

# Execute o script de verificação
bash /root/mercadoflow-web/deploy/check-installer.sh
```

## Workflow CI/CD

O workflow de deploy (`deploy-pdv2cloud-web.yml`) automaticamente:

1. ✅ Faz sync do código para VPS (exceto o .exe)
2. ✅ Executa `build-installer-vps.sh` que:
   - Verifica se o instalador existe
   - Gera/atualiza o checksum SHA256
   - Confirma que está acessível para download

3. ✅ Se o instalador não existir, apenas mostra um aviso (não falha o deploy)

## Download pelos Usuários

Após o upload, o instalador fica disponível em:

### API Endpoints
```
GET https://mercadoflow.com/api/v1/downloads/agent-installer
GET https://mercadoflow.com/api/v1/downloads/agent-installer/info
GET https://mercadoflow.com/api/v1/downloads/agent-installer/version
```

### Interface Web
```
https://mercadoflow.com/download-agente
```

## Atualizando o Instalador

Quando houver uma nova versão:

1. **Build local** com `build-installer.ps1`
2. **Upload** para VPS com `scp`
3. **Verificar** com `check-installer.sh` na VPS
4. ✅ Pronto! Usuários verão a nova versão automaticamente

## Estrutura de Arquivos na VPS

```
/root/mercadoflow-web/
├── pdv2cloud-agent/
│   ├── installer/
│   │   └── Output/
│   │       ├── PDV2Cloud-Setup.exe      ← Instalador (não versionado)
│   │       └── PDV2Cloud-Setup.exe.sha256 ← Checksum
│   └── scripts/
│       ├── build-installer.ps1          ← Build local (Windows)
│       └── build-installer-vps.sh       ← Verificação na VPS
└── deploy/
    └── check-installer.sh               ← Script de verificação
```

## Troubleshooting

### "Installer not found" na API

**Causa:** Instalador não foi enviado para VPS ainda

**Solução:**
```bash
# 1. Build local
powershell -ExecutionPolicy Bypass -File build-installer.ps1

# 2. Upload para VPS
scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/
```

### Checksum inválido

**Causa:** Arquivo foi modificado ou corrompido

**Solução:**
```bash
# Regenerar checksum na VPS
ssh root@72.60.10.112
cd /root/mercadoflow-web/pdv2cloud-agent/installer/Output
sha256sum PDV2Cloud-Setup.exe | cut -d' ' -f1 > PDV2Cloud-Setup.exe.sha256
```

### Upload falha por timeout

**Causa:** Arquivo muito grande (259 MB)

**Solução:** Use `rsync` com compressão:
```bash
rsync -avz --progress \
    pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe \
    root@72.60.10.112:/root/mercadoflow-web/pdv2cloud-agent/installer/Output/
```

## Segurança

- ✅ Instalador **não versionado** no Git (evita histórico com binários grandes)
- ✅ Checksum SHA256 fornecido para validação de integridade
- ✅ Download via HTTPS (criptografado)
- ✅ Endpoint público (sem autenticação necessária para download)

## Backup

Recomendado manter cópia local do instalador:

```
backup/
└── PDV2Cloud-Setup-v1.0.0-20260128.exe
```

Nomeie com versão e data para rastreabilidade.
