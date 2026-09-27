# Plano mestre de otimização e confiabilidade da VPS

**Data:** 2026-09-24 (America/Sao_Paulo)  
**Etapa:** Prompt 09 de `Otmização VPS.md` — consolidação e planejamento.  
**Stack e versoes:** HEAD baseline Spring Boot 3.2.5/Java 17/Maven + PostgreSQL/Hibernate/Flyway; o working tree atual contem candidato local Spring Boot 4.1.1/Java 17 (IMG-18), validado por suite e smoke DB e ainda nao publicado. React/Vite servidos por Nginx; workers Python; Compose; GitHub Actions/SSH e build na VPS conforme fluxo declarado. Runtime/release efetivo no host nao correlacionado. Nao presume Next.js, Prisma, Redis ou MinIO.
**Escopo executado:** leitura do inventário, baseline e oito auditorias indicadas pelo Prompt 09; nenhuma implementação, alteração de configuração, serviço, dado, migration, build/deploy ou operação destrutiva.  
**Estado:** OPT-01 possui snapshot read-only autenticado do host em 2026-09-24T21:36Z e novo handshake no mesmo fingerprint em 23:13Z, sem autenticacao nesta segunda checagem. O proprietario reporta a VPS reinstalada como nao produtiva; o snapshot observado mostrou 40 containers/8 projetos Compose de ownership/consumers desconhecidos, sem correlacao provada ao checkout. Workflow local aponta hostname verificado; release/servico deste checkout continua sem correlacao e coleta remota atual requer autenticacao. OPT-06 esta IN PROGRESS: IMG-20 e candidatos locais tem validacoes parciais; rollout, flows completos e metricas VPS seguem pendentes/NOT MEASURED. Nenhuma mudanca remota foi feita.

## 1. Gate de cobertura do inventário

O inventário contém **70 IDs de domínio**: `APP-*` 5, `CTR-*` 8, `PROC-*` 5, `JOB-*` 8, `DB-*` 5, `VOL-*` 2, `STO-*` 12, `BLD-*` 5, `DEP-*` 1, `CFG-*` 10, `EXT-*` 8 e `OBS-*` 1. IDs repetidos dentro de linhas de matriz não foram contados mais de uma vez. As oito auditorias mantêm IDs de achado separados, que preservam origem e não substituem os IDs do inventário.

| ID/área do inventário | Auditoria e evidência vinculada | Situação consolidada | Falta para fechar o gate |
|---|---|---|---|
| `APP-01..05` | `CONTAINER-AUDIT.md`, `RUNTIME-RESOURCE-AUDIT.md`, `APPLICATION-RUNTIME-AUDIT.md`; Compose, POM, package manifests, scripts | Fluxos estáticos analisados; uso VPS/clientes externos e consumo atuais não provados | Inventário de processo/consumer atual, telemetria de tráfego/jobs e reconciliação de releases |
| `CTR-01..08`, `PROC-01..05`, `JOB-01..08` | Container, runtime, aplicação e host audits; Compose/scripts | Declarados e rastreados; execução/estado atual parcialmente `BLOCKED` | IDs runtime ativos/parados, perfis, health/restart, timers, logs e processo/cgroup; jobs correlacionados por consumer |
| `DB-01..05` | `DATABASE-AUDIT.md`, `CONTAINER-AUDIT.md`; JPA, Hikari, migrations e backup scripts | Arquitetura/SQL estáticos examinados; database runtime/consumidores externos não reconciliados | Config efetiva, workload/conexões, schema/checksum aplicados, parâmetros, backups externos e restore isolado |
| `VOL-01..02`, `STO-01..12` | `STORAGE-DISK-AUDIT.md`, `VPS-HOST-AUDIT.md`; Compose, storage services, workflows e diretório local | Caminhos e semântica do código analisados; proprietário/tamanho/ACL/backup VPS não medidos | Reconciliar mounts com arquivos/referências/consumidores e política de retenção/backups |
| `BLD-01..05`, `DEP-01` | `DOCKER-IMAGE-AUDIT.md`, `DEPLOY-CICD-AUDIT.md`, `APPLICATION-RUNTIME-AUDIT.md` | Fluxo declarado lido; digest/arch/build remoto/runs/rollback atuais não confirmados | Proveniência commit→artefato→host, histórico Actions, caminho de release/rollback e capacidade no deploy |
| `CFG-01..10` | Runtime, imagem, banco, aplicação, host; Compose/YAML/Dockerfiles | Configuração declarada distinta da efetiva; maior parte das medidas runtime `NOT MEASURED` | Capturas redigidas de config ativa, cgroups/flags/pools/proxy/logging e telemetria em carga natural |
| `EXT-01..08` | Inventory e audits de container/runtime/deploy | Integrações e caminhos no código/workflows reconhecidos; atividade/config externa atual desconhecida | Reconciliar owners/consumidores e métricas agregadas de parceiros sem tokens/PII |
| `OBS-01` | Baseline + auditoria do host | Docker/host local não representa VPS; métricas de produção `NOT MEASURED` | Canal de leitura seguro e séries atuais de pico/idle/deploy, com versão, timestamp e tráfego |

### Gate

- Todos os 70 IDs do inventário estão cobertos por uma ou mais das oito auditorias; a matriz e os achados específicos guardam as relações por domínio acima. Isso verifica cobertura documental, não a operação efetiva da VPS.
- Os oito arquivos foram localizados e lidos: `CONTAINER-AUDIT.md`, `RUNTIME-RESOURCE-AUDIT.md`, `DOCKER-IMAGE-AUDIT.md`, `DATABASE-AUDIT.md`, `STORAGE-DISK-AUDIT.md`, `DEPLOY-CICD-AUDIT.md`, `APPLICATION-RUNTIME-AUDIT.md`, `VPS-HOST-AUDIT.md`.
- Lacunas críticas persistem em host/cgroup/processos, banco/consumidores externos, volumes/backup/restore, atualizações/rollback e tráfego. O checkout Windows, Docker Desktop e valores de setembro anteriores não são baseline atual da VPS.
- `NOT APPLICABLE` significa somente que a feature específica não está na arquitetura declarada examinada. Redis, MinIO/S3 e Next/Prisma podem ser N/A como componentes/removal candidates do repositório; isso não comprova ausência de instâncias externas no host.
- Consequentemente, o plano é **parcial e condicionado**: tarefas de evidência e testes descartáveis podem ser preparadas; decisões de tuning, mudança em dados, deploy e alegações de economia aguardam os gates descritos.

### Totais herdados das auditorias

| Auditoria | Itens | AUDITED | PENDING | BLOCKED | NOT APPLICABLE |
|---|---:|---:|---:|---:|---:|
| Container | 16 | 3 | 4 | 7 | 2 |
| Runtime resource | 14 | 2 | 6 | 5 | 1 |
| Docker image | 14 | 5 | 5 | 3 | 1 |
| Database | 15 | 4 | 3 | 8 | 0 |
| Storage/disk | 17 | 5 | 1 | 9 | 2 |
| Deploy/CI-CD | 16 | 9 | 2 | 5 | 0 |
| Application runtime | 14 | 6 | 2 | 5 | 1 |
| VPS host | 12 | 0 | 1 | 11 | 0 |
| **Total** | **118** | **34** | **24** | **53** | **7** |

## 2. Reconciliação de achados

Foram contados **118 achados**, cada um em apenas um destino. Destino `tarefa` mantém a oportunidade ou risco como trabalho verificável; uma tarefa `BLOCKED` não autoriza implementação. Não foram encontrados falsos positivos que pudessem ser descartados com segurança nem duplicatas que pudessem ser fundidos sem manter origem. Os sete itens N/A têm justificativa explícita abaixo.

| Auditoria | IDs de origem (intervalo inclusivo; todos sem lacunas) | Quantidade | Destino único |
|---|---|---:|---|
| Containers | `AUD-01..02` | 2 | `OPT-02` |
| Containers | `AUD-03, AUD-15` | 2 | `OPT-03` |
| Containers | `AUD-04` | 1 | `OPT-01` |
| Containers | `AUD-05, AUD-07, AUD-10..11, AUD-16` | 5 | `OPT-07` |
| Containers | `AUD-06, AUD-12` | 2 | `OPT-04` |
| Containers | `AUD-13..14` | 2 | `OPT-05` |
| Containers | `AUD-08..09` | 2 | NOT APPLICABLE — Redis declarado e MinIO/S3 no Compose não encontrados; presença/consumidores externos seguem sem prova |
| Runtime | `RSC-01..02, RSC-05..12` | 10 | `OPT-02` |
| Runtime | `RSC-03` | 1 | `OPT-03` |
| Runtime | `RSC-04, RSC-14` | 2 | `OPT-07` |
| Runtime | `RSC-13` | 1 | NOT APPLICABLE — Node heap de produção não se aplica ao frontend Vite→Nginx; uso em builds/desktop segue fora desse runtime |
| Imagens Docker | `IMG-01..12, IMG-14` | 13 | `OPT-06` |
| Imagens Docker | `IMG-13` | 1 | NOT APPLICABLE — Next.js/Prisma não pertencem à stack analisada |
| Banco | `DB-AUD-01..15` | 15 | `OPT-03` |
| Storage/disco | `STO-AUD-01..15` | 15 | `OPT-04` |
| Storage/disco | `STO-AUD-16` | 1 | NOT APPLICABLE — serviço MinIO/S3 não está declarado; storage local é usado e permanece necessário até prova funcional de alternativa |
| Storage/disco | `STO-AUD-17` | 1 | NOT APPLICABLE — otimização de cache `next/image` não se aplica a React/Vite/Nginx |
| Deploy/CI/CD | `DEP-AUD-01..16` | 16 | `OPT-05` |
| Runtime da aplicação | `APP-RT-AUD-01..12` | 12 | `OPT-02` |
| Runtime da aplicação | `APP-RT-AUD-14` | 1 | `OPT-07` |
| Runtime da aplicação | `APP-RT-AUD-13` | 1 | NOT APPLICABLE — SSR/WebSocket/SSE não estão declarados no fluxo SPA REST analisado; serviços externos invisíveis permanecem lacuna |
| Host VPS | `HOST-AUD-01..12` | 12 | `OPT-01` |
| **Total** |  | **118** | — |

