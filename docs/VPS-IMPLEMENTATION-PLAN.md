# Plano de implementação VPS e GHCR

## Objetivo

Construir as imagens da aplicação no GitHub Actions, publicar cada artefato no GHCR e fazer a VPS apenas baixar imagens por digest, preservar dados e iniciar os serviços.

## Fluxo implementado

```text
validate-migrations
        |
        +--> build-backend ------> GHCR digest
        +--> build-frontend -----> GHCR digest
        +--> build-collectors ---> GHCR digest
                                      |
                                      v
                                deploy na VPS
                         rsync de Compose/scripts/dados de runtime
                         docker login GHCR -> pull por digest -> compose up
```

## Fase 1 — Pipeline de imagens

Status: implementada localmente e validada por sintaxe.

- `build-backend`, `build-frontend` e `build-collectors` são jobs separados.
- Cada job publica uma tag de commit e entrega o digest ao job `deploy`.
- O deploy usa `imagem@sha256:...`; tags mutáveis não entram no Compose.
- Backend, frontend e coletores não são mais construídos na VPS.
- O instalador desktop fica preservado no deploy e seu build fica desativado por padrão.

## Fase 2 — Primeiro deploy não produtivo

Status: aguardando execução do GitHub Actions.

Pré-requisitos:

- O repositório deve permitir publicação no GitHub Packages para `GITHUB_TOKEN`.
- Configurar o secret `GHCR_PULL_TOKEN` com permissão mínima `packages:read` para a VPS baixar imagens privadas, se os pacotes não forem públicos.
- Manter `VPS_PASSWORD` e os secrets já usados pelo deploy.

Aceite:

- Os três jobs de build publicam imagens e expõem digests.
- A VPS faz `docker pull` dos três digests sem executar build.
- PostgreSQL, migrations, healthcheck e serviços declarados sobem.
- `.env.previous` conserva as referências anteriores de imagem para rollback.

Rollback:

- Reexecutar o workflow com os digests anteriores registrados em `.env.previous` ou restaurar as três variáveis de imagem para os digests anteriores e executar o deploy.
- Volumes PostgreSQL, catálogo e ofertas não são removidos nem recriados.

## Fase 3 — Medição

Status: pendente do primeiro deploy.

- Medir tempo dos jobs, bytes das imagens, uso de disco, `docker stats`, health e duração total de deploy.
- Comparar com a baseline existente sem tratar tamanho lógico de imagem como disco físico.
- Ajustar RAM, CPU e concorrência somente após medições do ambiente alvo.
