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

### Addendum de logs — 2026-09-25T00:40:18Z

- Leitura sem conteúdo dos arquivos: `/app/logs` ocupava 12 KiB no backend e
  36 KiB no cron após o deploy. Ambos os containers usam o driver Docker
  `local` com limite de 20 MiB por arquivo e três arquivos.
- Não houve evidência suficiente para remover o appender JSON interno: a
  amostra é curta e logs podem atender auditoria e diagnóstico. Crescimento por
  dia e sobreposição de retenção continuam **NOT MEASURED**; nenhuma limpeza
  ou alteração de logs foi feita.

## Fase 10 — Bases Docker imutáveis

Status: VERIFIED em 2026-09-25. O run `36078753513` concluiu em 2m09s,
com builds em cache (backend 24s, frontend 24s, coletores 17s) e deploy em
1m28s.

- As imagens oficiais PostgreSQL e Nginx passaram de tags mutáveis para
  referências com tag e digest, usando os digests linux/amd64 efetivamente
  observados na VPS.
- A verificação pós deploy confirmou PostgreSQL e Nginx nas referências
  esperadas; PostgreSQL ficou saudável e `/health` respondeu `{"status":"ok"}`.
- Efeito esperado: um novo deploy não muda silenciosamente essas bases nem
  baixa camadas diferentes sob a mesma tag. Atualizações de segurança passam a
  ser uma mudança revisada de digest, com teste e rollback explícitos.
- Rollback: restaurar as referências anteriores pelo commit `3d3b614` revertido
  ou pelo Compose anterior; não há alteração de volume PostgreSQL, schema ou
  dados.

## Fase 11 ? Migra??o do destino de deploy para srv953808

Status: VERIFIED em 2026-09-25. O commit `1f5babc` mudou o destino do workflow
para `72.60.10.112` e fixou a chave p?blica SSH Ed25519 apresentada pelo host.
O run `36079512923` concluiu com sucesso: valida??o de migrations (7 s), builds
independentes de backend (15 s), frontend (16 s) e coletores (26 s), seguidos
de deploy (3 m 56 s). As imagens foram constru?das no GitHub Actions e
publicadas no GHCR; a VPS recebeu imagens por pull e n?o compilou a aplica??o.

- Valida??o SSH por Paramiko com a chave esperada em 2026-09-25T00:56:48Z:
  autentica??o como `root` aprovada, hostname `srv953808` e Docker dispon?vel.
- Baseline de leitura em 2026-09-25T00:57:44Z: host com 7,8 GiB de RAM total,
  3,9 GiB dispon?vel, swap desabilitada e disco raiz com 35/97 GiB utilizados.
  A carga observada foi 3,67/1,90/0,93; este ? um ?nico snapshot, portanto n?o
  representa pico nem permite inferir capacidade sustentada.
- O release MercadoFlow iniciou oito containers. No snapshot, backend estava
  saud?vel (410,3 MiB / 1 GiB), PostgreSQL saud?vel (569,4 MiB / 640 MiB) e
  cron consumia 92,28% de CPU (251,6 MiB / 640 MiB). O cron ? trabalho ativo;
  a amostra n?o autoriza reduzir seu limite.
- A VPS tamb?m hospeda servi?os de outros projetos. Eles permanecem fora do
  escopo do deploy e de qualquer otimiza??o MercadoFlow at? que sejam
  inventariados com seus respectivos consumidores e respons?veis.
- Aceite: run conclu?do, acesso SSH com chave validada e backend/PostgreSQL
  saud?veis no `docker ps` observado ap?s o deploy.
- Rollback: restaurar o commit de infraestrutura anterior e redeployar o
  conjunto de digests preservado em `.env.previous`; volumes e dados n?o foram
  modificados por esta fase.

## Fase 12 ? Corre??o do loop do cron na VPS de destino

Status: VERIFIED em 2026-09-25. O cron `mercadoflow-cron` reiniciava em loop
por falha de bootstrap do perfil `production,jobs`: a configura??o de seguran?a
web era exclu?da, enquanto controllers e `AuthService` ainda eram instanciados.
A amostra registrou mais de 500 rein?cios e at? 195% de CPU em uma VPS de
2 vCPU, sem evento OOM.

- `060b457` exclui controllers HTTP do perfil `jobs`; `ddcc951` exclui tamb?m
  `AuthService`, que ? consumidor exclusivo desses controllers. O perfil de
  jobs voltou a usar `web-application-type: none`; backend HTTP continua com o
  perfil complementar `!jobs` e todas as rotas.
- Ap?s o deploy de `ddcc951`, em 2026-09-25T03:25:23Z, o container novo tinha
  `restarts=0`, `running=true`, `oom=false`, um marcador de startup completo e
  zero marcadores `APPLICATION FAILED TO START`. O gate `/health` do backend
  respondeu `{"status":"ok"}`.
- Snapshot p?s-estabiliza??o: cron 0,15% CPU e 337,9 MiB/640 MiB; backend
  0,17% CPU e 384,2 MiB/1 GiB; PostgreSQL 3,40% CPU e 288,5 MiB/640 MiB.
  Esta medi??o ? pontual e n?o representa pico de jobs.
- Rollback: reverter `ddcc951` e `060b457`, depois redeployar os digests
  anteriores. N?o houve migration, altera??o de volume ou exclus?o de dados.

## Fase 13 ? Baseline operacional da VPS srv953808

Status: VERIFIED (snapshot de 2026-09-25T03:25Z; n?o representa pico).

