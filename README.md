# PDV2Cloud

Plataforma completa para coleta e analise de dados de vendas de supermercados, com agente desktop (servico Python + instalador) e plataforma web (API + frontend).

## Estrutura
- `pdv2cloud-agent/` agente desktop (servico Python + instalador)
- `pdv2cloud-config/` interface Electron/React para configuracao
- `backend/` API Spring Boot
- `frontend/` app web React
- `scripts/` automacoes de build e deploy
- `docs/` documentacao

## Requisitos
- Node.js 18+
- Java 17+
- Maven 3.9+
- Docker (para deploy)
- Python 3.11+ (agente)

## Rodar local (API)
1. `cd backend`
2. `mvn spring-boot:run -Dspring-boot.run.profiles=dev`

API: `http://localhost:8080`
Swagger: `http://localhost:8080/swagger-ui/index.html`

## Rodar local (frontend)
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Deploy com Docker
`./scripts/deploy.ps1`

## Agente Windows
1. Copie `pdv2cloud-agent/config/config.json.template` para `C:/ProgramData/PDV2Cloud/config.json`
2. Ajuste `api_url`, `api_token`, `market_id` e `hmac_secret` (mesmo valor do backend)
3. Baixe os XSDs: `pdv2cloud-agent/scripts/download_xsd.ps1`
4. Rode o servico: `python pdv2cloud-agent/service/windows_service.py install`

## Documentos
- Arquitetura: `docs/architecture.md`
- Deploy: `docs/deploy.md`
- API: `docs/api.md`
- Troubleshooting: `docs/troubleshooting.md`
- Manual do usuario: `docs/user-manual.md`
- Backup: `docs/backup.md`