**Equação de reconciliação:** 118 achados = **111 mapeados a tarefas + 0 duplicados + 0 falsos positivos + 7 NOT APPLICABLE + 0 bloqueados sem destino**. Status de execução `BLOCKED` está registrado nas tarefas, não significa que o achado foi omitido da reconciliação. Tarefas e achados são contagens diferentes: **7 tarefas** neste plano; 111 achados de origem mapeados a elas.

### Regras de atribuição às tarefas

As origens `AUD-*` são mapeadas individualmente conforme os intervalos na tabela anterior. Assim, cada origem tem um único destino: containers distribuídos entre `OPT-01/02/03/04/05/07`; runtime entre `OPT-02/03/07`; images em `OPT-06`; banco em `OPT-03`; storage em `OPT-04`; deploy em `OPT-05`; application runtime em `OPT-02/07`; host em `OPT-01`. Os sete N/A são exceções explícitas e não recebem tarefa. Não há referências duplicadas ou sobrepostas nesse mapeamento.

## 3. Backlog de tarefas

Benefícios são hipóteses até medição comparável. “Aceite futuro” exige qualidade funcional/segurança junto à métrica de recursos; redução de limites configurados ou de bytes lógicos de imagens não prova redução do consumo real.

| ID | IDs de origem | Problema / evidência | Arquivos / serviços | Solução planejada | Benefício esperado (hipótese) / métrica e unidade | Risco | Dependências | Teste e critério de aceite | Rollback | Escopo autorizado | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `OPT-01` | `HOST-AUD-01..12`; `AUD-04` | Baseline read-only mais recente via Paramiko com fingerprint validado em `srv953800.hstgr.cloud`: x86_64, 4 vCPU, 16 GB RAM, 2 GB swap, raiz 194G/30%, 40 containers (38 running), oito projetos Compose; filtros/paths convencionais do checkout retornaram ausentes. O host e a identidade estao confirmados; a release/servico/consumidores do MercadoFlow continuam sem correlacao. Snapshot em 2026-09-24T21:36Z, nao e pico nem coleta atual. | VPS Linux, Docker/cgroups, processos, proxy, journal/logs, PostgreSQL e volumes | Preparar coleta read-only via canal seguro, confirmar host/data/versão, coletar RAM/caches/swap/PSI, CPU/steal/iowait, I/O/inodes, Docker/processos/limites efetivos e séries existentes de pico/deploy/OOM; redigir segredos/PII. | Benefício direto: reduzir incerteza e evitar tuning errado; métricas medidas com unidades, duração, versão, carga e fonte; economia **NOT MEASURED** até comparação. | Acesso privilegiado; overhead de varredura; output pode conter segredos/PII; snapshot idle não estima pico. | Canal de leitura SSH/observabilidade; consentimento operacional para o host correto; ferramentas já existentes. | Reconcilia CTR-01..08 e vizinhos observados; separa config declarada, aplicação efetiva e consumo real; registra amostras idle e picos naturais e nenhuma alteração de estado. | Encerrar sessão e descartar apenas coleta temporária; nenhuma alteração persistente. | Somente evidência read-only e documentos. Não autoriza tuning, restart, deploy, dump, prune ou limpeza. | **BLOCKED** somente para correlacao do checkout/release, consumers e estado atual de persistencia; baseline agregada do host foi coletada e a identidade confirmada. |
| `OPT-02` | `AUD-01..02`; `RSC-01..02, RSC-05..12`; `APP-RT-AUD-01..12`; components `CTR-02/04/06..08`, `JOB-01..05` | Scheduler duplicado potencial, jobs e workers permanentes, async e subprocessos; fluxo estático mostra consumers, mas schedules/execuções/overlap atuais e freshness não medidos. | `backend/src/main/java/**/job`, serviços `@Scheduled`/`@Async`, Compose backend/cron/collectors, scripts catalog/state_prices | Criar mapa job→owner/perfil→consumer/dado→horário/checkpoint/idempotência/lock; obter duração/frequência natural; propor isolamento/cadência/on-demand apenas se substituto durável e SLO comprovados. | Possível reduzir RSS idle, CPU/I/O e trabalho duplicado; RSS MiB, CPU-segundos, execuções por schedule, atraso/backlog/idade, query/erro e freshness. Todos NOT MEASURED hoje. | Desativação/agendamento errado pode perder atualizações, billing/dunning/analytics, duplicar efeitos externos, interromper crawler e quebrar checkpoint/tenant isolation. | `OPT-01`; donos dos fluxos externos; staging com fixtures equivalentes; resultado reproduzível. | Em staging, injetar falha/retomada/SIGTERM, provar exatamente as execuções esperadas, nenhum efeito duplicado/perdido, output/cursor equivalente e sem regressão de freshness/p95/backlog. | Reativar perfil/schedule anterior; reprocessamento somente após checar idempotência/cursor; manter DB/filesystem. | Análise e testes isolados após aprovação da etapa correspondente. Remoção/consolidação de container ainda não autorizada por este plano. | **BLOCKED** para comportamento runtime; preparação estática **PENDING**. |
| `OPT-03` | `AUD-03, AUD-15`; `RSC-03`; `DB-AUD-01..15`; banco `CTR-01`, consumidores `CTR-02/04`, `DB-01..05` | PG é persistência crítica; settings/pools declarados vs efetivos, queries e consumers compartilhados não foram conciliados. Tuning por hipótese pode causar OOM, query regression ou afetar outros DBs. | `docker-compose.vps.yml`, `application*.yml`, Hikari, repositories/jobs, Flyway, PostgreSQL e migrações | Após leituras read-only de settings/conexões/waits/índices e estatísticas agregadas, selecionar uma hipótese por vez; analisar query em staging, sem consolidar banco de clientes. Preservar RLS/tenant context e seed/migration order. | Possível reduzir CPU/I/O/conexões ou latência; vCPU%, connections, pool wait, p50/p95, buffers/temp bytes, lock time, DB RSS e volume bytes. Não estimar ganho sem perfil. | Query/migration/índice afeta dados duráveis, RLS/isolamento, escrita e outros consumidores; EXPLAIN ANALYZE em produção evitado; downtime em mudança de parâmetro. | `OPT-01`; mapa de consumers externos e owner; snapshot/restore íntegro fora do host; clone staging com schema/dados representativos anonimizados. | Regressão limite definida antes; plano/resultado funcional idêntico; nenhuma violação tenant/RLS; connections/waits/OOM/latência dentro da faixa acordada; compatibilidade N/N-1 de migrations. | Reverter release/config ou migration compensatória testada; restore só em DB isolado e procedimento aprovado; nunca DROP/TRUNCATE operacional ad hoc. | Apenas leitura, revisão e ensaio em banco efêmero nesta etapa do plano. Qualquer migration/tuning real requer prompt e janela próprios. | **BLOCKED** para decisão operacional; teste de staging **PENDING**. |
| `OPT-04` | `AUD-06, AUD-12`; `STO-AUD-01..15` | Catálogo/imagens/uploads/ofertas, logs, backups, cache/build e temporários têm semânticas diferentes. Conteúdo remoto, ownership, references, retenção e restore não medidos. Deploy rsync tem risco estático contra `data/offers`; não operar enquanto caminho não reconciliado. | Bind `data/catalog`, `data/offers`, Postgres volume, logs e backup host, upload/render/ffmpeg | Mapear path→owner/consumidor→persistência/DB reference→backup/retention→reconstruibilidade. Medir bytes/inodes/IO; dry-run apenas em clone para validar sync exclusion; ensaiar restore de DB+files fora de produção. Não limpar candidatos no plano. | Possível reduzir I/O/espaço somente após classificação segura; bytes físicos por filesystem, inodes, crescimento/day, file reference coverage, restore RTO/RPO, IO latency. Ganho atual NOT MEASURED. | Perda irreversível de dados/URLs/client uploads, expiração de fonte externa, vazamento de PII em backups, impacto de I/O e restore. | `OPT-01`; mapa de URLs/consumers; backups e storage isolado; produto/owner aprova retenção e acesso. | Restauração isolada valida rotas/arquivos/URLs, tenants, checksums e apps; dry-run demonstra nenhuma exclusão dos mounts persistentes; backup/restore atinge RPO/RTO. | Manter originais/volumes; reverter caminho/resolver com cópia verificada; não usar exclusão como rollback. | Auditoria, preflight e teste em cópia isolada. Nenhuma exclusão/cleanup/destructive operation autorizada. | **BLOCKED** para dados VPS/restore; mapa estático **AUDITED**. |
| `OPT-05` | `AUD-13..14`; `DEP-AUD-01..18` | Pipeline declarado executa sync/backup/build na VPS, migrations no startup e health checks. A reconciliacao read-only confirmou hostname/fingerprint, mas nao release/digest/commit do checkout no host; caminhos convencionais e filtros de nomes/imagens/projeto estavam ausentes no ultimo snapshot. DEP-AUD-17/18 agora hardenizam localmente host key, exclusoes persistentes/cleanup e build da imagem compartilhada dos coletores. Sem Actions run; secret/runner, backup/restore, downtime e recursos de deploy seguem NOT VERIFIED/NOT MEASURED. | `.github/workflows/*`, `deploy/deploy-web.sh`, Compose, registry/SSH, Nginx, Flyway, backup | Antes de alterar pipeline, medir fases de release natural e espaço/CPU/RAM/I/O simultâneos; modelar release imutável, verificação externa de UI/API e rollback compatível com migrations/seed. Primeiro proteger `data/offers` contra sincronização destrutiva. Secrets somente por store administrado e output redigido. | Menos competição/tempo na VPS se build for relocável; build minutos, CPU/mem peak, dump bytes/duração, downtime, p95/5xx, pull bytes, failure/rollback success. Benefício hipotético. | Mudança de arch/dependency/secret exposure, indisponibilidade, incompatibilidade schema, duplicação de jobs blue/green, perda de assets ou ficar sem release recuperável. | `OPT-01`, `OPT-04`, imagem multiarch/digest, registry auth e policy; staging com DB antigo/novo, restore isolado e release anterior acessível. | Pipeline falha fechado ao health externo; smoke UI/API/auth/download/crawler; migration/seed controlados; rollback de app demonstrado sem apagar volume; limites de regressão previamente acordados. | Deploy pelo digest/release anterior; schema compatível ou plano corretivo/restauração isolada; manter backup e conteúdo originais. | Planejamento e validação em staging. Não publica, não aciona workflow/deploy e não muda Secrets. | **BLOCKED** para execucao remota, provenance, secret/runner, persistencia/restore e rollback; workflow/YAML e build wiring locais **AUDITED**. |
| `OPT-06` | `IMG-01..12, IMG-14` | Três Dockerfiles e dependências de runtime examinados. Tags variáveis, context size/digest/arch/bytes compartilhados não medidos em VPS. ffmpeg, wget/fontes, seed/migration e script binds têm uso funcional ou risco específico. | Dockerfiles e `.dockerignore` backend/frontend/collectors, Compose images, build cache, workflows/artifacts | Medir build/context/reproducibilidade apenas em ambiente isolado; vincular commit/hash de script/digest/platform/SBOM; avaliar cache Maven e pinning; avaliar UID/caps/writable paths e pacote somente com equivalência de função. Nunca tratar `reclaimable` global como alvo de remoção. | Possível build mais rápido e menor superfície/armazenamento; context bytes, build time, logical/unique physical bytes, pull bytes, CVEs, RSS/startup. Sem ganho numérico hoje. | Breaking codecs/fonts/healthchecks, native arch, supply chain, root/write permissions, secrets em layers, perda de cache/rollback. | `OPT-01`, build isolado na arch alvo, staging DB/fixtures de render/PDF/MP4/API e scanner redigido. | Imagem roda como alvo homologado; health/api/db/migrations/seeds/collectors/assets multimídia equivalentes; sem secret findings; digest reproducible; rollback digest funciona; medir bytes físicos sem prune. | Restaurar digest/base/package context anterior; manter artifacts/cache e release anterior durante a janela; não usar tag mutable como rollback. | Somente build efêmero e revisão no escopo explicitamente aprovado; sem pull/deploy/cleanup produção. | **IN PROGRESS**; IMG-01 reverted/not adopted; IMG-04 audited; IMG-15..20 local candidates/changes scanned and smoke-tested. IMG-20 passes constrained loopback harnesses for state-price request/parse/import, dispatcher lifecycle with fixture runner, barcode API path with fixture source. Post-import VmRSS median: IMG-15 40,160 kB vs IMG-20 35,080 kB (-12.65%, local only). Live Spring/PostgreSQL auth/RLS/persistence, real providers, deploy digest/rollback, target/VPS acceptance and resource gains remain open. |
| `OPT-07` | `AUD-05, AUD-07, AUD-10..11, AUD-16`; `RSC-04, RSC-14`; `APP-RT-AUD-14` | Proxy/admin/security/rate limit/external clients e shutdown têm risco funcional/security; routes/tráfego/headers/consumers efetivos não validados em VPS. | Nginx host/container, SecurityConfig, rate limit, SuperAdmin UI/API, agent, Stripe/webhooks, clients/providers e shutdown | Mapear listener→proxy→route→auth/tenant→consumer; preservar limits, forwarded header trust e artefatos de admin. Medir aggregate routes/errors/concurrency; ensaiar auth e SIGTERM em staging. | Menor overhead/exposure só se preservada boundary; requests/s, p95, 401/403/429, open FDs, retries, thread/pool, graceful drain/stale work. | Mudança pode expor assets/admin, burlar rate limit, quebrar pairing/agent/webhooks, perder batch/checkpoint ou requests em shutdown. | `OPT-01`; owners dos consumidores externos; ambiente sandbox dos parceiros e testes anon/user/admin/tenant; sem credenciais reais no relatório. | Tests de role, CORS/TLS, trusted proxy/spoof, downloads/upload, client retry/signature, shutdown/recovery sem perda/duplicação; métricas dentro dos limites de regressão. | Restaurar proxy/policy/timeout anterior e rota de rollback; preservar dados/cursors e reconciliar requests antes de replays. | Revisão e staging apenas, sem firewall/TLS/auth ou serviço de produção alterado. | **BLOCKED** efetivo/consumers e **PENDING** testes isolados. |

