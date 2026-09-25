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

## Fase 6 — Base runtime Alpine

Status: VERIFIED em 2026-09-25. O run `36076402951` publicou a imagem, e a
VPS puxou o digest `sha256:8d55c46f…` antes de recriar os containers.

- O runtime Java passou de Ubuntu para Alpine, preservando `fontconfig`,
  `font-dejavu` e os binários estáticos de FFmpeg.
- A imagem caiu de 985,366,597 para 818,610,920 bytes: redução de
  166,755,677 bytes, aproximadamente 166 MB.
- Aceite na VPS: `java`, FFmpeg 9.0 e `fc-match SansSerif` responderam; o
  backend e PostgreSQL ficaram saudáveis, os oito serviços executaram e
  `/health` respondeu `ok`.
- Rollback: usar o digest Ubuntu anterior preservado em `.env.previous` e
  executar o deploy. Não há mudança de schema, volume ou dado persistente.

### Baseline pós Alpine

- Em `2026-09-25T00:17:50Z`, o host tinha 11 GiB disponíveis e swap de
  149 MiB/2 GiB. Backend: 381.4 MiB/1 GiB; cron: 51.11 MiB/640 MiB;
  PostgreSQL: 33.34 MiB/640 MiB; banco com oito conexões observadas.
- O cron consumia 152.28% de CPU, então esta amostra prova execução de job,
  não repouso. Não há série de pico equivalente para autorizar reduzir limites
  de heap, pool ou memória sem risco de regressão.

## Fase 7 — Cache de build no GitHub Actions

Status: VERIFIED em 2026-09-25. O run `36077401108` concluiu com sucesso em
3m28s: validação 6s, backend 1m36s, frontend 50s, coletores 30s e deploy 1m39s.

- Cada job de imagem agora inicializa seu próprio Buildx antes de usar o cache
  `type=gha`; isso torna o cache compatível com o builder usado no GitHub Actions.
- A execução publicou os três artefatos no GHCR e o deploy aplicou seus digests
  imutáveis na VPS. Não houve build de aplicação na VPS.
- Aceite: os três builds e o deploy concluíram; o pipeline não apresentou o erro
  anterior de backend de cache incompatível.
- Rollback: reverter o commit `508fe14`; os digests anteriores continuam
  preservados em `.env.previous` para a aplicação na VPS.

## Fase 8 — Reuso de dependências Maven no build

Status: VERIFIED em 2026-09-25. O run `36077791283` concluiu com sucesso em
3m37s: validação 7s, backend 1m45s, frontend 20s, coletores 27s e deploy 1m39s.

- O Dockerfile baixa o grafo Maven a partir de `pom.xml` em uma camada anterior
  à cópia de `src`. Alterações de código não invalidam essa camada enquanto as
  dependências e plugins permanecerem os mesmos.
- A primeira execução criou a camada, compilou o JAR, publicou os três digests
  no GHCR e aplicou-os na VPS sem build local ou remoto na VPS.
- Aceite: jobs de build e deploy concluídos com sucesso; artefato backend
  iniciou pela sequência de deploy e healthcheck existente.
- Métrica esperada: o próximo build que altere apenas `backend/src` deve
  reaproveitar a camada Maven. A economia de tempo ainda está NOT MEASURED,
  pois este foi o primeiro build após a criação da camada.
- Rollback: reverter o commit `ad1dafd` e redeployar o digest anterior de
  backend preservado em `.env.previous`; não há mudança de schema ou volume.

## Fase 9 — Gate de saúde e baseline efetivo da VPS

Status: VERIFIED em 2026-09-25. A correção `335588d` foi validada localmente
com `nginx -t` e implantada no run `36078366017`, concluído em 2m06s.

- O proxy agora envia `GET /health` para o endpoint `/health` do backend. Antes,
  a rota caía no fallback do frontend e devolvia `index.html` com HTTP 200,
  permitindo um falso positivo no gate de deploy.
- Após o deploy, a VPS respondeu `HTTP 200`, `Content-Type: application/json`
  e corpo `{"status":"ok"}`. Backend e PostgreSQL estavam `running` e
  `healthy`.
- Baseline de leitura em `2026-09-25T00:35:42Z`: host com 15 GiB de RAM,
  11 GiB disponíveis e 161 MiB de swap em uso; disco raiz 64/194 GiB.
  Os oito containers MercadoFlow tinham limites cgroup v2 efetivos, zero
  eventos `oom`/`oom_kill` e zero uso de swap no momento observado.
- O backend usava 392,8 MiB de seu limite de 1 GiB; o cron estava executando
  trabalho (321,78% de CPU), portanto esta amostra não autoriza reduzir seus
  limites. Não havia quota de CPU declarada (`cpu.max=max`) nem throttling
  observado na amostra.
- O cache GHA foi comprovado no mesmo run: backend 24s, frontend 17s e
  coletores 23s. Isso mede reutilização de cache após a Fase 8; o deploy levou
  1m27s.
- Rollback: reverter `335588d` e redeployar o release anterior por digest;
  nenhum volume, migration ou dado foi alterado.
