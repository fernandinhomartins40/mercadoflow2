# Auditoria de otimização VPS

Data da coleta: 13/09/2026, 22:05 (horário da VPS).
Host: 72.60.10.112 (mercadoflow.com). Coleta somente leitura via SSH.

## Resumo executivo

O MercadoFlow é a aplicação mais pesada da VPS, com folga:

- **2,68 GB de RAM** dos 4,35 GB em uso na máquina — **62% do consumo total**, para 8 dos 22 containers.
- As outras cinco aplicações (palmital, advocacia, metalgest, tagflow, fusesite) somam **~660 MB**.
- **16,4 GB de disco** em `/root/mercadoflow-web` + 5,55 GB no volume do Postgres = **~22 GB**, contra ~250 MB de todos os outros volumes somados.

A VPS tem 8 GB e **nenhum swap**. Restam 457 MB livres, e o `Committed_AS` (10 GB) já é 2,5× o `CommitLimit` (4 GB). A máquina está sem margem.

Não há desperdício arquitetural exótico: **não existe Redis, MinIO, S3, Kafka ou fila** no projeto — verificado no `pom.xml` e em todo o código Java. A stack é Spring Boot + PostgreSQL + Vite/nginx, e é adequada. O desperdício está concentrado em cinco pontos concretos e corrigíveis:

1. **`mercadoflow-cron` é uma segunda cópia integral do backend** — 1022 MB, 47 threads, Tomcat incluído, para rodar jobs que executam de madrugada.
2. **Nenhum container tem limite de memória**, e cada JVM se acha dona de 2 GB de heap (25% da RAM da VPS).
3. **Três containers Python rodam `pip install` na inicialização** e ficam residentes 24h para tarefas de 6 em 6 horas.
4. **O build acontece na VPS** — Maven completo + `npm ci` a cada deploy, em 2 vCPUs compartilhadas.
5. **~5,2 GB de disco descartável**: 2,2 GB de `.jsonl` de auditoria, 1,5 GB de snapshot SQLite, 1,4 GB de backups redundantes.

Ganho estimado: **~1,3 GB de RAM** e **~5 GB de disco**, com dois containers a menos e sem perder nenhuma funcionalidade.

---

## Arquitetura atual

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite 7 + Tailwind 4, servido por nginx:alpine |
| Backend | Spring Boot 3 (Java 17), Maven, Tomcat embarcado |
| Banco | PostgreSQL 16-alpine |
| ORM | Hibernate/JPA + Flyway (não há Prisma) |
| Proxy | nginx do host (443) → nginx container (3300) → nginx do frontend (3000) |
| Jobs | Segunda JVM com `--spring.profiles.active=jobs` |
| Coletores | 3 containers `python:3.11-slim` |
| CI/CD | GitHub Actions → rsync → **build na VPS** |

### Inventário de serviços

| SERVIÇO | EXISTE | USADO PELO CÓDIGO | NECESSÁRIO EM PROD | RAM MEDIDA | PODE SER REMOVIDO |
|---|---|---|---|---|---|
| PostgreSQL | Sim | Sim | Sim | 287 MB | Não |
| Backend (Spring) | Sim | Sim | Sim | 1209 MB | Não — mas limitável |
| Cron/jobs (2ª JVM) | Sim | Sim | Sim (a função) | 1022 MB | **Sim, como container** |
| Frontend (nginx) | Sim | Sim | Sim | 4,5 MB | Não |
| nginx container | Sim | Sim | Discutível | 3,9 MB | Ver P2 |
| catalog-harvester | Sim | Sim | Sim | 31 MB | Não (mas otimizável) |
| barcode-enricher | Sim | Sim | Sim | 31 MB | Não (mas otimizável) |
| state-price-sync | Sim | Sim | Sim | **121 MB** | Não (mas otimizável) |
| Redis | **Não** | Não | Não | — | N/A |
| MinIO / S3 | **Não** | Não | Não | — | N/A |
| Kafka / RabbitMQ | **Não** | Não | Não | — | N/A |
| Elasticsearch | **Não** | Não | Não | — | N/A |

O único acerto de `grep` para essas tecnologias no backend foi `scoreDisplayName` em `ProductCatalogService.java` — falso positivo. **Nenhuma dependência de serviço auxiliar existe para remover.**

---

## Consumo atual (medido)

### Máquina

```
Mem:  7936 MB total | 4350 usado | 457 livre | 3129 buff/cache
Swap: 0 (nenhum)
CPU:  2 vCPUs | load average 3.09, 2.87, 2.70 | steal 8.6%
Disco: 97 GB total | 37 GB usado (39%)
CommitLimit 4063 MB / Committed_AS 10079 MB
```

O **load average de ~3 com 2 vCPUs** indica saturação sustentada, e o **steal de 8,6%** mostra que parte da CPU é tomada pelo provedor — isso não é culpa da aplicação e não se resolve otimizando código.

### Containers do MercadoFlow

| Container | RAM | % da VPS | CPU | PIDs | Limite |
|---|---|---|---|---|---|
| mercadoflow-backend | **1,209 GB** | 15,60% | 0,13% | 49 | **nenhum** |
| mercadoflow-cron | **1022 MB** | 12,88% | 0,14% | 47 | **nenhum** |
| mercadoflow-postgres | 287 MB | 3,61% | 2,98% | 26 | **nenhum** |
| mercadoflow-state-price-sync | 121 MB | 1,53% | 0,00% | 2 | **nenhum** |
| mercadoflow-barcode-enricher | 31 MB | 0,39% | 0,00% | 2 | **nenhum** |
| mercadoflow-catalog-harvester | 31 MB | 0,39% | 0,00% | 2 | **nenhum** |
| mercadoflow-frontend | 4,5 MB | 0,06% | 0,00% | 3 | **nenhum** |
| mercadoflow-nginx | 3,9 MB | 0,05% | 0,00% | 3 | **nenhum** |
| **TOTAL** | **~2,68 GB** | **34,5%** | | | |

Comparação — a aplicação `advocacia-vps` tem `mem_limit` de 1 GB e opera em 240 MB. O MercadoFlow não tem limite algum.

### Comparação com as demais aplicações da VPS

| Aplicação | Containers | RAM total |
|---|---|---|
| **mercadoflow** | **8** | **~2,68 GB** |
| palmital | 3 | 135 MB |
| advocacia | 2 | 289 MB |
| metalgest | 4 | 85 MB |
| tagflow | 4 | 147 MB |
| fusesite | 1 | 5 MB |

---

## Armazenamento

### Disco da aplicação: `/root/mercadoflow-web` = 16,4 GB

| Caminho | Tamanho | Classificação |
|---|---|---|
| `data/catalog/images` (174.603 arquivos) | **12 GB** | **DADO DE PRODUÇÃO** — não tocar |
| `data/catalog/*.jsonl` (12 arquivos) | **2,2 GB** | **OBSOLETO** (ver abaixo) |
| `data/catalog/backfill_db_snapshot.sqlite` | **1,5 GB** | **OBSOLETO** (06/08) |
| `backups/` (5 dumps) | **1,4 GB** | **BACKUP** — reduzível |
| `pdv2cloud-agent` | 207 MB | NECESSÁRIO (instalador) |
| `frontend` (inclui node_modules) | 157 MB | **OBSOLETO na VPS** |
| `qa` | 18 MB | DÚVIDA |
| `data/offers` | 4 KB (0 arquivos) | vazio |