## 4. Fases e primeira fase elegível

| Fase | Trabalho | Elegibilidade / gate |
|---|---|---|
| **Fase 0 — evidência segura** | `OPT-01` baseline operacional read-only; fechar caminho de persistência/deploy via `OPT-04` estático e logs existentes | **Primeira fase elegível quando existir canal de leitura autenticado e seguro.** Sem esse canal, pode-se preparar comandos/formatos redigidos em local, mas execução remota segue bloqueada. Nenhuma mudança de produção. |
| **Fase 1 — ensaios descartáveis e verificáveis** | Preparar staging/clones, backups restauráveis e harness para `OPT-02..07`; construir carga funcional comparável usando fixture não pessoal | Só depois de definir ambiente isolado, versão/digest/arch e acceptance thresholds. Proibido usar DB/volume de produção para o ensaio. |
| **Fase 2 — mudanças pequenas, observáveis e reversíveis** | Uma dimensão por release (p.ex. contexto/cache de build ou instrumentação leve somente se já aprovada); medir antes/depois | Cada mudança deve ter tarefa/escopo autorizado, baseline, rollback ensaiado e métricas de API/DB/jobs. Não começar com limites de RAM/CPU por soma teórica. |
| **Fase 3 — build/deploy** | Pipeline/artefato imutável, pull/build target architecture, migration/seed ordering, rollout e rollback | `OPT-04/05/06` fechadas; sync persistente protegido; cópia/restauração comprovada; UI+API smoke externo; capacidade concomitante demonstrada. |
| **Fase 4 — runtime/DB e opções arquiteturais** | Cadência/jobs, pools/consultas, filesystem lifecycle e eventual arquitetura de imagem/cache | Métricas representativas e consumer map; alterações isoladas, sem consolidar bancos de clientes; expansão arquitetural (Redis/S3/blue-green) somente com requisito/prova de benefício, não por padrão. |

### Aceite operacional e pontos de parada

- Comparar versão e carga equivalentes; etiquetar amostras com data/fuso, commit/digest, duração, requests/s e distribuição de endpoints, tamanho/atividade do catálogo e janela de jobs. Separar idle, pico natural, backup e deploy.
- Antes de cada mudança, registrar RSS/cgroup working set e peak, `MemAvailable`, cache/swap/PSI, CPU/steal/iowait/throttling, I/O/inodes, pool/conexões, p50/p95/p99, erros/throughput, OOM/restarts, fila/freshness e uptime. Indisponível permanece **NOT MEASURED**.
- Não declarar sucesso pela soma dos limites Compose, memória de boot, imagem lógica menor ou snapshot local. Exigir redução efetiva no recurso alvo e não regressão funcional/segurança.
- Definir thresholds com SLO/owner antes de teste: sem perda/duplicação de dados/jobs; sem falha RLS/tenant/auth; erros e latência sem regressão além do orçamento aprovado; fila dentro da freshness; zero OOM/restart inesperado; RPO/RTO cumpridos. Valores numéricos ainda **PENDING** porque SLO e baseline atuais não foram fornecidos/medidos.
- Stop imediato se houver perda de dados/cursor, 5xx/timeout acima do limite acordado, violação cross-tenant, OOM, crescimento anormal da fila, lock longo, filesystem perto do limite ou backup inválido. Interromper ensaio e seguir rollback ensaiado; não “consertar” com prune/delete.
- Backups: executar validação/restauração somente em alvo isolado, com owner e dataset autorizados; produção não será restaurada sobre si para teste. Guardar versão/digest anterior e preservar volumes/uploads/assets/logs antes de qualquer release.
- Autorizações ainda não concedidas por este plano: alterações em VPS/Compose/kernel/swap/firewall/TLS, migrations e tuning real de PostgreSQL, mudanças de jobs/cadência, alterações de storage/retention, sync/rsync, build/pull/deploy, restart, rotação de credenciais, qualquer limpeza, exclusão de imagem/volume/dados, e tráfego de carga em produção.

