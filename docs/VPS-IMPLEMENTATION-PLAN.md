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

Status: VERIFIED em 2026-09-24. O run `36074455045` concluiu os três builds,
publicou os artefatos no GHCR e fez o deploy na VPS com sucesso.

Pré-requisitos:

- O repositório deve permitir publicação no GitHub Packages para `GITHUB_TOKEN`.
- Os pacotes GHCR criados pelo workflow devem permanecer vinculados a este repositório, para que o job `deploy` use seu `GITHUB_TOKEN` temporário com `packages:read` durante o `docker pull` na VPS.
- Manter `VPS_PASSWORD` e os secrets já usados pelo deploy.

Aceite:

- Os três jobs de build publicaram imagens e expuseram digests.
- A VPS fez `docker pull` dos três digests sem executar build.
- PostgreSQL, migrations, healthcheck e os oito serviços declarados subiram.
- `.env.previous` conserva as referências anteriores de imagem para rollback.

Rollback:

- Reexecutar o workflow com os digests anteriores registrados em `.env.previous` ou restaurar as três variáveis de imagem para os digests anteriores e executar o deploy.
- Volumes PostgreSQL, catálogo e ofertas não são removidos nem recriados.

## Fase 3 — Medição

Status: baseline coletada após o deploy, em `2026-09-24T23:51:06Z`.

- Host: 16 GiB RAM; 4.0 GiB usados, 11 GiB disponíveis; swap 132 MiB/2.0 GiB.
- Disco raiz: 60 GiB/194 GiB; Docker reportou 42.52 GB de imagens (19.62 GB
  reaproveitáveis) e 13.6 GB de build cache (11.59 GB reaproveitáveis).
- MercadoFlow: backend 429.4 MiB/1 GiB; cron 436.7 MiB/640 MiB durante o
  bootstrap; PostgreSQL 43.24 MiB/640 MiB; coletores 20-25 MiB; frontend e
  proxy cerca de 5 MiB cada. Health local respondeu `ok`.
- Não houve OOM registrado nas últimas 24 horas. O snapshot é pontual e não
  prova pico, média nem economia de disco físico.

## Fase 4 — Propriedade única dos agendamentos

Status: VERIFIED em 2026-09-25. O run `36075503043` compilou e publicou as
imagens no GitHub, fez pull por digest na VPS e concluiu o deploy com sucesso.

- Evidência: no baseline, `mercadoflow-cron` consumia 55.2% de CPU durante a
  inicialização e 436.7 MiB de RAM. Catálogo, reparo de imagens, importação web,
  expiração de pareamento e dunning podiam ser agendados no backend HTTP e no
  cron, pois não tinham perfil exclusivo.
- Mudança: jobs sem endpoint próprio passam a usar `@Profile("jobs")`. As
  rotas de pareamento e cobrança preservam seus serviços no backend; foram
  criados adaptadores de schedule exclusivos do perfil `jobs`.
- Aceite: backend executa sem esses schedulers; cron executa cada agenda uma
  vez; health, pareamento e operações administrativas de cobrança continuam
  disponíveis; nenhum job perde execução.
- Rollback: reverter este commit e redeployar os três digests anteriores. Não
  altera schema, volume, dados ou credenciais.

### Medição pós-deploy

- Em `2026-09-25T00:06:27Z`, backend estava saudável em 441.5 MiB e o cron
  em 243.7 MiB/640 MiB. A amostra capturou 280.24% de CPU no cron, portanto
  representa execução natural de manutenção, não repouso.
- O cron não registrou `Tomcat started`, `Tomcat initialized` nem threads
  `http-nio` nos últimos 10 minutos. O endpoint de health respondeu `ok`.
- O RSS do cron caiu de 394.5 MiB na amostra pós deploy anterior para 243.7
  MiB durante esta execução. Como são momentos de carga diferentes, a redução
  não é atribuída como economia definitiva; é uma hipótese a confirmar com
  séries comparáveis de repouso e pico.

## Fase 5 — Imagem runtime do backend

Status: VERIFIED em 2026-09-25. O run `36076086922` publicou a imagem e a VPS
fez pull por digest antes de recriar os serviços.

- A camada do pacote Ubuntu `ffmpeg` instalava dependências de codecs e render
  que elevavam a imagem a 1,196,303,624 bytes. Fontes e FFmpeg são necessários
  ao renderizador de ofertas e foram preservados.
- A imagem agora copia `ffmpeg` e `ffprobe` estáticos, versão 9.0, e mantém
  `fontconfig` e `fonts-dejavu-core` no runtime Java.
- Tamanho medido na VPS: 985,366,597 bytes, redução de 210,937,027 bytes
  (aproximadamente 211 MB) contra a imagem anterior. A diferença é o tamanho
  lógico da imagem; economia física depende das camadas compartilhadas.
- Aceite: `ffmpeg -version` respondeu versão 9.0 dentro do backend; os oito
  containers ficaram em execução e `/health` respondeu `ok`.
- Rollback: restaurar o digest anterior registrado em `.env.previous` e
  executar o deploy; volumes e schema não foram modificados.