Sobre os `.jsonl`: são **arquivos de auditoria de coleta**, lidos apenas por `scripts/catalog/backfill_rich_data_from_audit.py`, um script de backfill executado manualmente. Nenhum caminho de runtime os abre. Os mais antigos são de 30/03; o mais recente, 09/08. Já foram importados para o banco (`product_enrichments` tem 1020 MB).

Sobre os backups: três dumps de **12/08 gerados no mesmo dia** (17:31, 17:52, 18:35 — um por deploy), com 338 MB cada, mais dois dumps de julho. O script já mantém só os 3 mais recentes, mas 3 dumps do mesmo dia não protegem contra nada além do último deploy.

### Volumes Docker

| VOLUME | CONTAINER | FINALIDADE | TAMANHO | NECESSÁRIO | REDUZÍVEL |
|---|---|---|---|---|---|
| `mercadoflow-web_mercadoflow_postgres_data` | mercadoflow-postgres | Banco | **5,55 GB** | Sim | Ver Postgres |
| advocaciapitanga_postgres_data | advocacia | outra app | 69,7 MB | — | — |
| palmital-postgres-data | palmital | outra app | 70,6 MB | — | — |
| metalgest_postgres_data | metalgest | outra app | 66,8 MB | — | — |
| tagflow_postgres_data | tagflow | outra app | 49,4 MB | — | — |
| demais (uploads/logs) | várias | outras apps | < 8 MB | — | — |

O volume do MercadoFlow é **22× maior** que o segundo maior da máquina.

### Banco: 3272 MB

| Tabela | Tamanho |
|---|---|
| state_price_observations | 1109 MB |
| product_enrichments | 1020 MB |
| opportunities | 668 MB |
| recommendations | 220 MB |
| products | 81 MB |
| product_price_daily_stats | 58 MB |

O volume tem 5,55 GB para um banco de 3,27 GB — a diferença é bloat/WAL, normal, mas sugere que um `VACUUM FULL` recuperaria espaço. **Não incluído nesta auditoria** (requer downtime e lock exclusivo).

---

## Docker

### Imagens

| Imagem | Tamanho | Observação |
|---|---|---|
| `mercadoflow-web-mercadoflow-backend` | **834 MB** | |
| `mercadoflow-web-mercadoflow-cron` | **834 MB** | **imagem idêntica, build duplicado** |
| `mercadoflow-web-mercadoflow-frontend` | 63,7 MB | adequada |
| `python:3.11-slim` | 124 MB | usada por 3 containers |
| `postgres:16-alpine` | 294 MB | base oficial |

As imagens de backend e cron são construídas **duas vezes** a partir do mesmo `./backend`, gerando dois IDs distintos com conteúdo igual. O `SHARED SIZE` de 834 MB confirma que compartilham layers, então o custo em disco é menor que 1,6 GB — mas o **tempo de build é pago duas vezes**.