## 5. Métricas e limitações do plano

| Área | Estado em 2026-09-24 |
|---|---|
| Baseline atual de host/cgroups/processos/vizinhos | **NOT MEASURED**; `OPT-01` BLOCKED |
| Uso real CPU/RAM/disk/I/O, peak/OOM/restarts | **NOT MEASURED**; métricas históricas apenas contexto |
| DB connections/queries/settings/migrations/restore | **NOT MEASURED** no servidor |
| Owners/tamanhos/retention de volumes/logs/backups/artifacts VPS | **NOT MEASURED** |
| Digest/arquitetura das imagens em produção e rollback efetivo | **NOT MEASURED** |
| Throughput/latência/errors/tráfego externo e freshness dos jobs | **NOT MEASURED** |
| Benefícios quantitativos das tarefas | **HIPÓTESES**, sem valores inventados |

## Totais de achados e tarefas

- Snapshot da reconciliacao Prompt 09: **118 achados = 111 mapeados + 0 duplicados + 0 falsos positivos + 7 NOT APPLICABLE + 0 sem destino**. Atualizacao Prompt 10: DEP-AUD-17 e DEP-AUD-18 adicionam 2 achados AUDITED mapeados a OPT-05; total atual **120 = 113 mapeados + 7 NOT APPLICABLE**, sem duplicados/falsos positivos/itens sem destino.
- Tarefas separadas: **7** (`OPT-01..07`).
- Status atual em 2026-09-24: **PENDING 0 | IN PROGRESS 1 | DONE 0 | BLOCKED 6**. OPT-06 continua parcial; DEP-AUD-17/18 locais estao auditados, mas nao implantados. 
- Este documento é um plano mestre parcial, não certifica baseline, prontidão de deploy, segurança operacional nem auditoria completa da VPS. Prompt 09 termina aqui; não iniciar o Prompt 10 automaticamente.

## Registro de execucao — Prompt 10, tentativa inicial

**Data:** 2026-09-24 (America/Sao_Paulo). O workspace esta na branch `main`, HEAD `c652aac`; a busca local nao encontrou `AGENTS.md` nem configuracao/manifest de staging. Os unicos Docker contexts listados sao `default` e `desktop-linux`, ambos endpoints locais de named pipe do Docker Desktop; nenhum ambiente foi identificado como isolado para MercadoFlow ou compativel com a arquitetura da VPS. Existem alteracoes locais nao relacionadas em componentes frontend; foram deixadas intactas.

Revalidei os gates `OPT-01` e `OPT-06`. Corrijo o registro anterior: havia chave privada local apropriada, e a autenticação Paramiko com host key validada estritamente funcionou no endpoint histórico. A leitura confirmou x86_64/2 vCPU, 8 GiB RAM, 247 dias de uptime, 20 containers ativos no host e containers/volume de PostgreSQL do MercadoFlow ativos; arquitetura/digest de todos os serviços e staging isolado seguem sem identificação. O plano proibe usar Docker Desktop compartilhado como staging e exige plataforma alvo e rollback confirmados para ensaios de imagem. As tarefas `OPT-02..05` e `OPT-07` seguem dependentes de host, persistencia, consumers ou recuperacao nao comprovados. **Nenhuma fase de execucao e elegivel nesta sessao.**

Nao houve edicao de aplicacao/configuracao, build/pull, teste, restart, migration, leitura de segredo, deploy ou operacao em dados. A conexao SSH e a coleta foram somente leitura; nenhuma senha foi usada. Snapshot e metricas agregadas estao em `docs/VPS-OPT-BASELINE.md`; pico, telemetria, OOM historico, I/O detalhado, backups/restore e uso por clientes seguem **NOT MEASURED**. Nao houve rollback necessario; nao alterar codigo foi a condicao para preservar as mudancas existentes. O proximo passo e confirmar o endereco e a host key da VPS reinstalada. O endpoint consultado apresenta estado persistente e containers ativos, divergente do informado; nao inferi que nao ha clientes, nem farei qualquer alteracao remota antes de confirmar a identidade do alvo. O Prompt 10 fica interrompido neste checkpoint, sem iniciar outra fase automaticamente.


## Registro de execucao — Prompt 10, retomada apos confirmacao de ambiente nao produtivo

**Data:** 2026-09-24 (America/Sao_Paulo). O owner esclareceu que a VPS alvo nao esta em producao e foi reinstalada apos falhas de recursos; isso elimina a premissa de protecao de workload produtivo, mas ainda e necessario distinguir o alvo pretendido do endpoint historico acessivel. docs/VPS-OPT-BASELINE.md registra a coleta filtrada e somente leitura. O host mostrou 20 containers ativos, outros servicos alem do MercadoFlow, 13 volumes Docker (5,61 GB agregados), PostgreSQL MercadoFlow saudavel (522,4 MiB em snapshot) e backend saudavel (494,6 MiB); seis containers declarados do MercadoFlow estao em Created. O uptime de 247 dias contradiz reinstalacao recente, portanto os containers e dados observados devem ser considerados persistencia a preservar ate resolucao da identidade, mesmo sem producao.

A chave SSH local autenticou por Paramiko no endpoint historico com validacao estrita da host key. Nao foi usada a senha provisoria nem foram lidos valores ENV. Nenhum estado remoto foi alterado. Esta coleta fecha apenas parte da lacuna de baseline pontual de OPT-01; picos, series, conexoes, latencia, trafego, jobs, OOM historico, backup/restore e ownership completo dos volumes permanecem **NOT MEASURED**. OPT-01 permanece **BLOCKED** para alvo atual; OPT-02..05 e OPT-07 aguardam evidencias/consumidores do alvo. OPT-06 permanece sem ambiente isolado identificado. Nenhuma fase de implementacao foi executada e nenhum teste de aplicacao foi aplicavel.

**Gate atual:** enviar/confirmar o endereco da VPS reinstalada e sua host key (ou confirmar explicitamente que o endpoint historico com containers e dados observados e o alvo a substituir). Entao revalidar somente leitura e escolher uma unica fase elegivel do plano. Nenhum deploy, restart, migration, limpeza, prune ou alteracao em volumes foi feito nesta retomada.


## Registro de execucao — Prompt 10, verificacao apos solicitacao de continuar

**Data:** 2026-09-24 (America/Sao_Paulo). A solicitacao 72.60.10.108 foi validada com Paramiko 4.0.0 em modo estrito: porta 22 oferece OpenSSH Ubuntu, mas a host key nao esta no arquivo local known_hosts; por isso Paramiko rejeitou a conexao antes de autenticar. Nenhum password fallback, comando remoto ou alteracao ocorreu. A host key coletada apenas por rede nao foi confiada automaticamente.

O owner pediu para prosseguir com os prompts. Releitura de todos os documentos-base e oito auditorias concluida. A unica tarefa independente local candidata e OPT-06; validado que Docker Desktop (desktop-linux, Docker Engine 29.1.3, arquitetura amd64) e compartilhado, sem imagem MercadoFlow e sem ambiente/staging definido. Nao foi usado para build: ele tambem contem dados de outros projetos e nao satisfaz o requisito documentado de ensaio isolado. Nenhum ambiente alternativo de staging/Testcontainers/DB de teste ou manifest foi encontrado em `backend/pom.xml`, `backend/src/test`, Compose ou variaveis do processo. Entao nenhuma fase de implementacao atende aos gates nesta retomada; OPT-06 permanece **BLOCKED para execucao de build isolado**, OPT-01 permanece bloqueado pela host key/identidade, e as demais seguem com dependencias listadas no backlog. O estado nao e uma avaliacao de risco de producao: reflete falta de alvo de teste isolado e identificacao verificavel do host.

Nenhum codigo, configuracao, container, dado ou arquivo de usuario foi alterado; apenas este documento recebeu o checkpoint. Nao se aplicam testes de codigo. Rollback: nao necessario; a tentativa Paramiko encerrou antes de autenticar. Metricas de ganho permanecem **NOT MEASURED**. Nao avancei para outra fase.


## Registro de execucao - Prompt 10, coleta da VPS identificada