- Host x86_64 com 2 vCPU, 7,8 GiB de RAM, swap desabilitada e raiz ext4 com
  35/97 GiB utilizados (37%). Docker reportou 7,44 GiB de imagens, 5,61 GiB de
  volumes e zero build cache local; imagens e volumes n?o s?o candidatos a
  remo??o com esta evid?ncia.
- A persist?ncia MercadoFlow observada ocupa 12 GiB em `data/` e 5,0 GiB no
  volume PostgreSQL. S?o caminhos montados por servi?os ativos; nenhuma
  limpeza, prune ou altera??o de reten??o foi executada.
- No PostgreSQL havia 11 conex?es em observa??o, abaixo do limite de 50. N?o
  h? evid?ncia de satura??o para reduzir pools ou `max_connections`.
- `vmstat` registrou 49?83% idle na janela curta e zero swap-in/out. PSI de
  CPU tinha `some avg300=34,30`; como a VPS hospeda outros projetos, n?o se
  atribui esse valor ao MercadoFlow. PSI de mem?ria e I/O foi baixo no instante
  observado. Pico, p95/p99, throughput, lat?ncia e taxa de crescimento seguem
  NOT MEASURED.

## Fase 14 ? Auditoria de persist?ncia, logs e refer?ncias de cat?logo

Status: AUDITED em 2026-09-25; qualquer limpeza permanece PENDING.

- `data/catalog/images` ocupa 12 GiB, com 174.733 arquivos; 159.372 t?m mais
  de 90 dias. O backend os exp?e em `/api/v1/catalog/images/**` e consegue
  restaurar imagens ausentes a partir de `product_enrichments`. Idade n?o prova
  orfandade e n?o foi executada exclus?o.
- A tabela `product_enrichments` tem 150.639 registros, 150.492 com chave de
  armazenamento e 147.997 chaves distintas. A diferen?a para a quantidade de
  arquivos ? somente um limite superior de candidatos; h? outras refer?ncias
  poss?veis em uploads e tabelas de ofertas.
- O volume PostgreSQL observado tem 5,0 GiB. Backups locais ocupam 1,5 GiB;
  dumps autom?ticos s?o validados com `pg_restore` e a rotina preserva um por
  dia por at? sete dias. Dumps hist?ricos com nomes especiais n?o s?o tocados.
- Logs Docker usam driver `local`, limitado a 20 MiB e tr?s arquivos por
  container. No instante observado, diret?rios de containers MercadoFlow
  estavam entre 44 e 76 KiB; n?o h? justificativa para reduzir reten??o.
- Aceite para uma futura limpeza: relat?rio dry run que reconcilie todos os
  caminhos do filesystem com cada refer?ncia persistida, per?odo de quarentena
  recuper?vel, verifica??o de URLs e rollback por restaura??o. Economia de
  disco esperada: NOT MEASURED at? essa reconcilia??o.

## Fase 15 — Prioridade de CPU, compressão e keep-alive

Status: IMPLEMENTADA e validada localmente em 2026-09-26; efeito na VPS
**NOT MEASURED** até a coleta pós-deploy.

- Evidência: nenhum serviço tinha quota ou peso de CPU (`cpu.max=max`). O cron
  chegou a 195% de CPU na VPS de 2 vCPU (loop de boot) e a 280-320% durante
  jobs, disputando CPU com backend, PostgreSQL e as outras aplicações do host.
  Nenhum proxy comprimia JS/CSS/JSON, os assets com hash eram revalidados a cada
  navegação, e o Nginx do host forçava `Connection: upgrade` em toda requisição
  (a aplicação não usa WebSocket), abrindo um TCP novo até a porta 3300.
- CPU (`docker-compose.vps.yml`): cron `cpus: 1.0` e `cpu_shares: 512`;
  coletores `cpus: 0.5` e `cpu_shares: 256`; backend e PostgreSQL sem teto e
  com peso 1024. Os jobs rodam em série numa única thread de agendamento, então
  1 vCPU não reduz paralelismo útil. Peso só age sob disputa.
- Cron ganhou `-XX:+ExitOnOutOfMemoryError`, como o backend.
- Frontend: `.gz` gerados no build (gzip -9) e servidos com `gzip_static`;
  `/assets/` com `Cache-Control: public, max-age=31536000, immutable` e
  `index.html` com `no-cache`. Medido no dist local: JS+CSS de 1.317.646 para
  338.801 bytes (-74%).
- Proxy da stack: gzip nível 4 para JSON da API (amostra de 15.317 → 2.346
  bytes) e keep-alive para backend/frontend (`keepalive_timeout 15s`, abaixo do
  keep-alive do Tomcat).
- Nginx do host: upstream `mercadoflow_stack_proxy` com keep-alive, sem
  `Upgrade/Connection: upgrade`. O deploy guarda a config anterior e a restaura
  se `nginx -t` falhar, para não deixar arquivo inválido no Nginx compartilhado.
- Backend: `server.tomcat.threads.max` 200 → 64 (`TOMCAT_MAX_THREADS`); o pool
  de banco tem no máximo 8 conexões.
- Validação local: `docker compose config` renderizou os limites; `nginx -t`
  aprovado nas três configs (stack, frontend, host HTTP e HTTPS); cadeia
  proxy → frontend/backend fake entregou asset com gzip único e íntegro, JSON
  comprimido, `/health` ok, SPA com fallback e 404 para asset inexistente.
- Aceite na VPS: deploy verde, `/health` ok, `docker inspect` com
  `NanoCpus`/`CpuShares` esperados, resposta HTTPS de `/assets/*.js` com
  `Content-Encoding: gzip` e cache imutável, zero reinício inesperado do cron.
- Rollback: reverter o commit e redeployar; nenhuma migration, volume ou dado
  é alterado.