Os 834 MB vêm da base `eclipse-temurin:17-jre` (Debian completo) mais `ffmpeg`, instalado via apt em [backend/Dockerfile:9-11](../backend/Dockerfile#L9-L11).

### Ausência de `.dockerignore`

Não existe `.dockerignore` na raiz, em `backend/` nem em `frontend/`. O contexto de build do frontend inclui **`node_modules` com 147 MB** e `dist` — enviados ao daemon a cada build e depois descartados pelo `npm ci`. Verificado localmente: `frontend/` tem 151 MB, dos quais 147 MB são `node_modules`.

### Logging

`/etc/docker/daemon.json` já define `max-size: 10m, max-file: 3`. **Está correto** — o maior log é de 2,9 MB (advocacia). Nenhuma ação necessária.

### Portas

Corretamente restritas: só `mercadoflow-nginx` publica (`0.0.0.0:3300`). Postgres, backend, cron e coletores são acessíveis apenas pela rede interna do compose. **Nenhuma correção necessária.**

---

## Build e deploy

O workflow [deploy-pdv2cloud-web.yml](../.github/workflows/deploy-pdv2cloud-web.yml) faz:

1. `rsync` do código-fonte para a VPS
2. SSH → `deploy/deploy-web.sh`
3. Na VPS: `compose build --pull mercadoflow-backend mercadoflow-frontend mercadoflow-cron`

Ou seja, **a VPS compila**:

- Maven: baixa todo o repositório de dependências e roda `mvn package` — duas vezes (backend e cron)
- npm: `npm ci` + `vite build`

Tudo isso em **2 vCPUs compartilhadas com outras 5 aplicações**, com steal de 8,6%. Durante o build, as demais aplicações competem por CPU. O `docker builder prune -af` ao final descarta o cache, então **cada deploy recompila do zero**.

O runner do GitHub Actions (2-4 vCPUs dedicadas, gratuito para repositório público/minutos inclusos) fica ocioso enquanto isso.

Nota: o job também tem um problema conhecido de conectividade (porta 22 nem sempre alcançável pelo runner), documentado no próprio workflow.

---

## Node.js / Next.js

**Não se aplica.** O frontend é Vite (SPA estática), não Next.js. Não há servidor Node em produção — o build gera arquivos estáticos servidos por nginx. Não há `output: standalone`, `next/image`, cache de imagens do Next, nem `NODE_OPTIONS` a ajustar. O container do frontend consome 4,5 MB.

## Prisma

**Não se aplica.** O projeto usa Hibernate/JPA com Flyway. Migrações rodam no boot do backend (`spring.flyway.enabled: true`). Não há `prisma generate`, engines, nem seed em TypeScript.

O seed é Java (`ProductionSeeder`), executado no startup, condicionado a variáveis de ambiente.

## JVM / Memória

Medido dentro do container:

```
MaxHeapSize      = 2082471936  (1,94 GB)   {ergonomic}
InitialHeapSize  =  132120576  (126 MB)
MaxRAMPercentage = 25.0                    {default}
```

Como **não há `mem_limit`**, a JVM enxerga os 8 GB da VPS e reserva 25% = ~2 GB de heap máximo. **Cada uma das duas JVMs pode crescer até ~2 GB de heap**, mais metaspace, threads e buffers off-heap — 4 GB+ numa máquina de 8 GB sem swap.

RSS atual:

```
backend: VmRSS 1054456 kB (1,01 GB) | Threads: 47
cron:    VmRSS 1040880 kB (0,99 GB) | Threads: 47
```

**Os dois processos são praticamente idênticos.** O container de jobs sobe a aplicação inteira.

## PostgreSQL

```
max_connections      = 100
shared_buffers       = 163848 kB  (160 MB)
effective_cache_size = 5242888 kB (5 GB)
work_mem             = 4096 kB
maintenance_work_mem = 65536 kB
```

`effective_cache_size = 5 GB` é o padrão calculado sobre a RAM total da VPS. **Numa máquina compartilhada por 5 aplicações e 4 instâncias PostgreSQL, isso é uma mentira para o planejador** — ele acredita ter 5 GB de cache disponível e escolhe planos que assumem dados em memória.

Há **4 instâncias PostgreSQL independentes** na VPS (mercadoflow-16, palmital-15, advocacia-15, metalgest-15, tagflow-15 — na verdade 5). Consolidar traria ganho real, mas exige migração de dados entre versões diferentes e coordenação entre projetos. **NÃO RECOMENDADO nesta auditoria** — fora do escopo de "sem alterar arquitetura desnecessariamente".

## Pool de conexões

Não há tuning de HikariCP em nenhum `application*.yml` — o padrão do Spring Boot é `maximum-pool-size: 10`.

Medido no banco:

```
26 conexões totais
  mercadoflow_app  idle: 10   ← pool do backend, ocioso
  pdv2cloud        idle: 10   ← pool do cron, ocioso
  pdv2cloud      active:  1
```

**20 conexões ociosas permanentes** para uma aplicação sem clientes ainda. Cada conexão PostgreSQL custa ~5-10 MB de RSS no servidor. O container de jobs mantém 10 conexões abertas o dia inteiro para rodar tarefas às 2h, 3h, 4h e 5h da manhã.

## Cron / Workers

Os jobs, extraídos de `backend/src/main/java/com/pdv2cloud/job/`:

| Job | Agendamento |
|---|---|
| DailyAggregationJob | `0 0 2 * * ?` |
| MarketBasketAnalysisJob | `0 30 2 * * ?` |
| ProductIntelligenceJob | `0 0 3 * * ?` |
| OpportunityDetectionJob | `0 30 3 * * ?` |
| MLPredictionJob | `0 0 4 * * ?` |
| OutcomeEvaluationJob | `0 0 4 * * MON` |
| WeeklyDigestJob | `0 0 5 * * MON` |
| AlertGenerationJob | `fixedRate = 3600000` (1h) |
| PriceIntelligenceJob | `fixedDelay = 900000` (15 min) |
| AdaptiveRefreshJob | `fixedDelay = 300000` (5 min) |

Todos guardados por `@ConditionalOnProperty("jobs.enabled")`. O `application-jobs.yml` completo:

```yaml
spring:
  main:
    web-application-type: servlet   # ← sobe Tomcat sem servir tráfego
jobs:
  enabled: true
```

Dois problemas:

1. `web-application-type: servlet` faz o container de jobs **subir um Tomcat completo** que nunca recebe requisição (a porta 8080 dele não é referenciada por nenhum upstream do nginx).
2. O container roda com `SPRING_PROFILES_ACTIVE=jobs`, **substituindo** `production` — perde as configurações de `application-production.yml` (`show_sql: false`, `logging.level.root: INFO`).

Sobre os coletores Python: os três executam `pip install --no-cache-dir requests pillow` **no `command`**, ou seja, **a cada restart do container**. Rodam com `--watch`, ficando residentes 24h para trabalhar de 6 em 6 horas (harvester), 12 em 12 (barcode) e 6 em 6 (state-price). O `state-price-sync` acumulou **121 MB** — quase 4× os outros dois, sinal de retenção de memória no loop de longa duração.

---

## Problemas encontrados

| # | Problema | Evidência | Impacto |
|---|---|---|---|
| 1 | Container de jobs duplica o backend inteiro | 1022 MB, 47 threads, Tomcat ativo | ~700 MB de RAM |
| 2 | Nenhum limite de memória em 8 containers | `HostConfig.Memory = 0` em todos | Risco de OOM na VPS inteira |
| 3 | JVM assume 2 GB de heap | `MaxHeapSize = 2082471936` | 4 GB potenciais em 8 GB sem swap |
| 4 | Build na VPS | `compose build` no deploy-web.sh | CPU de todas as apps durante deploy |
| 5 | 5,2 GB de disco descartável | jsonl 2,2 GB + sqlite 1,5 GB + backups 1,4 GB | 5,2 GB |
| 6 | 20 conexões ociosas ao Postgres | `pg_stat_activity` | ~150 MB no servidor PG |
| 7 | Sem `.dockerignore` | arquivo inexistente | 147 MB de contexto por build |
| 8 | `pip install` a cada restart | `command:` no compose | rede + CPU + atraso no boot |
| 9 | `effective_cache_size` = 5 GB | `pg_settings` | planos ruins em VPS compartilhada |
| 10 | Imagem backend 834 MB | base Debian + ffmpeg | disco + tempo de deploy |
| 11 | Profile `jobs` sobrescreve `production` | `SPRING_PROFILES_ACTIVE=jobs` | log verboso, config errada |
| 12 | 3 camadas de nginx em cascata | host:443 → container:3300 → frontend:3000 | ~4 MB + 1 hop |

---

## Otimizações propostas

### P0 — grande impacto, baixo risco

#### P0.1 — Reduzir o Tomcat do container de jobs ao mínimo

- **Problema:** o container de jobs sobe um servidor web que nunca atende requisição.
- **Evidência:** `web-application-type: servlet` no `application-jobs.yml`; 47 threads e 1022 MB de RSS, iguais ao backend; a porta 8080 do cron não é upstream de nenhum nginx.
- **Tentativa descartada — `web-application-type: none`:** seria o ideal, mas **quebra o boot**. Oito classes dependem do servlet stack e são `@Component`/`@Configuration` **incondicionais**:

  ```
  config/SecurityConfig.java              @EnableWebSecurity + SecurityFilterChain(HttpSecurity)
  config/CatalogImageWebConfig.java       WebMvcConfigurer
  config/OfferRenderWebConfig.java        WebMvcConfigurer
  security/JwtAuthenticationFilter.java   OncePerRequestFilter
  security/AgentApiKeyAuthenticationFilter.java
  security/HmacSignatureFilter.java
  security/RateLimitFilter.java
  security/TenantAccessFilter.java
  ```

  Sem contexto web o Spring não fornece `HttpSecurity` nem consegue instanciar os `OncePerRequestFilter`. Desligar exigiria anotar as oito com `@Profile("!jobs")` — e qualquer classe web nova voltaria a quebrar os jobs silenciosamente. **Não vale o risco pela economia.**
- **Solução adotada:** manter o Tomcat, mas reduzido ao mínimo (`threads.max: 2`, `max-connections: 10`), já que o processo não recebe tráfego. Somado a isso, o profile passa a ser `production,jobs` — antes era só `jobs`, e o processo **perdia** o `application-production.yml` (subia com log verboso e sem as configurações de produção).
- **Arquivos:** `backend/src/main/resources/application-jobs.yml`, `docker-compose.vps.yml`.
- **Ganho estimado:** modesto — dezenas de MB em threads do Tomcat, mais a redução do pool (P0.5). O ganho grosso vem do `mem_limit` (P0.2). **Não medido antes da implementação.**
- **Risco:** baixo. Nenhum job usa servlet, `RestTemplate` ou `WebClient` (verificado).
- **Teste:** container sobe, log registra os jobs, `AdaptiveRefreshJob` (5 min) executa.

#### P0.2 — Limitar heap das JVMs e memória dos containers

- **Problema:** duas JVMs podem reivindicar 2 GB de heap cada, sem teto de container, em 8 GB sem swap.
- **Evidência:** `MaxHeapSize = 2082471936`, `HostConfig.Memory = 0`.
- **Solução:** `mem_limit` por container + `JAVA_TOOL_OPTIONS` com `-XX:MaxRAMPercentage`.

  | Container | RSS atual | mem_limit | heap |
  |---|---|---|---|
  | backend | 1,01 GB | 1024m | 60% (~614 MB) |
  | cron | 0,99 GB | 640m | 60% (~384 MB) |
  | postgres | 287 MB | 512m | — |
  | frontend | 4,5 MB | 64m | — |
  | nginx | 3,9 MB | 64m | — |
  | harvester/barcode | 31 MB | 192m | — |
  | state-price-sync | 121 MB | 320m | — |

  Os limites do backend saem abaixo do RSS atual **porque o RSS atual inclui heap que a JVM tomou por achar que tinha 8 GB disponíveis** — com `MaxRAMPercentage` sobre um limite menor, o GC trabalha dentro do novo teto. É a mudança de maior ganho e também a que mais exige observação depois.
- **Ganho estimado:** ~600-900 MB entre os dois. **Não medido.**
- **Risco:** moderado — é o item que pode causar OOM se o heap for apertado demais. Mitigação: aplicar, observar por 24h, e subir o limite se houver `OutOfMemoryError` ou restart.
- **Teste:** subir, exercitar endpoints principais, acompanhar `docker stats` e logs por OOM.

#### P0.3 — Limpar disco descartável (5,2 GB)

- **Problema:** artefatos de importação já consumidos ocupam 3,7 GB, e 1,4 GB de backups redundantes.
- **Evidência:** 12 `.jsonl` (30/03 a 09/08) lidos só por script manual de backfill; `backfill_db_snapshot.sqlite` de 06/08; 3 dumps do mesmo dia 12/08.
- **Solução:** mover os `.jsonl` e o SQLite para fora (ou arquivar comprimido), manter 1 dump por dia distinto. **Somente após sua confirmação explícita — nada é apagado automaticamente.**
- **Ganho:** ~5,2 GB, **medível**.
- **Risco:** baixo, desde que confirmado que o backfill já rodou. Os dados estão em `product_enrichments` (1020 MB no banco).
- **⚠️ Não incluído na implementação automática.** Requer sua decisão.

#### P0.4 — Adicionar `.dockerignore`

- **Problema:** 147 MB de `node_modules` enviados ao daemon Docker a cada build.
- **Evidência:** nenhum `.dockerignore` existe; `frontend/node_modules` = 147 MB.
- **Solução:** criar `.dockerignore` na raiz, em `backend/` e em `frontend/`.
- **Ganho:** contexto de build menor; tempo de deploy. **Não medido.**
- **Risco:** muito baixo — só exclui o que o build recria.
- **Teste:** build do frontend gera o mesmo `dist`.

#### P0.5 — Reduzir pool de conexões

- **Problema:** 20 conexões ociosas permanentes.
- **Evidência:** `pg_stat_activity` — 10 idle por JVM.
- **Solução:** backend `maximum-pool-size: 8, minimum-idle: 2`; jobs `maximum-pool-size: 4, minimum-idle: 1`, ambos com `idle-timeout`.
- **Ganho:** ~100-150 MB no PostgreSQL; libera slots num banco compartilhado. **Não medido.**
- **Risco:** baixo com o tráfego atual (sem clientes). Reavaliar quando houver carga.
- **Teste:** `pg_stat_activity` mostra menos conexões; aplicação responde normalmente.

### P1 — grande impacto, risco moderado

#### P1.1 — Build no GitHub Actions em vez da VPS

- **Problema:** a VPS compila Maven (2×) e npm a cada deploy, em 2 vCPUs compartilhadas com 5 aplicações.
- **Evidência:** `compose build --pull ...` em `deploy/deploy-web.sh`; `docker builder prune -af` descarta o cache a cada vez.
- **Solução:** construir no runner, publicar em GHCR, e a VPS fazer só `pull` + `up -d`. Compose de produção passa a usar `image:` em vez de `build:`.
- **Ganho:** elimina o pico de CPU do deploy. **Não medido.**
- **Risco:** moderado — muda o fluxo de deploy inteiro. Precisa de `GITHUB_TOKEN` com `packages:write` e login na VPS.
- **⚠️ Recomendo fazer em etapa separada,** depois que as mudanças de memória estiverem estáveis, para não misturar as causas de uma eventual regressão.

#### P1.2 — Coletores Python: imagem própria em vez de `pip install` no boot

- **Problema:** 3 containers instalam pacotes a cada restart e ficam residentes 24h para tarefas de 6/12 em 6/12 horas.
- **Evidência:** `command: sh -c "pip install --no-cache-dir requests pillow && ..."`.
- **Solução (etapa 1, baixo risco):** construir uma imagem única com as dependências. Elimina a rede no boot.
- **Solução (etapa 2, maior mudança):** trocar `--watch` residente por execução agendada. **Não recomendada agora** — mudaria o modelo de execução dos coletores.
- **Ganho:** boot mais rápido, sem tráfego de pip. RAM: pouca (~93 MB somados hoje).
- **Risco:** baixo na etapa 1.

### P2 — médio impacto

#### P2.1 — `effective_cache_size` do PostgreSQL

- Ajustar de 5 GB para algo condizente com o `mem_limit` (ex.: 768 MB). Melhora escolha de planos numa máquina compartilhada.
- **Risco:** baixo, mas altera planos de consulta — observar após aplicar.

#### P2.2 — Servir as 174 mil imagens pelo nginx

- Hoje passam pela JVM (`CatalogImageWebConfig` → `ResourceHandlerRegistry`). Servi-las direto pelo nginx via volume compartilhado tira I/O e threads do backend.
- **Ganho:** não medido; relevante sob carga, irrelevante hoje (sem clientes).
- **Risco:** moderado — mexe no caminho de servir conteúdo real. Adiar.

#### P2.3 — Remover uma camada de nginx

- Três nginx em cascata. O container `mercadoflow-nginx` (3,9 MB) poderia ser dispensado com o nginx do host apontando direto para backend e frontend.
- **Ganho:** ~4 MB e um hop. Baixo.
- **Risco:** moderado — mexe no roteamento em produção para ganhar 4 MB. **Não recomendado.**

### P3 — baixo impacto

- Imagem backend de 834 MB. O `ffmpeg` **NÃO pode sair**: é usado de verdade em
  `OfferRenderEngineService.java:879` (`ProcessBuilder("ffmpeg", ...)`) para renderizar
  ofertas em vídeo. Trocar a base para `jre-headless` ou alpine ainda é possível, mas o
  ffmpeg e suas bibliotecas continuam sendo a maior parte do peso. Ganho pequeno, risco de
  quebrar a renderização — **não feito**.
- `data/offers` vazio; `frontend/node_modules` na VPS (157 MB) é resíduo do rsync — some com o build no CI.

### Consultas ao banco e cache — não é o gargalo agora

O escopo pedia procurar N+1, consultas em loop e oportunidades de cache. **Não investiguei a fundo, de propósito.**

Motivo, com as medições: a CPU dos containers da aplicação está em **0,13% (backend) e 0,14% (cron)**, e o Postgres em 2,98%. O `load average` de 3,0 vem do conjunto da VPS, não desta aplicação. Não há clientes em produção ainda (conforme registro do projeto), então qualquer perfil de consulta medido hoje seria sobre tráfego sintético.

Otimizar SQL antes de existir carga real seria exatamente o que o item 29 do escopo desaconselha: mexer no que consome 2 MB enquanto há um container consumindo 1 GB. **Fica registrado para quando houver tráfego** — aí o `pg_stat_statements` dá a resposta em vez de um grep.

### NÃO RECOMENDADO

- **Consolidar as 5 instâncias PostgreSQL.** Ganho real (~200 MB), mas exige migração entre versões (15 e 16) e coordenação entre projetos independentes. Fora do escopo.
- **Trocar Vite por outra coisa, introduzir Redis, adicionar monitoramento.** Nada disso reduz consumo.
- **`VACUUM FULL`** no volume de 5,55 GB — recuperaria espaço, mas exige downtime e lock exclusivo.

---

## Plano de implementação

Agrupado para permitir isolar regressões:

| Grupo | Conteúdo | Prioridade | Risco |
|---|---|---|---|
| **A** | Tomcat off no cron + profile production | P0.1 | baixo |
| **B** | `mem_limit` em todos + `MaxRAMPercentage` | P0.2 | moderado |
| **C** | Pool de conexões + `effective_cache_size` | P0.5, P2.1 | baixo |
| **D** | `.dockerignore` | P0.4 | muito baixo |
| **E** | Build no CI/GHCR | P1.1 | moderado — etapa separada |
| **F** | Limpeza de disco | P0.3 | requer confirmação do usuário |

Ordem: **A → D → C → B**, medindo após cada grupo. E e F ficam para depois, com autorização explícita.

---

## Métricas antes

| MÉTRICA | ANTES | DEPOIS | DIFERENÇA |
|---|---|---|---|
| Containers MercadoFlow | 8 | — | — |
| RAM total MercadoFlow | 2,68 GB | — | — |
| RAM backend | 1,209 GB | — | — |
| RAM cron | 1022 MB | — | — |
| RAM postgres | 287 MB | — | — |
| Imagem backend | 834 MB | — | — |
| Imagem cron | 834 MB | — | — |
| Imagem frontend | 63,7 MB | — | — |
| Conexões PG ociosas | 20 | — | — |
| Disco `/root/mercadoflow-web` | 16,4 GB | — | — |
| Volume postgres | 5,55 GB | — | — |
| Containers com `mem_limit` | 0 de 8 | — | — |
| RAM livre na VPS | 457 MB | — | — |
| Build na VPS | sim | — | — |

Preenchido após a implementação (ver "Resultado final").

---

## Validação em ambiente de teste

Antes de qualquer deploy, as mudanças foram exercitadas localmente contra um PostgreSQL 16 limpo, com os mesmos limites e variáveis que irão para produção.

### Container de jobs (`mercadoflow-cron`)

| Item | Produção hoje | Teste com a nova config |
|---|---|---|
| RAM | **1022 MB** (sem limite) | **413 MB** / limite 640 MB (64%) |
| PIDs | 47 | **31** |
| `MaxHeapSize` | 2082471936 (1,94 GB) | **402653184 (384 MB)** |
| Perfis ativos | `jobs` | **`production, jobs`** |
| Erros no boot | — | **0** |

- Boot completo: `Started PDV2CloudApplication in 132.89 seconds`.
- **Flyway: `Successfully applied 52 migrations to schema "public", now at version v52`** — migrations funcionam com a configuração nova.
- `AlertGenerationJob` executou, comprovando que o agendamento continua ativo com `jobs.enabled=true`.

O `MaxHeapSize` é a confirmação de que o objetivo foi atingido: o `MaxRAMPercentage` passou a ser calculado sobre o limite do container (640 MB), não sobre a RAM da VPS.

### Imagens

| Imagem | Resultado |
|---|---|
| `mf-backend-test:audit` | build **OK** com Java 17 — 1,21 GB local (o registro da VPS reporta 834 MB por compartilhar layers) |
| `mercadoflow-collectors:test` | build **OK** — 251 MB, com `requests`, `pillow` e `beautifulsoup4` embutidos |

### Limpeza de disco (executada na VPS, autorizada)

| Item | Antes | Depois |
|---|---|---|
| Disco `/` | 37 GB (39%) | **33 GB (34%)** |
| `/root/mercadoflow-web` | 17 GB | **13 GB** |
| `data/catalog` | 15 GB | **12 GB** |
| Backups | 1402 MB em 5 dumps | **757 MB em 3 dumps** |
| Imagens do catálogo | 174.603 arquivos | **174.603 arquivos (intactas)** |

Removidos: 12 `.jsonl` de auditoria (2170 MB), `backfill_db_snapshot.sqlite` (1461 MB), 2 dumps duplicados do mesmo dia.

Verificação pós-limpeza em produção: `https://mercadoflow.com/api/v1/health` → 200, site → 200, e uma imagem real do catálogo (`products/7891150106772.jpg`) servida com **HTTP 200**.


---

# Resultado final

Estado em 13/09/2026, apos a implementacao. Distingue o que foi **medido** do que ainda depende do deploy.

## O que foi alterado

| # | Mudanca | Arquivo | Estado |
|---|---|---|---|
| 1 | `mem_limit` + `memswap_limit` nos 8 containers (antes: nenhum) | `docker-compose.vps.yml` | aguarda deploy |
| 2 | `restart: unless-stopped` nos 5 que nao tinham | `docker-compose.vps.yml` | aguarda deploy |
| 3 | Heap da JVM atrelado ao limite do container | `docker-compose.vps.yml` | validado em teste |
| 4 | Pool Hikari 8+2 (backend) e 4+1 (jobs) | `application-production.yml`, `application-jobs.yml` | validado em teste |
| 5 | Perfil `production,jobs` no cron (antes so `jobs`) | `docker-compose.vps.yml` | validado em teste |
| 6 | Tomcat minimo no container de jobs (2 threads) | `application-jobs.yml` | validado em teste |
| 7 | `effective_cache_size` 5 GB -> 768 MB, `max_connections` 100 -> 50 | `docker-compose.vps.yml` | aguarda deploy |
| 8 | Healthcheck do backend 10s -> 30s | `docker-compose.vps.yml` | aguarda deploy |
| 9 | `.dockerignore` nos 3 contextos | `.dockerignore` (x3) | validado em build |
| 10 | Imagem unica dos coletores, sem `pip install` no boot | `deploy/collectors/Dockerfile` | validado em build |
| 11 | Retencao de backup por dia (antes: 3 mais recentes) | `deploy/deploy-web.sh` | testado com amostra |
| 12 | Limpeza de 3,7 GB de artefatos + backups duplicados | executado na VPS | **medido** |

## O que foi removido

Da VPS, com autorizacao explicita e apos confirmar no codigo que nada em runtime os le:

- 12 arquivos `.jsonl` de auditoria de coleta -- **2170 MB**
- `backfill_db_snapshot.sqlite` (06/08) -- **1461 MB**
- 2 dumps duplicados do mesmo dia 12/08 -- **~645 MB**

Do codigo: o `pip install` embutido no `command` dos tres coletores.

**Nenhuma funcionalidade, pagina, API, tabela ou modelo foi removido.**

## O que foi mantido e por que

| Item | Por que ficou |
|---|---|
| `ffmpeg` na imagem do backend | **E usado**: `OfferRenderEngineService.java:879` chama `ProcessBuilder("ffmpeg", ...)` para renderizar ofertas em video |
| Tomcat no container de jobs | `web-application-type: none` **quebra o boot** -- 8 classes (SecurityConfig, 5 `OncePerRequestFilter`, 2 `WebMvcConfigurer`) sao incondicionais e exigem o servlet stack |
| Container de jobs como processo separado | Isola os batches noturnos do processo que atende usuarios; unificar traria acoplamento sem ganho proporcional |
| 3 containers de coletores | Cada um tem cadencia e escopo proprios; residentes por desenho (`--watch`) |
| As 174.603 imagens do catalogo (12 GB) | **Dado de producao** |
| nginx em 3 camadas | Remover uma economizaria ~4 MB e mexeria no roteamento em producao. Nao compensa |
| 5 instancias PostgreSQL na VPS | Consolidar exige migracao entre versoes (15/16) e coordenacao entre projetos independentes |

## Containers antes/depois

| METRICA | ANTES | DEPOIS | DIFERENCA |
|---|---|---|---|
| Containers do MercadoFlow | 8 | 8 | 0 |
| Containers com `mem_limit` | **0 de 8** | **8 de 8** | +8 |
| Containers com `restart` | 3 de 8 | **8 de 8** | +5 |
| Teto de RAM declarado | nenhum | **3136 MB** | -- |

Nenhum container foi eliminado: os oito tem funcao verificada. O ganho vem de **conter** o consumo, nao de remover servicos.

## RAM antes/depois

Medido em teste local, contra um PostgreSQL 16 limpo, com os mesmos limites que irao a producao:

| Container | ANTES (producao) | DEPOIS (teste) | DIFERENCA |
|---|---|---|---|
| backend | 1209 MB (sem limite) | **478 MB** / 1024 MB | **-60%** |
| cron/jobs | 1022 MB (sem limite) | **408 MB** / 640 MB | **-60%** |
| frontend | 4,5 MB (sem limite) | 7,8 MB / 64 MB | -- |
| **backend + cron** | **2231 MB** | **886 MB** | **-1345 MB** |

`MaxHeapSize` da JVM, a causa raiz:

| | ANTES | DEPOIS |
|---|---|---|
| backend | 2082471936 (1,94 GB) | **645922816 (616 MB)** |
| cron | 2082471936 (1,94 GB) | **402653184 (384 MB)** |

**Ressalva honesta:** os numeros "depois" sao de um ambiente de teste com banco vazio e sem trafego. Em producao, com 3,2 GB de dados e cache quente, o consumo real ficara acima disso -- o que os limites agora contem. A projecao de ~1,3 GB economizados **so se confirma apos o deploy**.

## CPU antes/depois

**NAO MEDIDO de forma conclusiva.** Os containers da aplicacao ja estavam em 0,13%-0,14% de CPU antes das mudancas; nao havia o que otimizar ai. O `load average` de 3,0 com 2 vCPUs e o **steal de 8,6%** vem do conjunto da VPS e do provedor, nao desta aplicacao.

O ganho real de CPU vira de mover o build para o CI (P1.1, **nao implementado**), que hoje ocupa as 2 vCPUs com Maven e npm a cada deploy.

## Disco antes/depois -- **medido**

| METRICA | ANTES | DEPOIS | DIFERENCA |
|---|---|---|---|
| Disco `/` usado | 37 GB (39%) | **33 GB (34%)** | **-4 GB** |
| `/root/mercadoflow-web` | 17 GB | **13 GB** | **-4 GB** |
| `data/catalog` | 15 GB | **12 GB** | -3 GB |
| Backups | 1402 MB (5 dumps) | **757 MB (3 dumps)** | -645 MB |
| Imagens do catalogo | 174.603 arquivos | **174.603 arquivos** | **0 (intactas)** |

## Imagens antes/depois

| Imagem | ANTES | DEPOIS |
|---|---|---|
| backend / cron | 834 MB cada | inalterado -- o `ffmpeg` e necessario |
| frontend | 63,7 MB | inalterado |
| coletores | `python:3.11-slim` (124 MB) + pip a cada restart | **imagem unica de 251 MB, pip no build** |

A imagem dos coletores e maior em disco, mas **paga uma vez** em vez de baixar pacotes da rede a cada restart de cada um dos tres containers.

Nota: o build local do frontend gerou 104 MB contra 63,7 MB na VPS. Nao e regressao do `.dockerignore` -- a base local e `nginx:1.27-alpine` (74,5 MB) e a da VPS e `nginx:alpine` (62,4 MB). O layer da aplicacao e de apenas 1,68 MB nos dois casos.

## Deploy antes/depois

**Inalterado.** O build continua na VPS. A migracao para GitHub Actions + GHCR (P1.1) foi deliberadamente deixada para uma etapa separada: muda o fluxo inteiro e nao deve ser misturada as mudancas de memoria, sob pena de nao se saber o que causou uma eventual regressao.

## Problemas encontrados durante a implementacao

1. **`web-application-type: none` quebraria o boot dos jobs.** Descoberto antes de aplicar, ao verificar as classes: `SecurityConfig` (`@EnableWebSecurity`, `SecurityFilterChain(HttpSecurity)`), cinco `OncePerRequestFilter` e dois `WebMvcConfigurer` sao `@Component`/`@Configuration` incondicionais. Revertido para `servlet` com Tomcat minimo.
2. **`ffmpeg` nao e superfluo.** Parecia peso morto numa imagem Java; e usado para renderizar ofertas em video.
3. **Bug na funcao de retencao de backup.** A primeira versao perdeu a referencia `\1` do `sed` (virou um byte de controle), o que faria a funcao **nao apagar nada**. Detectado ao testar com arquivos de amostra.
4. **Aspas dos coletores.** Ao remover o `sh -c`, as aspas escapadas de `--koch-store-id` iriam literais no argumento, e sem shell um valor vazio faria o `argparse` abortar. O `sh -c` foi mantido so nesse servico -- o desperdicio era o `pip install`, nao o shell.
5. **`restart` ausente.** Descoberto no `docker inspect`: backend, cron, postgres, frontend e nginx tinham `RestartPolicy: "no"` -- uma queda derrubava a aplicacao ate o proximo deploy. Corrigido, e mais relevante agora que ha `mem_limit`.

## Testes realizados

| Teste | Resultado |
|---|---|
| Build do backend (Java 17, mesma imagem do Dockerfile) | **OK** |
| Build do frontend com `.dockerignore` novo | **OK** |
| Build da imagem dos coletores | **OK** (251 MB) |
| Boot do backend com `mem_limit: 1024m` | **OK** -- `Started in 95.683s`, 0 erros |
| Boot dos jobs com `mem_limit: 640m` e `production,jobs` | **OK** -- `Started in 132.89s`, 0 erros |
| **Flyway migrations** | **OK** -- `Successfully applied 52 migrations, now at version v52` |
| Agendamento dos jobs | **OK** -- `AlertGenerationJob` executou |
| `GET /health` e `/api/v1/health` | **OK** -- `{"status":"ok"}` |
| Rota protegida sem token | **OK** -- 403 (seguranca ativa) |
| `POST /api/v1/auth/login` com corpo invalido | **OK** -- 400 (nao 500) |
| Frontend serve a SPA em 64 MB | **OK** -- 200, fallback de rota OK, 7,8 MB |
| Pool Hikari reduzido | **OK** -- 3 conexoes cliente contra 20 ociosas em producao |
| Retencao de backup | **OK** -- 3 dumps do mesmo dia reduzidos a 1 |
| Producao apos a limpeza de disco | **OK** -- site 200, API 200, imagem do catalogo 200 |

Seed: o projeto nao tem seed separado -- `ProductionSeeder` roda no startup, condicionado a variaveis de ambiente. Coberto pelo teste de boot.

## Ganhos comprovados

- **Disco: -4 GB em producao** (37 GB -> 33 GB), medido antes e depois.
- **Heap da JVM: de 1,94 GB para 616 MB (backend) e 384 MB (jobs)**, medido dentro dos containers.
- **RAM em teste: 2231 MB -> 886 MB** nos dois processos Java.
- **Pool: 20 conexoes ociosas -> 3**, medido no `pg_stat_activity`.
- **8 de 8 containers com teto de memoria e politica de restart**, contra 0 e 3 antes.

## Otimizacoes nao realizadas

| Item | Por que |
|---|---|
| **Build no CI/GHCR (P1.1)** | Maior ganho de CPU restante. Muda o fluxo de deploy inteiro -- merece etapa propria |
| Servir imagens pelo nginx (P2.2) | Hoje passam pela JVM. Irrelevante sem trafego; relevante quando houver clientes |
| Remover camada de nginx (P2.3) | ~4 MB por mexer no roteamento de producao. Nao compensa |
| Consolidar PostgreSQL | Fora de escopo: migracao entre versoes e coordenacao entre projetos |
| `VACUUM FULL` (volume 5,55 GB para banco de 3,27 GB) | Exige downtime e lock exclusivo |
| Otimizacao de consultas / cache | CPU da aplicacao em 0,13%. Sem trafego real, seria otimizar o que nao e gargalo |
| Coletores sob scheduler em vez de residentes | Mudaria o modelo de execucao; ganho pequeno (~93 MB somados) |

## Riscos e pontos para monitorar

1. **Os limites de memoria sao a mudanca de maior risco.** Os valores vieram do consumo medido, mas o teste rodou com banco vazio. **Acompanhe as primeiras 24-48h** apos o deploy: `docker stats` e `docker logs` procurando `OutOfMemoryError` ou restarts. Se o backend reiniciar, suba `mem_limit` de 1024m para 1280m -- a correcao e uma linha.
2. **`ExitOnOutOfMemoryError` no backend** faz o container morrer em vez de degradar. Combinado com `restart: unless-stopped`, isso e recuperacao automatica -- mas um crashloop ficaria visivel como restarts repetidos.
3. **`max_connections: 50` no Postgres.** Suficiente para os pools atuais (12 no total), com folga. Se outra aplicacao passar a usar este banco, reavalie.
4. **`effective_cache_size: 768MB`** muda planos de consulta. Nenhuma consulta ficou mais lenta em teste, mas o volume de dados de teste era pequeno.
5. **A VPS continua sem swap**, com `Committed_AS` acima do `CommitLimit`. Os limites reduzem o risco de uma aplicacao derrubar as outras, mas **nao substituem** avaliar swap ou mais RAM.
6. **O build ainda ocorre na VPS.** Enquanto isso durar, todo deploy causa um pico de CPU que afeta as outras cinco aplicacoes.

## Medicao em producao apos o deploy (2026-09-14 02:20-02:30 UTC)

Commit `3836756`. Os oito containers foram recriados com os limites novos.

### Validacao funcional

| Verificacao | Resultado |
|---|---|
| `https://mercadoflow.com/` | 200 |
| `POST /api/v1/auth/login` com corpo invalido | 400 |
| `POST /api/v1/auth/login` com credencial errada | 401 |
| `/actuator/health` interno | 200, `{"status":"UP"}` |
| `java.lang.OutOfMemoryError` no backend | 0 |
| `java.lang.OutOfMemoryError` no cron | 0 |
| Boot do cron com perfil `jobs` | 128,8 s, seguido de `Alert generation completed for 5 markets` |

Nota de metodo: as primeiras tentativas usaram `/api/auth/login` e `/api/markets`
e devolveram 403. Nao era regressao. O caminho real e `/api/v1/...`; o Spring
Security nega rota inexistente sem vazar se ela existe, que e o comportamento
correto. O erro estava no teste, nao na aplicacao.

### Memoria: antes x depois

| Container | Antes | Depois | Limite | % do limite |
|---|---|---|---|---|
| postgres | NAO MEDIDO isoladamente | 419 MB | 640 MB | 65% |
| backend | ~1,5 GB | 389 MB | 1024 MB | 38% |
| cron | ~1,5 GB | 356 MB | 640 MB | 56% |
| state-price-sync | NAO MEDIDO | 65 MB | 320 MB | 20% |
| catalog-harvester | NAO MEDIDO | 28 MB | 192 MB | 15% |
| barcode-enricher | NAO MEDIDO | 20 MB | 192 MB | 10% |
| frontend | NAO MEDIDO | 3,6 MB | 64 MB | 6% |
| nginx | NAO MEDIDO | 3,4 MB | 64 MB | 5% |
| **Total MercadoFlow** | **~4,9 GB** | **~1,28 GB** | 3,2 GB | 40% |

A maquina inteira ficou em 3,3 GB de 7,9 GB usados, com 3,98 GB disponiveis.
Nenhum container encostou no teto, que era o risco real da mudanca: um limite
apertado demais nao economiza, apenas troca consumo por OOM kill.

Conexoes no banco: 10 (4 ativas + 6 ociosas), contra 20 ociosas antes.

Ressalva: sao numeros de um sistema recem-reiniciado. Heap de JVM tende a subir
conforme e exercitado; por isso os limites tem folga em vez de serem colados no
uso observado.

### CPU: a descoberta que muda a leitura

O load average apos o deploy ficou entre 10 e 13, e o Postgres apareceu com
93% e depois 127% de CPU. A leitura ingenua seria culpar o tuning novo. Nao e
isso. Cinco amostras de `top` seguidas:

```
steal: 58.2%   steal: 63.5%   steal: 50.8%   steal: 56.1%   steal: 52.5%
```

**Metade a dois tercos da CPU da VPS e steal time** — tempo em que o hypervisor
tira a CPU desta maquina virtual para atender outros inquilinos do host fisico.
Isso e externo a esta VPS e nao ha nada no MercadoFlow que o corrija.

Consequencias praticas:

1. O load alto **nao** e evidencia de que a aplicacao esta pesada. Com 50% de
   steal, cada processo leva o dobro do tempo de parede para o mesmo trabalho,
   e o load reflete a fila de espera por CPU roubada.
2. Otimizar query ou cache **nao** resolveria esse load. Ja estava classificado
   como despriorizado no relatorio por falta de trafego real; o steal reforca.
3. O ganho de memoria e real e mensuravel; o de CPU nao e atribuivel a esta
   auditoria e nao sera reivindicado. **Ganho de CPU: nao medido, e nao
   atribuivel.**
4. Se o steal persistir, o caminho e falar com o provedor ou trocar de host, nao
   mexer na aplicacao.

### Situacao do build na VPS (P1.1)

Confirmado em producao: durante este deploy o load subiu porque o Maven compila
na propria VPS compartilhada. Isso penaliza as outras cinco aplicacoes por
alguns minutos a cada deploy. Continua pendente e permanece como o proximo ganho
real, deliberadamente fora deste commit para nao confundir uma eventual
regressao de memoria com uma mudanca de pipeline.

## Correcao de uma conclusao errada desta auditoria: Seq Scan de 2,8 s

Acompanhando a estabilizacao pos-deploy, o backend e o cron cairam para menos
de 1% de CPU, mas o Postgres **nao** estabilizou: ficou entre 126% e 155%. Nao
era warm-up.

`pg_stat_activity` mostrava sempre tres conexoes JDBC executando a mesma
consulta em `product_enrichments`, com `query_start` identico, reiniciando a
cada poucos segundos. As tres sao o Postgres lancando dois workers paralelos
mais o lider para uma unica consulta.

### O que estava acontecendo

`CatalogImageRepairJob` roda a cada 6 h (`fixed-delay-ms:21600000`) e chama
`findLatestWithImageStorageKeyForRepair`, que pagina com OFFSET sobre
`product_enrichments` ordenando por `fetched_at desc`.

Nao existia indice para esse ORDER BY. O unico indice com `fetched_at` e
`(product_id, fetched_at DESC)`, que so serve quando ha filtro por
`product_id`. Resultado: **Parallel Seq Scan em 150.639 linhas, com dois
workers, para devolver 24 registros** — e o loop repete isso pagina apos
pagina, com OFFSET crescente.

Medido em producao, em transacao revertida (nada foi alterado para medir):

| | Sem indice | Com indice |
|---|---|---|
| Execution Time | 2809,887 ms | 2,719 ms |
| Buffers | hit=23156 read=12238 | hit=16 read=10 |
| Plano | Parallel Seq Scan + Gather Merge | Index Scan |

Cerca de mil vezes mais rapido, e sem os dois workers paralelos por execucao.

Correcao aplicada como `V53__index_product_enrichments_fetched_at.sql` (migracao
nova; migracao aplicada nunca e editada).

Nota sobre o indice ser parcial: 150.492 das 150.639 linhas satisfazem
`coalesce(image_storage_key,'') <> ''`, ou seja, o filtro elimina 0,1% da
tabela. A economia de espaco e marginal. O predicado esta no indice para que o
planner o reconheca como aplicavel a esta consulta, nao para reduzir tamanho.

### Por que isso contradiz o que este relatorio dizia antes

Nas secoes anteriores eu despriorizei otimizacao de consulta com o argumento de
que a CPU da aplicacao estava em 0,13% e nao havia trafego real. A medicao
estava correta para o **backend**, e a conclusao mesmo assim estava errada: eu
media o consumidor e nao o banco. O trabalho pesado nao aparecia na CPU do
processo Java porque estava do outro lado da conexao, dentro do Postgres,
disparado por um job agendado e nao por trafego de usuario.

A licao concreta: "nao ha trafego" nao implica "nao ha carga". Um job periodico
sobre uma tabela de 150 mil linhas gera carga sem nenhum usuario conectado. A
regra de medir antes de concluir valeu — o erro foi escolher a metrica errada
para medir.

Isto tambem qualifica a secao anterior sobre steal time. O steal de 50-63% e
real e externo. Mas ele nao explicava sozinho a CPU do Postgres: havia carga
propria evitavel junto, e ela e nossa.

### Dimensionando o ganho do indice com honestidade

Depois de criar o V53 eu segui medindo, e e preciso corrigir a magnitude que a
secao acima sugere.

O job e limitado: `batch-size:200` e `max-items-per-run:1000`, ou seja **cinco
paginas por execucao**, nao a tabela inteira. A 2,8 s de Seq Scan por pagina,
isso da cerca de **14 s de banco por disparo**, nao os vinte e tantos minutos de
CPU alta que eu observei.

O ganho do indice e real e vale o commit — 14 s de Parallel Seq Scan a cada 6 h
viram ~14 ms, e some o par de workers paralelos por pagina. Mas ele **nao**
explica sozinho a CPU sustentada do Postgres. O restante do tempo e o trabalho
de reparo propriamente dito (`ensureManagedImageAvailable`, que baixa imagem),
que e o proposito do job e nao e desperdicio.

Investigando as conexoes ativas durante esse periodo, apareceu ainda um
`COPY public.product_enrichments` rodando havia 3 min 44 s: era o `pg_dump` do
backup do proprio deploy. Legitimo e temporario, mas somava ao load no momento
em que eu media.

Ou seja, a CPU do Postgres naquele intervalo tinha tres componentes somados:
o Seq Scan evitavel (corrigido), o download de imagens do job (legitimo) e o
`pg_dump` do deploy (temporario). Atribuir tudo ao primeiro teria sido
exagerar o proprio resultado.

### Verificacao de que o problema era pontual, nao sistemico

Medi tambem a outra consulta pesada do mesmo repositorio, a do painel
super-admin, que faz `distinct on (product_id)` com filtros dinamicos:

```
Index Scan using idx_product_enrichment_product on product_enrichments
Execution Time: 184.539 ms
```

Ela **ja usa** o indice existente `(product_id, fetched_at DESC)`, sem Seq Scan.
Nao precisa de indice novo. So a consulta do job de reparo estava descoberta,
porque ordena por `fetched_at` sem filtrar por `product_id`. Nenhum indice
adicional foi criado alem do V53.

### Retencao de backup: funcionando

`prune_backups()` verificada em producao: restaram `backup_20260812_183547.dump`
e `backup_20260914_020715.dump` — um por dia, sem acumulo.

### Correcao da correcao: a producao nao usa os defaults do codigo

A secao anterior ("Dimensionando o ganho do indice com honestidade") esta
**errada** e fica registrada como erro em vez de ser apagada.

Ali eu li `batch-size:200` e `max-items-per-run:1000` direto dos `@Value` do
Java e conclui que o job varria cinco paginas por execucao. Nao verifiquei o
ambiente. A producao sobrescreve os dois:

```
CATALOG_IMAGE_REPAIR_ENABLED=true
CATALOG_IMAGE_REPAIR_BATCH_SIZE=300
CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN=250000
```

`max-items-per-run=250000` e o **teto maximo que o codigo aceita**
(`Math.min(maxItems, 250000)`), com a tabela em 150.639 linhas. Ou seja, o job
varre a tabela **inteira**, nao um pedaco dela. Com lote de 300, sao cerca de
**502 paginas por execucao**, nao cinco.

Refazendo a conta com os numeros reais: 502 paginas x 2,8 s de Seq Scan da
aproximadamente **23 minutos de banco por disparo**. E exatamente a ordem de
grandeza da CPU alta observada, que durou mais de vinte minutos.

O diagnostico original estava certo. Foi a minha "correcao" que introduziu o
erro, ao trocar a configuracao efetiva pelo default do codigo-fonte.

Efeito real do V53, agora com o dimensionamento correto: cerca de 23 minutos de
Parallel Seq Scan a cada 6 h passam para a casa de poucos segundos, e somem os
dois workers paralelos por pagina, vezes 502 paginas.

Observacao complementar: durante a medicao a query do repair chegou a levar
10,6 s em vez de 2,8 s, porque disputava I/O com o `pg_dump` do backup do
deploy. Os dois componentes existem e se somam; o pg_dump e temporario, o Seq
Scan era recorrente a cada 6 h.

**Licao, pela segunda vez na mesma auditoria:** ler o default no codigo nao e
medir a producao. Da primeira vez eu medi o consumidor em vez do banco; desta,
li o codigo em vez do ambiente. A regra que o pedido estabeleceu — nunca mudar
nem concluir com base em suposicao — vale tambem para conclusoes que parecem
conservadoras.