**Data:** 2026-09-24 (America/Sao_Paulo). Owner forneceu srv953800.hstgr.cloud e fingerprint conferido no console. Paramiko validou exatamente a host key ED25519 antes de autenticar; credencial foi utilizada somente em memoria e nao registrada nos documentos. Coleta somente leitura registrada em docs/VPS-OPT-BASELINE.md.

O host tem 4 vCPU, 16 GB RAM, 2 GB swap, 194G de raiz, uptime ~5d23h, load 0.31/0.52/0.60; free reportou 13.03 GB available e 112 MB de swap usados. vmstat 1 5 mostrou CPU steal 4-6% nessa janela curta (sem atribuicao causal), sem iowait ou swap-in/out. PSI e Docker storage estao no baseline; iostat/pidstat nao existem. Docker reportou 40 containers (38 ativos), 35 volumes e 153 registros de build cache; nada foi removido.

O filtro docker ps -a --filter name=mercadoflow nao encontrou containers. Existem outras aplicacoes e volumes ativos no host, incluindo servicos de banco, Redis e MinIO sob outras stacks. Portanto, embora identidade e reinstalacao recente tenham sido confirmadas, nao foi reconciliado que esse host contenha a release do checkout atual. A baseline do host foi medida, mas OPT-01 nao fecha reconciliacao de CTR-01..08, consumidores do projeto, persistencia da aplicacao, historico e picos; permanece BLOCKED para qualquer alteracao do MercadoFlow ate correlacionar repo/Compose/release ou confirmar um deploy target correspondente. OPT-02..07 nao executados; nao ha ambiente de build/teste isolado definido. Nenhum codigo, servico ou dado foi alterado e nenhum teste de aplicacao se aplica.

**Gate nesta fase:** reconciliar checkout e deployment (nome do projeto, Compose, imagem/digest/commit) com o host, em leitura somente, antes de escolher uma tarefa mutavel. Nao executei fase seguinte automaticamente.



### Adendo de reconciliação read-only — Prompt 10

Em 2026-09-24 16:20 UTC, docker compose ls --all retornou 8 projetos Compose sem projeto MercadoFlow; labels filtrados dos 40 containers não relacionam imagem/diretório de release ao checkout local. Dois containers ativos não têm labels Compose. Isso reforça o gate de identidade da aplicação, apesar de o host e fingerprint SSH estarem confirmados. Nenhum serviço ou dado foi tocado. Para tornar OPT-01 elegível para fechar, mapear o nome da aplicação no checkout/release esperado; até lá, não associar o estado das outras stacks ao MercadoFlow. OPT-06 também segue sem aprovação de aceite em ambiente isolado alinhado ao fluxo de deploy.



### Fechamento da tentativa de reconciliacao read-only — Prompt 10

Em 2026-09-24, comparei o repositorio local mercadoflow2 e seu workflow deploy-pdv2cloud-web.yml com o host autenticado. O workflow declara destino /root/mercadoflow-web e COMPOSE_PROJECT_NAME=mercadoflow-web; esse diretorio nao existe. Os caminhos /opt/mercadoflow, /opt/pdv2cloud e /opt/mercadoflow-web tambem nao existem. Filtros read-only em docker image ls e docker ps -a para mercadoflow/pdv2cloud retornaram zero; docker compose ls listou oito outros projetos. Portanto o target host foi identificado criptograficamente, mas a release do checkout nao foi identificada nele.

A linha OPT-01 permanece BLOCKED para reconciliação do app/deployment, não por falta de canal SSH: baseline do host foi colhida, mas nao ha serviço do checkout que possa ser mapeado para CTR-01..08 ou ao qual aplicar testes e otimizações. OPT-02..07 não são elegíveis neste alvo sem identificar a aplicação/release correspondente e um ambiente de aceitação adequado. Nenhum arquivo de aplicação, serviço, dado ou volume foi alterado. Os documentos de baseline e plano são as únicas alterações persistentes desta fase.



## Execucao da tarefa IMG-01 — Prompt 10

Status corrigido no checkpoint: **OPT-06 IN PROGRESS**; subitem IMG-01 tem cache Maven implementado em backend/Dockerfile:5. Baseline e comparacao local, smoke test com DB descartavel, contagens de migration/seed, limites efetivos locais, rollback e custos de cache estao registrados em docs/VPS-OPT-BASELINE.md. O resultado de tempo tem apenas uma amostra pos-source-change por variante: 64.2 s baseline, 58.8 s candidate (-8.4%); variabilidade e ordem tornam a conclusao **NOT VERIFIED**. Nao declarar beneficio sustentado ou economia de producao.

O build completo e smoke test foram locais e isolados, com sucesso funcional, mas nao provam deploy/rollback na VPS. OPT-06 nao fica DONE porque faltam verificacoes de registry/digest, imagens collectors/frontend, scanner de artefato e equivalencia de funcoes multimidia. Nenhuma fase seguinte foi iniciada. O deployment atual observado segue sem correlacao com este checkout; nao foi publicado nem alterado.

Resultado geral desta subtarefa: mudanca em um Dockerfile, quatro builds de builder de benchmark, uma build final completa e um smoke test app+PostgreSQL descartavel; migrations=53, usuarios semeados=1, role sem superuser/bypassrls, health=ok. Testes de unidade integrais nao executados: o codigo de aplicacao nao mudou; a verificacao foi direcionada ao fluxo de imagem/build. Rollback local simples por reversao da linha indicada; nenhum rollback de aplicacao/deploy necessario.


Complemento de validacao em 2026-09-24: suite Maven em container temporario passou (169/169, sem falhas/erros; 4:27 min); container removido automaticamente e nenhum target gerado no checkout. Avisos de versoes de plugins sem pin e encoding implicito no POM foram observados mas ficam fora do escopo IMG-01. A tarefa de cache de build tem verificacao funcional local mais forte; beneficio de tempo segue com amostragem insuficiente, custo/cache local do benchmark foi documentado, e integracao com o deploy atual segue sem correlacao. OPT-06 continua IN PROGRESS.



### Prompt 10 — complemento de coleta read-only do host

Em 2026-09-24 17:43 UTC, Paramiko com fingerprint SSH ED25519 validado catalogou 40 instâncias HCTR (38 running, 2 exited), oito projetos Compose identificados e dois containers sem labels. Baseline agora documenta Image ID/plataforma, estado/health, restart, limites HostConfig, RAM/CPU/PIDs instantâneos, portas, redes, mounts e campos observáveis de isolamento/permissões; docker system df foi registrado. Redis e MinIO estão ativos em outras stacks e foram preservados. Consumidores funcionais e persistência em conteúdo permanecem sem verificação.

Nenhuma release deste checkout foi identificada no host; OPT-01 permanece bloqueado para mudança remota. IMG-01 segue candidato local testado funcionalmente; economia de build sustentada continua NOT VERIFIED. Nenhuma fase posterior foi iniciada.


Labels Compose adicionais correlacionaram projetos e caminhos de release, sem ler YAML ou ENV. Em aprenderia, dramarcela, m2centerauto e makucho-studio alguns serviços de dados/helpers mantêm labels apontando para releases diferentes das aplicações atuais. Isso pode ser persistência intencional; requer reconciliação do lifecycle antes de alteração. Ferraco CRM e PostgreSQL estão sem limites Docker explícitos nesta instância; pico permanece NOT MEASURED. Nenhum ajuste é seguro sem código/consumer e limites de capacidade, e nenhum foi aplicado.

IMG-04 context audit advanced: local logical included payload is backend 2,451,738 bytes, frontend 1,985,375 bytes and collectors 680 bytes; existing ignores exclude 91,012,201 bytes of backend target and 138,878,576 bytes of frontend files. No context edit is justified; transmitted bytes and VPS context remain NOT MEASURED. No new Dockerfile/context change was introduced.

### Decisao de aceite IMG-01 — Prompt 10

Revisei o custo-beneficio antes de fechar a mudanca. O cache Maven BuildKit economizou 5.4 s em uma unica comparacao apos source change (64.2 s vs 58.8 s, ordem fixa), sem bytes de rede/CPU medidos; ganho estavel permanece NOT VERIFIED. docker buildx du --verbose reportou cachemount /root/.m2 de 425.4 MB no builder local compartilhado (usage count 2). Essa evidencia e local, nao mede a VPS. Reverti backend/Dockerfile ao comando anterior e nao adotei IMG-01 por falta de ganho liquido verificavel. O cache local permanece intacto, sem prune/limpeza. Testes do candidate continuam documentados como evidencia funcional, nao de economia.

OPT-06 segue IN PROGRESS: IMG-01 REVERTED / NOT ADOPTED; IMG-04 AUDITED sem mudanca por contexto pequeno e exclusoes existentes. Nao ha imagem/release deste checkout identificada na VPS para implantar ou validar. Nenhum prompt posterior foi iniciado.

A metricas de imagem candidate foram corrigidas: inspect .Size = 347,845,387 bytes, enquanto image ls e system df -v = 1.19 GB / 1.187 GB unico, sem containers; soma de docker history = 838,645,090 bytes. Saidas nao reconciliadas, causa NOT VERIFIED. Nenhum tamanho foi interpretado como recuperacao fisica confirmada.

Deployment gate surfaced while evaluating IMG-01: the repo workflow targets 72.60.10.112 and disables SSH host checking, but the owner-confirmed hostname resolves to 72.60.10.108 (ED25519 fingerprint verified). The .112 host was not contacted, and the MercadoFlow directory/release is absent on .108. This is tracked under OPT-05 in DEPLOY-CICD-AUDIT.md; workflow changes or deployment are outside current OPT-06. Do not adopt a release/deploy optimization until the target is reconciled. No remote or workflow state changed.

IMG-09 advanced partially: local SBOM cataloged 421 packages (312 deb, 12 Go modules, 97 Java archives) on the candidate artifact. Docker Scout local CVE scan was blocked before analysis by its login requirement; no credential was used, no report was generated. Secret scan/CVE results remain NOT MEASURED. OPT-06 stays IN PROGRESS; no change or deployment was made.

### Prompt 10 execution checkpoint — IMG-15 collectors (2026-09-24 18:34 UTC)

Revalidated the checkout and found an independent local fix within OPT-06. `deploy/collectors/Dockerfile:14,16` had unquoted `>` in two pip version constraints. Ephemeral shell reproductions wrote pip stdout to `=2.31.0` and `=4.12.0`, meaning the intended lower bounds were not passed to pip. Quoted both constraints (IMG-15); no Compose, collector source, user frontend work, VPS, or persistent data changed. Rollback: restore the two original unquoted lines.

Local Docker Desktop build succeeded using `--no-cache`, candidate tag `local/mercadoflow-collectors:img15-quoted-constraints`, base digest `sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9`, linux/amd64. Network-disabled import/version checks passed: requests 2.34.2, Pillow 12.3.0, beautifulsoup4 4.15.0; `python -m pip check` reported no broken requirements; accidental `=2.31.0` and `=4.12.0` root files absent. `docker system df -v` records candidate image logical display 240 MB and unique storage 98.66 MB, zero containers. `docker image inspect .Size` reports 58,948,239 bytes; those Docker size representations do not reconcile, cause NOT VERIFIED. Candidate is local-only; no push, deploy, or cleanup occurred. This local Desktop is shared, so its physical usage is not a VPS measurement.

IMG-15 is **implemented and locally build/import-verified**, with no quantitative disk/build gain claim. Collector entrypoint/job behavior, repeatability, CVE/secret scanning, deployed digest, and VPS resource impact remain unverified or blocked. OPT-06 remains **IN PROGRESS**; IMG-01 remains reverted/not adopted, IMG-04 static context audit complete, and IMG-09 scanner sub-scope blocked. No Prompt 11 validation phase or other prompt was started automatically.

### Prompt 10 execution checkpoint — IMG-16 / IMG-17 (2026-09-24 19:10 UTC)

The IMG-09 scanner gap was partially closed for local candidates using checksum-verified Trivy 0.74.0. Local scan results: backend 441 findings (9 critical/29 high/376 medium/27 low, 95 with a listed fixed version), collectors 165 (46 high/59 medium/58 low/2 unknown, 9 with a listed fixed version), frontend pre-fix 1 high CVE-2026-93990; all three scanned with 0 secrets. The collector finding set exactly matched its `python:3.11-slim` base scan. VPS/deployed image coverage remains NOT MEASURED; backend CVE triage and collectors review remain open. The builder `npm ci` reported 14 package advisories, which are build-stage evidence and not the Nginx runtime findings.

Implemented IMG-17 in `frontend/Dockerfile`: install Alpine `libexpat>=2.8.5-r0`. Rebuilt local candidate `local/mercadoflow-frontend:img17-expat-patch` (image ID `sha256:fc6a7e2b029f4c46af3254da2e0002923df9b323a6c9689fbc0f7763e8d831f9`); final Trivy result 0 CVEs / 0 secrets; offline package metadata 2.8.5-r0; in-container Nginx checks returned 200 for root and SPA route. Host-published port check remains unverified. Local daemon accounting: inspect logical size 26,781,547 bytes, unique 28.8 MB/shared 67.22 MB; prior candidate unique 28.37 MB/shared 67.22 MB. No VPS disk savings inferred.

Temporary scanner binaries, databases and raw reports were deleted from the exact task-specific temp directory after recording aggregates; local Docker candidate images remain as review/rollback artifacts. No push, VPS change, data cleanup, or prune was performed. `git diff --check` passed. Preserve unrelated pre-existing frontend edits. OPT-06 remains IN PROGRESS due to backend/collector triage, VPS/release mismatch, host-port verification and unmeasured operational gains. Do not start Prompt 11 automatically.


### Prompt 10 checkpoint — IMG-18 backend candidate (2026-09-24 20:05 UTC)

Implemented a local Boot 4.1.1 / Java 17 dependency-upgrade candidate after documenting 441 prior backend CVE findings from the point-in-time Trivy scan. First archive inspection caught Tomcat still at 11.0.24 despite the Maven property; added explicit dependency management for `tomcat-embed-core`, `tomcat-embed-el` and `tomcat-embed-websocket` at 11.0.26, then rebuilt `local/mercadoflow-backend:img19-boot41-upgrade` (linux/amd64, image ID `sha256:79ff4c5dc158d642276a35f1ce29910aee6856aeb99ae311141bae97c889f364`). Trivy 0.74.0 against the same DB reports 358 findings (0 critical, 0 high, 345 medium, 13 low), 0 secrets, compared with 441 (9 critical, 29 high, 376 medium, 27 low) for the prior local candidate. This reduction is a package/version scan result, not proof of runtime exploitability or performance improvement.

The Boot 4.1.1 full Maven suite passed earlier in the isolated temp copy (169 tests), and a pre-final-rebuild disposable-PostgreSQL smoke reported health ok, 53 migrations and one seeded market. The exact final artifact confirms embedded Tomcat 11.0.26; final-POM `mvn -B verify` passed 169/169 tests (13:08), and exact-image smoke passed health, 53 Flyway migrations, one seeded market and restricted app-role flags. Local snapshot was API 478.1 MiB / 1 GiB (2.73% CPU), DB 84.02 MiB (0.06% CPU); no performance gain is inferred. Auth/API/frontend/collector integrations, staging and VPS metrics remain pending or NOT MEASURED. RAM/CPU/disk/build performance delta and deployed VPS image remain NOT MEASURED. Keep the candidate local; do not push or deploy. OPT-06 remains IN PROGRESS; Prompt 11 has not started.



### Prompt 10 checkpoint — IMG-19 Alpine runtime candidate (2026-09-24 20:45 UTC)

After verifying IMG-18's exact Boot 4 final POM/image (169/169 tests, health, 53 migrations and seed), built an isolated Alpine runtime candidate while retaining Java 17, `ffmpeg`, `wget`, and DejaVu Sans. Implemented the candidate in `backend/Dockerfile:7-9`: `eclipse-temurin:17-jre-alpine-3.24`, fixed `libexpat>=2.8.5-r0`, `ffmpeg`, `wget`. Local linux/amd64 image `local/mercadoflow-backend:img20-alpine-runtime`, ID `sha256:1d3e12683016eeb1e79be7afb465f49ef77911a0e486a662f40352e641ece717`; `docker image inspect .Size` 199,206,667 bytes vs 352,879,008 for IMG-19 Ubuntu, a 43.55% lower logical size. Trivy 0.74.0 against the same DB: 0 vulnerabilities / 0 secrets vs IMG-19's 358 / 0.

Exact IMG-20 disposable-Postgres smoke: `/health` ok, 53 migrations, 1 synthetic market, app DB role not superuser and no bypass-RLS; local snapshot API 403.6 MiB / 1 GiB and 0.42% CPU, DB 83.89 MiB and 0.05%. A no-network H.264 smoke reproduced the offer-video arguments and produced 6.000000 seconds; DejaVu Sans resolved. These single local readings are not controlled performance evidence.

Important accounting caveat: shared Docker Desktop `system df -v` reports IMG-20 602 MB unique vs IMG-19 443.1 MB unique, opposite to logical inspect size; the daemon is shared and its size representations do not reconcile. No VPS physical disk, pull, CPU/RAM gain or cold-start comparison is claimed. Both candidate tags remain local; no prune, persistent-volume removal, push or deployment occurred. Actual API/media flows, target CPU arch and staging integration are pending. OPT-06 remains IN PROGRESS; do not start Prompt 11 automatically.

### Prompt 10 checkpoint — IMG-20 collectors image (2026-09-24 21:08 UTC)

Re-pulled `python:3.11-slim`; its digest was unchanged and an ephemeral `apt-get update` showed no upgradable packages. Rebuilt the collector image as a local candidate using `python:3.11-alpine3.24`; pip installs the same requests/Pillow/BeautifulSoup requirements, runs `pip check`, then removes pip/setuptools/wheel/packaging from runtime. Compose collector commands invoke scripts directly with Python; no collector job uses pip. Actual jobs were not invoked because they make authenticated API/portal calls.

Final candidate `local/mercadoflow-collectors:img24-alpine-trim`, linux/amd64, ID `sha256:d1f01b5f3272cdaddfbc474bbeca210702115269cdc54378f1c9c2c94e2c6d31`. Build/import checks passed, including Pillow JPEG resize/encode/read, BeautifulSoup parse, Requests request preparation, CA bundle presence and no runtime pip. Same-cache Trivy 0 vulnerabilities / 0 secrets vs IMG-15 165 / 0. Logical image size reduced from 58,948,239 to 31,864,006 bytes (-45.95%). Shared local Docker Desktop `system df -v` unique accounting reduced 98.66 MB to 64.4 MB (-34.7%); this is local daemon accounting only, not a VPS saving claim. Keep previous image local; no push/deploy/prune/volume/data operation. Portal job flows and target architecture remain pending. OPT-06 remains IN PROGRESS; do not begin Prompt 11.

### IMG-19 decision reconciliation (2026-09-24 21:08 UTC)

The Alpine backend runtime candidate produced 43.55% lower logical `.Size` and 0/0 Trivy findings, but same-daemon `docker system df -v` reports 602 MB unique for IMG-20 versus 443.1 MB for the matched Boot 4 Ubuntu runtime candidate and 432.3 MB for the older `opt06-cache` baseline. The local daemon is shared, so VPS physical effect remains NOT MEASURED; the available physical-layer accounting does not support adopting this disk optimization. Restored only `backend/Dockerfile` to the original Ubuntu/JRE apt package block. Both candidate tags remain for review/rollback; no image was pruned, pushed or deployed. IMG-19 status: NOT ADOPTED; do not claim disk savings from its logical size. IMG-18 Boot 4 POM/config change remains a separate candidate. OPT-06 remains IN PROGRESS.



### Gate read-only de reconciliacao do deployment - 2026-09-24 21:15 UTC

Reconciliado o inventario do checkout com a evidencia de host ja coletada via Paramiko e fingerprint validado (`VPS-OPT-BASELINE.md`, Docker snapshot 2026-09-24T17:49:07Z). `CTR-01..08` e `BLD-01..03` nao correspondem a nenhum dos 40 containers (`HCTR-001..040`), nomes/imagens MercadoFlow filtrados ou oito projetos Compose observados. O snapshot inclui dois containers ativos sem labels Compose; por isso, ausencia de correspondencia nominal nao e tratada como prova de ausencia de consumo. Os 8 servicos do Compose seguem sem identidade remota, digest implantado, commit ou trafego atribuidos.

O workflow atual direciona para `72.60.10.112`, desativa a verificacao SSH de host e executa `rsync --delete` para `/root/mercadoflow-web`; o alvo confirmado `srv953800.hstgr.cloud` resolve para `72.60.10.108`, com fingerprint ED25519 validado. `.112` continua nao verificado. O caminho `/root/mercadoflow-web` nao foi encontrado no host confirmado; `data/offers` e bind persistente no Compose local, nao esta excluido explicitamente pelo rsync, e o diretorio/conteudo no destino do workflow nao foi inspecionado. Essa divergencia bloqueia publicacao/rollout e qualquer build remoto. Nao alterar o host configurado nem redirecionar automaticamente para `.108` sem confirmar o destino canonico e owners/impacto das outras stacks.

Gate de Prompt 10: execucao local candidates e smoke isolado documentados acima continuam separados do deployment. Nenhuma imagem foi publicada, nenhum workflow disparado, nenhuma migracao/seed remota executada. Associacao de release, consumers do host, integridade/backup/restore de volumes, execucao GitHub Actions e protecao de sync permanecem **BLOCKED/NOT VERIFIED**; metricas remotas de build, pull, CPU, RAM, disco fisico, downtime, erros e latencia permanecem **NOT MEASURED**. Status do Prompt 10: **IN PROGRESS**; Prompt 11 nao iniciado. Proxima acao elegivel segue read-only: obter confirmacao do destino canonico e evidencia de proveniencia/escopo de sync antes de qualquer operacao remota.



### IMG-20 follow-up verification - 2026-09-24 21:28 UTC

Exact collector candidate `local/mercadoflow-collectors:img24-alpine-trim` (linux/amd64, ID recorded in `DOCKER-IMAGE-AUDIT.md`) successfully imported all three Compose entrypoint modules with source binds read-only, network disabled, no capabilities, read-only rootfs and a 256 MiB/0.5 CPU/64 PID test envelope. Container used `--rm`; no external API/portal, DB, credentials or persistent volume. This closes entrypoint import compatibility only. It does not run jobs or validate collector business flows, checkpoints, authentication, image writes, target VPS arch/load or savings. OPT-06 remains IN PROGRESS; no Prompt 11 started.



### Snapshot VPS Paramiko autenticado - 2026-09-24 21:36 UTC

Acesso read-only ao hostname confirmado concluido apos comparar a chave ED25519 recebida com o fingerprint previamente validado antes da autenticacao. O host retornou exit 0 para os comandos documentados no novo snapshot de `VPS-OPT-BASELINE.md`; nenhuma alteracao remota.

Novos valores medidos: 4 vCPU, 16,764,968,960 B RAM total / 12,952,727,552 B available / 12,075,929,600 B buff/cache, swap ativo com 115,343,360 B usados, root ext4 194G (58G usados), 6% inodes. Snapshot Docker: 40 containers / 38 running, 8 projetos Compose sem MercadoFlow, zero filtros de containers/imagens da aplicacao, `docker system df` com imagens 40.07GB, cache 13.6GB, volumes 1.672GB; reclaimable nao e beneficio de disco garantido e nenhuma limpeza ocorreu. Uma janela `vmstat 1 5` teve steal medio 7.6% (amostras 4-13%); a janela nao representa pico sustentado. Docker stats instantaneo: soma 10.85% CPU, MemUsage 2,816,997,306 B e maior container 785,697,996 B; nao confundir uso com limites/RSS.

Isso fecha coleta read-only atual de identidade/capacidade agregada do host e substitui a antiga alegacao de ausencia de acesso. Nao fecha `OPT-01` para proveniencia/consumers do MercadoFlow: imagem, container e projeto continuam ausentes nos filtros/paths convencionais; containers podem usar outro nome e uso por trafego nao foi consultado. O workflow aponta para .112 e nao foi verificado; .108 e o endpoint validado e contem outros projetos. Deploy segue bloqueado ate reconciliar destino e release/proveniencia, proteger `data/offers` e identificar owners/impacto. `OPT-06` fica **IN PROGRESS**. Nenhuma fase posterior iniciada.



### DEP-AUD-17 / preflight de deploy seguro - 2026-09-24

Implementei localmente em `.github/workflows/deploy-pdv2cloud-web.yml` host confirmado `srv953800.hstgr.cloud`, chave SSH pinned cujo fingerprint foi comparado via Paramiko, SSH/rsync strict, exclusoes de `data/offers` no sync destrutivo e cleanup de projeto/imagem desligado enquanto a politica de retencao/rollback e os volumes nao estiverem auditados. PyYAML, oito blocos bash, checks estaticos e teste GNU rsync isolado passaram; ver detalhes em `DEPLOY-CICD-AUDIT.md` item DEP-AUD-17. Alteracao nao foi enviada nem executada; o secret Actions, host target efetivo antes da mudanca, diretorio release remoto, build e servicos seguem nao verificados. Ela reduz risco de host incorreto/perda de offers e preserva artefatos; **nao** mede nem afirma reducao de CPU/RAM/disco. Gate remoto segue bloqueado ate validar secret/runner e fluxo completo; nenhuma fase Prompt 11 iniciada.



### Prompt 10 checkpoint - IMG-20 Compose CLI and workflow reconciliation - 2026-09-24 22:06 UTC

Repeated an isolated argument-acceptance smoke for all three collector commands declared in `docker-compose.vps.yml`, using `local/mercadoflow-collectors:img24-alpine-trim` (linux/amd64). Dispatcher, barcode-enricher and state-price-sync each returned exit 0 with Compose flags plus `--help`. The check used no network, read-only rootfs/source binds, no capabilities, no-new-privileges, 256 MiB, 0.5 CPU, 64 PIDs, temporary `/tmp`, and fake invalid-domain credentials. This proves CLI parsing only; it did not authenticate, run a collector, call an API/portal, access a database, or write persistent data. Details are in `docs/DOCKER-IMAGE-AUDIT.md`.

Reconciled the current local workflow state with earlier read-only host evidence: `.github/workflows/deploy-pdv2cloud-web.yml` now names the fingerprint-verified `srv953800.hstgr.cloud`, pins its SSH host key, enables strict SSH/rsync host checking, excludes `data/offers` from `rsync --delete`, and disables Docker cleanup flags. This local edit is recorded as DEP-AUD-17 in `docs/DEPLOY-CICD-AUDIT.md`; it supersedes earlier checkpoint descriptions of the workflow still targeting `.112`/disabling host verification, but it does not prove an Actions run or change remote state. The checkout deployment path and MercadoFlow containers/images/projects were absent from the last authenticated read-only snapshot; workflow secret/runner authentication, release provenance, data/backup recovery, and remote consumers remain NOT VERIFIED or BLOCKED. No workflow dispatch, push, sync, build, migration, seed, restart, or cleanup occurred.

OPT-06 remains IN PROGRESS: IMG-20 has local build, import, image scan and Compose argument-acceptance evidence, but complete collector job flows, a valid isolated backend/portal fixture, target architecture/host acceptance and resource comparison are still pending or NOT MEASURED. No next phase is eligible from this evidence; Prompt 11 has not started.


### Prompt 10 checkpoint - collector build wiring - 2026-09-24 22:19 UTC

Found and corrected a deployment gap within the in-progress image phase: `deploy/deploy-web.sh` rebuilt only backend/frontend/cron, but later explicitly recreated all three collectors. Because collectors use the shared `mercadoflow-collectors:latest` image, Dockerfile changes could otherwise be synced without rebuilding that image. Added only `mercadoflow-catalog-harvester` to the `compose build --pull` targets because all three collectors share the same `mercadoflow-collectors:latest` image, `deploy/collectors` context and Dockerfile; this makes Compose build the shared collector image once rather than scheduling three identical targets; detailed trace is DEP-AUD-18 in `docs/DEPLOY-CICD-AUDIT.md`.

Validation: `bash -n deploy/deploy-web.sh` passed. Compose config with the state-price profile listed all three collectors; YAML checks confirmed their shared tag/context/Dockerfile; `docker compose build --print` represented backend, frontend, cron and one collector image target without building or pulling. No actual build, network pull, workflow, remote sync, migration, seed, start, restart, cleanup or data change was executed. Official Compose references supporting the explicit-target behavior are linked in DEP-AUD-18.

This increases build scope and may increase VPS build time/CPU/RAM/I/O; it is required for the collector candidate Dockerfile to be represented in a future image. IMG-20 remains a local candidate until the job flows, artifact provenance, and target acceptance are validated. OPT-06 remains IN PROGRESS; Prompt 11 has not started. Remote deployment remains blocked/not verified because the last authenticated host snapshot did not identify this checkout's release, the Actions secret/runner is unverified, and persistence/recovery has not been validated.


### Prompt 10 checkpoint - IMG-20 fixture-flow smoke - 2026-09-24 22:33 UTC

Ran a temporary fixture-driven harness inside the exact local collector candidate image. It exercised dispatcher result aggregation, barcode one-shot normalization and JSON serialization, and state-price registry filtering/cycle/import accounting/payload writing. External crawling and API import were stubbed deliberately; the harness used `--network=none`, read-only rootfs/source mounts, no capabilities, no-new-privileges, 256 MiB/0.5 CPU/64 PIDs, 16 MiB tmpfs and an auto-removed container. Result: `FIXTURE_FLOW_SMOKE_OK`. No source code/test file, persistent data, database, real credential, portal, API, workflow or VPS state was touched. Full details and scope limits are in `docs/DOCKER-IMAGE-AUDIT.md`.

This strengthens local functional evidence for the image candidate but is not acceptance of real collector requests, backend auth/import contracts, checkpoints or portal semantics. IMG-20 therefore remains a candidate; end-to-end flows in a fixture-backed service environment and target acceptance/resource comparison are still required. OPT-06 remains IN PROGRESS; no Prompt 11 started.


### Prompt 10 checkpoint - IMG-20 state-price parser fixture - 2026-09-24 22:33 UTC

Ran `extract_amazonas_records` from the candidate collector image against synthetic HTML. The actual BeautifulSoup parsing function extracted product, store, AM state, normalized price `7.99`, and pagination count 3. Result: `AMAZONAS_HTML_FIXTURE_OK`; container was network-disabled with read-only mounts/rootfs and resource caps. This checks a fixture parser path without contacting the external portal. The live service markup/API semantics remain pending; details are in `docs/DOCKER-IMAGE-AUDIT.md`.


### Prompt 10 checkpoint - IMG-20 loopback API/portal integrations - 2026-09-24 22:41 UTC

Advanced local candidate verification using three temporary containers from the exact IMG-20 image, each network-disabled and resource-capped. The state-price collector used its real Bahia request/CSRF/parser/import code against a loopback fixture portal and loopback fake API; dispatcher used its real login/claim/status/result/finish lifecycle with a fixture runner and fake API; barcode used real login/catalog/import/output paths with a fixture response for its external product lookup. Results: `STATE_PRICE_LOCAL_E2E_OK`, `CATALOG_DISPATCHER_LOCAL_E2E_OK`, `BARCODE_LOCAL_E2E_OK`. No external request, credential, database, volume, persistent write, source edit or VPS operation occurred. Evidence and exact stubbing boundaries are in `docs/DOCKER-IMAGE-AUDIT.md`.

The local mock API does not verify the Spring backend's auth, schema validation, RLS, idempotency or database persistence; the fixture source does not verify live provider HTML/API or consumer side effects. These remain explicit acceptance gaps. IMG-20 remains IN PROGRESS; no Prompt 11 started.


### Prompt 10 checkpoint - IMG-20 local post-import RSS samples - 2026-09-24 22:41 UTC

Repeated the same post-import startup script three times per collector image with the 192 MiB Compose limit, 0.5 CPU, 64 PIDs, network disabled, read-only filesystem/source mounts and auto-removed containers. Median process VmRSS: IMG-15 40,160 kB (range 39,936-40,484); IMG-20 35,080 kB (range 34,844-35,504), -12.65% local. Docker stats median was 27.48 MiB and 24.17 MiB respectively, kept separate from RSS because they are different accounting views. No job, DB, portal/API, persistent data, external network or VPS was used. This is module-import idle/startup footprint only; no peak/job or VPS savings claim. Full evidence and limitations are in `docs/DOCKER-IMAGE-AUDIT.md`.

Local candidate evidence now includes image/build size, static/import/fixture request paths, and repeated post-import process RSS. `OPT-06` remains IN PROGRESS because live backend contract/persistence, external consumer flows, release digest/rollback, and target/VPS resource acceptance remain unverified. Do not start Prompt 11 automatically.


### Prompt 10 read-only access refresh attempt - 2026-09-24 22:53 UTC

Before considering any backend integration against the VPS, revalidated the pinned ED25519 fingerprint from `.github/vps_known_hosts` against the expected console value; it matched. A locally available SSH key was tried with Paramiko as `root` under strict host-key verification and was rejected during authentication. The SSH agent had no identities. No password fallback was made, no remote command ran, and no host state changed. The previous successful Paramiko read-only snapshot in `docs/VPS-OPT-BASELINE.md` remains the latest remote evidence; current port, volume, disk and consumer state are not freshly measured. This failed key attempt does not contradict the earlier password-authenticated snapshot. No deployment or Prompt 11 started.


## Prompt 10 addendum - achados novos reconciliados - 2026-09-24

| ID de origem novo | Evidencia / destino unico | Status e lacuna |
|---|---|---|
| `DEP-AUD-17` | Host key pinned, `StrictHostKeyChecking=yes`, exclusoes `data/offers` e Docker cleanup desativado no workflow local -> `OPT-05` | **AUDITED** localmente; GitHub Actions/secret/runner e deploy efetivo nao verificados. |
| `DEP-AUD-18` | `deploy/deploy-web.sh` reconstrui a imagem compartilhada dos coletores uma vez -> `OPT-05` | **AUDITED** com bash -n, Compose config e build --print; build/rollback remoto e recursos NOT MEASURED. |

Assim, os oito audits base do Prompt 09 mantem o snapshot 118; os dois achados de deploy criados/reconciliados durante Prompt 10 elevam o registro atual a 120. Contagem de status agregada incluindo esses dois: **AUDITED 36 | PENDING 24 | BLOCKED 53 | NOT APPLICABLE 7**. Nenhum destino duplicado, falso positivo, N/A ou achado sem destino foi introduzido. As tarefas continuam **7**; os novos achados pertencem a OPT-05 e nao criam tarefa adicional.


### Prompt 10 revalidacao local de acesso e capacidade - 2026-09-24 23:05 UTC

Snapshot local somente leitura: Windows reportou 19.73 GiB de RAM fisica e 0.66 GiB disponivel; Docker Desktop/Engine 29.1.3, x86_64, com 0 containers em execucao e 18 parados. O candidato IMG-20 continua local e `linux/amd64`, conforme `DOCKER-IMAGE-AUDIT.md`. Esse estado e do computador de desenvolvimento, nao da VPS. Nenhum build, pull, teste de carga ou benchmark foi iniciado nesta revalidacao; RAM/CPU atuais do candidato continuam **NOT MEASURED**.

Na checagem de 2026-09-24 23:13 UTC, DNS resolveu `srv953800.hstgr.cloud` para `72.60.10.108` e IPv6; a porta TCP 22 estava alcançavel e o handshake Paramiko apresentou ED25519 com fingerprint igual ao pin em `.github/vps_known_hosts` (`SHA256:qEkOWNaWFZykVFmF/pMUlWvXYssbO0byQTW4KfcnHPU`). Essa foi apenas validacao de identidade/conectividade, sem autenticacao; nao prova deployment, containers, processos, dados nem metricas atuais. Sem sessao autenticada, nenhum comando remoto foi executado. A baseline de capacidade e workloads continua sendo a coleta anterior de 2026-09-24T21:36Z, nao um snapshot atual. Consumidores, digest/release, persistencia/restore e recursos efetivos da VPS permanecem **NOT VERIFIED / NOT MEASURED**. `OPT-06` segue **IN PROGRESS**; sem aceitar estado local como evidencia de rollout e sem iniciar Prompt 11.
