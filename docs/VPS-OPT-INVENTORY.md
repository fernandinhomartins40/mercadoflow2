# Inventário VPS e stack — PDV2Cloud / MercadoFlow

**Data da coleta:** 2026-09-23 (America/Sao_Paulo)  
**Escopo:** descoberta estática do checkout e consultas locais de leitura. Nenhuma alteração de aplicação/configuração/serviços foi feita nesta etapa.  
**Limitacao principal:** a primeira coleta foi local em Windows; um addendum autenticado via Paramiko em 2026-09-24 registrou snapshot remoto. O proprietario informa que a VPS foi reinstalada e esta em ambiente nao produtivo. Uso/ownership das oito stacks Compose vistas no snapshot, consumers externos e estado remoto atual permanecem nao verificados; a coleta local nao representa a VPS.

## Convenções

- **VERIFIED**: evidência direta no checkout ou saída de comando registrada; o escopo da evidência é indicado. Uma declaração no código não prova presença ou uso em produção.
- **PENDING**: evidência insuficiente para confirmar situação ou uso.
- **NOT VERIFIED**: não foi possível verificar por falta de acesso/observabilidade; não significa ausência.
- **NOT APPLICABLE**: evidência da stack demonstra que a tecnologia não integra o fluxo catalogado; reavaliar se a stack mudar.
- IDs `APP-*`, `CTR-*`, `PROC-*`, `JOB-*`, `DB-*`, `VOL-*`, `STO-*`, `BLD-*`, `DEP-*`, `CFG-*`, `EXT-*`, `OBS-*` são estáveis; itens novos devem receber novos IDs, sem reutilizar IDs existentes.

## Arquitetura e aplicações

| ID | Aplicação/área | Declarado / referenciado | Uso e papel conhecido | Necessidade / persistência | Status |
|---|---|---|---|---|---|
| APP-01 | Backend HTTP | Spring Boot 4.1.1 candidate, Java 17, Maven; current `backend/pom.xml` working tree (HEAD baseline is 3.2.5), `backend/Dockerfile`; endpoints, JPA e schedulers no codigo | API REST, autenticacao, ingestao de dados, catalogo, billing opcional, logica SaaS e endpoints health | Necessario para API web e build/deploy; persiste estado no PostgreSQL e arquivos locais de catalogo/ofertas | VERIFIED (checkout e IMG-18 suite/DB smoke local); NOT VERIFIED (release, uso e runtime efetivo na VPS nao correlacionados) |
| APP-02 | Frontend web | React 18, TypeScript, Vite; `frontend/package.json` | SPA de operação/administração, servida por Nginx no container | Necessário para web; build Node 20 no Dockerfile. Artefatos estáticos não são estado persistente | NOT VERIFIED (uso no ambiente alvo) |
| APP-03 | Agente desktop | Python; `pdv2cloud-agent/service/requirements.txt`, serviço Windows, fila local, varredura XML e transmissão | Instalado nos clientes Windows conforme README; upload/sincronização com API indicado no código/documentação | Fluxo externo do produto, não serviço declarado no Compose da VPS. Instalação/distribuição e execução real não verificadas | VERIFIED (declarado); PENDING (clientes ativos) |
| APP-04 | Configurador desktop | Electron 29, React, TypeScript, Vite; `pdv2cloud-config/package.json` | UI local de configuração/pareamento/controle do serviço agente | Build/distribuição Windows; não serviço VPS conhecido | VERIFIED (declarado); PENDING (distribuição/uso) |
| APP-05 | Coletores/catalogadores Python | Scripts em `scripts/catalog/` e `scripts/state_prices/`; imagem Python 3.11 | Dois serviços sempre declarados no Compose VPS e um serviço sob profile; há também jobs manuais e scripts one-shot | Necessário no runtime quando os loops de coleção estão habilitados; escrevem dados pela API e, para imagens, em bind mount compartilhado | VERIFIED (declarado); PENDING (execução/uso real) |

**Contagem estática:** 5 aplicações/áreas, das quais 4 são aplicações de produto (API, web, agente e configurador); coletores são execução auxiliar. Não é contagem de instalações ativas.

## Serviços e containers Compose

Evidência comum: `docker-compose.vps.yml`. O arquivo usa `container_name`; imagens locais não têm digest fixado. Build/configuração e estado efetivo dependem da VPS inacessível. Todos os serviços têm estado observado **NOT VERIFIED**.

| ID | Serviço / tipo | Imagem ou build declarado | Dependências / rede / portas | Volumes e persistência | Recursos configurados | Health/restart | Uso e status |
|---|---|---|---|---|---|---|---|
| CTR-01 | `mercadoflow-postgres`, permanente | `postgres:16-alpine` (tag mutável) | API/jobs; rede Compose implícita; sem porta publicada no arquivo VPS | `mercadoflow_postgres_data` externo → `/var/lib/postgresql/data`; script SQL somente leitura em `/docker-entrypoint-initdb.d/` | mem 640 MiB; memswap 640 MiB; CPU sem limite declarado; PG shared_buffers 192 MiB, effective_cache_size 768 MiB, max_connections 50 | `pg_isready` 5s/5s/10; restart `unless-stopped` | Banco declarado/consumidores identificáveis; instalado/ativo e consumo NOT VERIFIED; persistência crítica |
| CTR-02 | `mercadoflow-backend`, permanente | Build local `./backend`; imagem/tag final não fixada | PostgreSQL saudável; API 8080 só na rede Compose | installer bind read-only; `./data/catalog`; `./data/offers`; logs configurados sob diretório relativo, sem mount explícito de logs | mem 1024 MiB; memswap 1024 MiB; CPU sem limite; Java `MaxRAMPercentage=60`, metaspace 192 MiB, ExitOnOutOfMemoryError; Hikari production max 8/min 2 | HTTP `/health`, 30s/5s/5, start period 600s; `unless-stopped` | Necessário à API; Flyway no startup; estado e efetividade NOT VERIFIED |
| CTR-03 | `mercadoflow-frontend`, permanente | Build local `./frontend`, Nginx alpine final | depende backend saudável; porta 3000 somente na rede Compose | sem volume declarado; conteúdo estático dentro da imagem | mem 64 MiB; memswap 64 MiB; CPU sem limite | sem healthcheck; `unless-stopped` | Site web declarado; execução NOT VERIFIED |
| CTR-04 | `mercadoflow-cron`, permanente para scheduler (não cron do SO) | Build local `./backend`, executa JAR | depende backend saudável; sem porta publicada nem upstream | sem volume declarado | mem 640 MiB; memswap 640 MiB; CPU sem limite; Java `MaxRAMPercentage=60`, SerialGC, metaspace 160 MiB; Hikari max 4/min 1; Tomcat max 2 threads/10 conexões | sem healthcheck; `unless-stopped` | Scheduler Spring separado; perfil `production,jobs`; duplicação/exclusividade efetiva dos jobs depende de flags/código e não foi observada |
| CTR-05 | `mercadoflow-nginx`, permanente | `nginx:alpine` | depende backend saudável e frontend iniciado; host `3300:3300`; encaminha `/api/` ao backend e resto ao frontend | `deploy/nginx.vps.conf` read-only | mem 64 MiB; memswap 64 MiB; CPU sem limite | sem healthcheck; `unless-stopped` | Proxy interno/L7 declarado; ativo NOT VERIFIED |
| CTR-06 | `mercadoflow-catalog-harvester`, worker permanente em loop | build `deploy/collectors`, tag `mercadoflow-collectors:latest` não imutável | backend saudável; rede Compose; intervalo default declarado 360 min | scripts catalog read-only; bind `./data/catalog` | mem 192 MiB; memswap 192 MiB; CPU sem limite | sem healthcheck; `unless-stopped` | Dispatcher lê config da API e coleta; execução, fontes habilitadas e tráfego externo NOT VERIFIED |
| CTR-07 | `mercadoflow-barcode-enricher`, worker permanente em loop | mesma imagem dos coletores | backend saudável; intervalo default 720 min | scripts catalog read-only; bind `./data/catalog` | mem 192 MiB; memswap 192 MiB; CPU sem limite | sem healthcheck; `unless-stopped` | Enriquecimento de códigos via API; execução/uso NOT VERIFIED |
| CTR-08 | `mercadoflow-state-price-sync`, worker opcional por profile | mesma imagem dos coletores | backend saudável; profile Compose `state-price-sync`; intervalo default 360 min | scripts state_prices read-only | mem 320 MiB; memswap 320 MiB; CPU sem limite | sem healthcheck; `unless-stopped` | Presente apenas se profile ativado; profile efetivo/execução NOT VERIFIED |

**Volumes e redes Compose:** rede padrão implícita `mercadoflow-web_default` é comportamento esperado do Compose, não descoberta do Docker Engine; nome/redes efetivas pendentes. `docker-compose.yml` local declara adicionalmente serviços `nginx`, `postgres`, `api`, `cron-jobs` e volume nomeado `postgres-data`; é outra topologia e não deve ser somada aos containers VPS. Sem execução não se sabe qual projeto/arquivo existe no servidor.

**Serviços declarados totais:** 8 no Compose VPS, sendo 7 regulares e 1 profile opcional; 4 serviços auxiliares de coleta/jobs (CTR-04, CTR-06..08), dos quais três loops auxiliares quando profile não ativado e quatro quando ativado. Nenhum status ativo/parado real foi observado.

## Processos, workers, jobs, filas e comunicação

| ID | Item | Evidência / natureza | Status |
|---|---|---|---|
| PROC-01 | JVM API em `mercadoflow-backend` | `java -jar`; processo permanente declarado | VERIFIED (configuração), NOT VERIFIED (execução VPS) |
| PROC-02 | JVM scheduler em `mercadoflow-cron` | `java -jar`; permanente declarado, perfil `jobs` | VERIFIED (configuração), NOT VERIFIED (execução VPS) |
| PROC-03 | Nginx web estático | PID 1 do container frontend | VERIFIED (Dockerfile), NOT VERIFIED (execução VPS) |
| PROC-04 | Nginx reverse proxy interno | container CTR-05 | VERIFIED (Compose), NOT VERIFIED (execução VPS) |
| PROC-05 | PostgreSQL | container CTR-01 | VERIFIED (Compose), NOT VERIFIED (execução VPS) |
| JOB-01 | Scheduler Spring | `@EnableScheduling`; jobs em `backend/src/main/java/com/pdv2cloud/job/` e serviços com `@Scheduled`; dois contextos da aplicação são declarados | Presença do scheduler declarada; quais jobs são condicionais, executados em cada perfil e se não duplicam pendente de revisão do código/produção |
| JOB-02 | Harvester de catálogo | `market_catalog_dispatcher.py --watch`; intervalo configurável | Serviço declarado; run/atividade pendente |
| JOB-03 | Barcode enrichment | `barcode_enrichment_service.py --watch` | Serviço declarado; run/atividade pendente |
| JOB-04 | Sincronização de preços estaduais | `sync_state_price_portals.py --watch --import`; Compose profile opcional | Profile declara o job; ativação pendente |
| JOB-05 | Coletores one-shot/imports manuais | scripts `extract_and_import_*`, `import_catalog_records.py`, `extract_infoprice_products.py`, scripts `state_prices/` | Existência verificada; agendamento/execução real não presumidos |
| JOB-06 | Build do instalador Windows na VPS | `build-installer-vps.sh`, chamado por `deploy-web.sh` | Script de deploy inclui build sob condição; execução recente pendente |
| JOB-07 | Cron do SO | Nenhum crontab/systemd timer pode ser inspecionado localmente; jobs Spring e loops worker não equivalem a cron do SO | NOT VERIFIED |
| JOB-08 | Fila desktop local | `pdv2cloud-agent/service/queue_manager.py`; requisitos SQLite na configuração/código a confirmar | Referência verificada; uso/persistência nos clientes pendente |

**Mensageria/cache/WebSocket:** Redis, RabbitMQ e Kafka não são declarados no Compose nem identificados como dependências Maven/serviços nesta varredura; tratados como **NOT APPLICABLE à stack declarada (CFG-08)**, mas presença externa/uso em runtime NOT VERIFIED. Não foi encontrado uso de WebSocket no backend/frontend na busca orientada; sem prova de ausência em produção, runtime NOT VERIFIED. A fila persistente do agente e jobs no banco não provam broker distribuído.

## Bancos, ORM e migrations

| ID | Item | Evidência | Status |
|---|---|---|---|
| DB-01 | PostgreSQL 16 Alpine em container VPS | CTR-01, `DATABASE_URL`, driver JDBC PostgreSQL 42.7.3; banco lógico por defaults de deploy | Declarado e referenciado; versão executada, tamanho, conexões, extensões e clientes reais NOT VERIFIED |
| DB-02 | Spring Data JPA / Hibernate | starter `spring-boot-starter-data-jpa`; entidades/repositories, ddl-auto `validate`, dialeto PostgreSQL | Declarado e usado pelo código; atividade runtime NOT VERIFIED |
| DB-03 | HikariCP | pools production e jobs em `application-production.yml`, `application-jobs.yml` | Configuração declarada; métricas/conexões efetivas NOT VERIFIED |
| DB-04 | Flyway | dependência `flyway-core`; habilitado em `application.yml`; 53 arquivos `V*__*.sql` encontrados | Aplicação declarada no startup. Histórico aplicado em produção e último schema NOT VERIFIED |
| DB-05 | Seeders | `ProductionSeeder`, `DevSeeder` implementam `CommandLineRunner` | Código encontrado; condições e dados existentes em produção NOT VERIFIED |

## Storage, volumes, uploads, backups e artefatos

Tamanhos locais foram medidos com `Get-ChildItem` (bytes de arquivos). Não são tamanhos da VPS, do volume Docker nem uso alocado em filesystem.

| ID | Tipo / caminho | Consumidor / proprietário | Tamanho/retention acessível | Criticidade / status |
|---|---|---|---|---|
| VOL-01 | Volume externo `mercadoflow_postgres_data` → `/var/lib/postgresql/data` | PostgreSQL; criado/ligado pelo deploy; propriedade Unix efetiva desconhecida | não mensurado local/remotamente | Crítico, persistência declarada; existência/mount/dados NOT VERIFIED |
| STO-01 | Bind `./data/catalog` → `/opt/pdv2cloud/catalog-data` | Backend e dois coletores; imagens em `images`, runs em `runs`; scripts de build/deploy criam subpastas | checkout tem 3 artefatos versionados, total 73,858,938 bytes (~70.4 MiB); conteúdo inteiro do volume remoto inacessível; retenção não documentada de forma comprovada | Dados de catálogo e imagens potencialmente persistentes; ownership/ocupação/retention VPS NOT VERIFIED |
| STO-02 | Bind `./data/offers` → `/opt/pdv2cloud/offers-data` | Backend outputs de renderização de oferta | não existente/size local não medido (diretório pode não estar no checkout); retention não estabelecida | Configurado, existência e conteúdo VPS NOT VERIFIED |
| STO-03 | Bind installer `pdv2cloud-agent/installer/Output` read-only no backend | endpoint de download; workflow publica instalador | artefato é produzido/públicado por CI e também script VPS condicional; tamanho no servidor não medido | Reproduzível mas implantação/versão ativa NOT VERIFIED |
| STO-04 | Imagens de catálogo e uploads geridos | `CatalogImageStorageService`; configurado por `APP_CATALOG_IMAGES_DIR`; upload e resolução de chaves por API | diretório está no bind catalog; quantidade, tamanho e owner remoto NOT VERIFIED | Persistência necessária para imagens geridas; gravação real/backup não verificados |
| STO-05 | Arquivos/logs crawler | scripts usam `data/catalog/runs`; API expõe detalhes/status de run/logs | volume/bind catalog. Retention/tamanho configurado e efetivo NOT VERIFIED | Persistência para checkpoints/diagnóstico; runtime pendente |
| STO-06 | Logs aplicação Logback | `logs/application.json` e rollovers diários gzip; retém 30 dias, cap 1 GB por appender | sem bind de logs Compose explícito; logback registra console + arquivo; não se confirma se caminho relativo gravável no container nem se Docker captura só stdout ou arquivo | arquivo local e stdout potencialmente duplicam I/O; configuração é evidência, aplicação efetiva NOT VERIFIED |
| STO-07 | stdout/stderr dos containers | logging driver Docker (default não sobrescrito no Compose) | driver efetivo e opções de rotação/limite NÃO acessíveis | retenção e ocupação NOT VERIFIED; rotação não declarada neste Compose |
| STO-08 | Dumps DB de deploy | `${APP_DIR}/backups/backup_YYYYMMDD_HHMMSS.dump`; dump custom format, `pg_restore -l` valida; script tenta manter último por dia durante 7 dias; pula se dump recente <45 min | directory exclude da sincronização. Quantidade/tamanho/FS real NOT VERIFIED | Recuperação relevante; cópia externa/offsite e teste de restore não encontrados; integridade apenas listagem de TOC segundo script |
| STO-09 | Temporário do dump DB | `/tmp/pdv2cloud_backup.dump` dentro container PostgreSQL | duração durante deploy, removido no fluxo normal; crash pode deixar artefato; não mensurado | temporário, risco de espaço transitório; efetividade não verificada |
| STO-10 | Cache de build Docker | Docker builder cache VPS; script deixa cleanup disabled pelo workflow e documenta reservar 2 GB quando habilitado | `docker system df` remoto NOT MEASURED; cache não é fonte de persistência | Rebuild/performance, retenção real NOT VERIFIED |
| STO-11 | Temporários e fila do agente Windows | código de fila/varredura e arquivos fonte/configuração de clientes | máquinas cliente indisponíveis | NOT VERIFIED; não tratar como storage VPS nem descartar |
| STO-12 | Volumes do compose local | `postgres-data` em `docker-compose.yml` | outro deployment/dev; uso local por daemon não medido | não somar ao volume externo VPS; consumidor atual desconhecido |

**MinIO/S3:** não há serviço nem SDK S3 detectado nesta stack declarada. Armazenamento de imagem/outputs é filesystem local referenciado por `Path` e binds. **NOT APPLICABLE** para arquitetura declarada, runtime externo não verificado.

## Dockerfiles, build, deploy e CI/CD

| ID | Dockerfile / papel | Toolchain e imagem/arquitetura | Status |
|---|---|---|---|
| BLD-01 | `backend/Dockerfile` | stage build `maven:3.9.6-eclipse-temurin-17`, `mvn -q -DskipTests package`; runtime `eclipse-temurin:17-jre`, wget, ffmpeg, fontes; EXPOSE 8080 | Encontrado e catalogado; build efetivo/digest/arquitetura OCI NOT VERIFIED |
| BLD-02 | `frontend/Dockerfile` | Node 20 Alpine → `npm ci`, `vite build`; Nginx Alpine serve dist na 3000 | Encontrado e catalogado; build/digest/arquitetura NOT VERIFIED |
| BLD-03 | `deploy/collectors/Dockerfile` | Python 3.11 slim; instala requests, pillow, beautifulsoup4 na build; workdir `/workspace` | Encontrado e catalogado; imagem única declarada para 3 serviços; digest/arquitetura NOT VERIFIED |
| BLD-04 | Agente Windows | build Python/Inno Setup/PyInstaller? scripts PowerShell e `build-installer-vps.sh`; workflow dedicado | Scripts identificados; ambiente, output e arquitetura do artefato precisam inspeção adicional NOT VERIFIED |
| BLD-05 | Configurador Electron | `npm run build` e `electron-builder`; target definido em `electron-builder.json` | Configuração presente; distribuição/arquitetura efetiva NOT VERIFIED |

Fluxo de deploy do workflow `.github/workflows/deploy-pdv2cloud-web.yml`: push em `main` por paths listados ou workflow_dispatch → runner GitHub-hosted `ubuntu-latest` verifica checksums/edições de migrations → transfere checkout via rsync/SSH password armazenada como secret (mecanismo identificado, sem inspecionar valor) para `/root/mercadoflow-web` → invoca `deploy/deploy-web.sh` remotamente → VPS resolve/preserva segredos sem imprimí-los, valida Compose, garante volume PostgreSQL, backup lógico antes das alterações, puxa PostgreSQL/Nginx base, compila instalador quando script existe, executa `docker compose build --pull` no host para backend/frontend/cron, sobe PostgreSQL, garante role de aplicação, recria/submete serviços (inclui migrações no startup backend/Flyway), confere estado/health e `/health`, reaplica grants, faz cleanup de containers/imagens dangling condicionado e registra uso de disco. O registry não participa do fluxo primário identificado: imagens da aplicação são construídas na VPS; não há registry de aplicação documentado neste fluxo. `ubuntu-latest` runner usa arquitetura não fixada pelo YAML além da imagem runner; arquitetura da VPS e das imagens construídas é NOT VERIFIED. Base images são tags mutáveis, não digest fixos.

Rollback: há script `scripts/restore.ps1` para restore manual e backup pre-deploy, mas rotina automática de rollback de app/schema/artefatos e localização/validação do procedimento na produção não estão confirmadas. Rollback seguro após migration depende da compatibilidade explícita da migration e backup; fluxo não mostra reversão automática.

Fluxo separado do agente (`build-and-upload-installer.yml`): runner Windows build → upload/download de artefato GitHub entre jobs → cópia SCP/SSH para diretório installer na VPS → reinicia backend → consulta endpoint de versão/health. Execução/artefato instalado não verificados.

`scripts/deploy.ps1` compõe uma topologia de deploy alternativa via `docker-compose.yml`; não se deve interpretar esse script como prova do método VPS atual. `deploy/deploy-web.sh` mais o workflow indicam SSH e build remoto para o pipeline web.

## Runtime, pools, limites, timeouts e healthchecks

| ID | Configuração declarada | Aplicação efetiva |
|---|---|---|
| CFG-01 | Limites mem/memswap Compose: Postgres 640 MiB, backend 1 GiB, frontend/nginx 64 MiB cada, jobs 640 MiB, coletores 192/192/320 MiB. CPU limits ausentes para todos | `docker inspect`, cgroups/quota, memória RSS/cache/swap efetivos NOT VERIFIED; mem_limit não é RAM observada nem reserva de RAM |
| CFG-02 | API JVM MaxRAMPercentage 60%, MaxMetaspaceSize 192 MiB; jobs 60%, SerialGC, metaspace 160 MiB; ExitOnOOM apenas API | Comando `docker inspect`, `jcmd`/metrics e heap efetivo não medidos |
| CFG-03 | Hikari produção max 8/min 2 (env sobrescrevível); jobs max 4/min 1. Pool DB total concorrente depende de ambas instâncias e versão de processo | JMX, conexões ociosas/ativas, aplicação do profile/config efetiva NOT VERIFIED |
| CFG-04 | Postgres shared_buffers 192 MiB; effective_cache_size 768 MiB; max_connections 50 | `SHOW` e status do processo indisponíveis |
| CFG-05 | Job Tomcat: 2 max/1 spare, max connections 10, accept queue 5 | runtime NOT VERIFIED |
| CFG-06 | API `/health`: interval 30s, timeout 5s, retries 5, start_period 600s. PostgreSQL 5s/5s/10 | Health status real e efeito Compose NOT VERIFIED |
| CFG-07 | Timeouts Nginx host declarados no script: connect/send/read 300s, body 600s, upload limit 50M; proxy container não declara timeout específico. Cliente LLM connect 10s/request 45s; serviço imagem connect 20s; variação nos scripts scraper | Configuração de host foi escrita por script condicional; `nginx -T` remoto não acessível. Timeouts efetivos NOT VERIFIED |
| CFG-08 | Sem serviço/cache distribuído Redis, sem broker e sem object store no Compose e dependências observadas | NOT APPLICABLE para arquitetura declarada; processos externos da VPS NOT VERIFIED |
| CFG-09 | Logback stdout JSON + rolling file diário gzip, maxHistory 30, totalSizeCap 1GB; root/app INFO, Spring/Hibernate WARN | Configuração estática; arquivos podem competir por storage e arquivo não tem bind explícito; configuração efetiva NOT VERIFIED |
| CFG-10 | Healthcheck backend depende `wget` interno; Nginx container não tem healthcheck; frontend não tem; coletores não têm | Compose declarações VERIFIED; disponibilidade/monitoramento externo NOT VERIFIED |

## Serviços externos e fluxos externos

| ID | Serviço | Evidência de dependência/fluxo | Runtime/uso |
|---|---|---|---|
| EXT-01 | Hostinger/VPS via SSH | Workflow tem host/IP e usuário no YAML; segredo de autenticação via GitHub Actions Secret | Declaração VERIFIED; reachability/host atual NOT VERIFIED |
| EXT-02 | GitHub Actions | workflows YAML para deploy web e artefato Windows | Declarado; últimos runs/status NOT VERIFIED |
| EXT-03 | Registry OCI de aplicação | nenhum push/pull de imagem própria no fluxo pesquisado; `compose build` remoto | NOT APPLICABLE para fluxo de deploy encontrado; registry externo alternativo NOT VERIFIED |
| EXT-04 | Stripe | SDK e integração condicionada a configuração; fluxo pode estar disabled | Capacidade referenciada VERIFIED; credenciais/flag/uso real NOT VERIFIED |
| EXT-05 | Provedores de IA (BYOK) | cliente Java usa HTTP com key por cliente criptografada; encryption key opcional | implementação/caminho opcional identificado; tráfego e uso NOT VERIFIED |
| EXT-06 | Sites de varejo/portais de preço | coletores acessam VTEX e várias fontes listadas em configuração/script | código e fontes identificados; fontes habilitadas/requests atuais NOT VERIFIED |
| EXT-07 | Serviços externos do agente/clientes (PDVs, banco/arquivos de origem) | scanner/parser e drivers documentados; ambientes dos clientes inacessíveis | PENDING |
| EXT-08 | Email/SMS/observabilidade externos | sem broker/stack de metrics/traces ou serviço de envio específico comprovado nesta varredura | NOT VERIFIED; busca sem resultado não prova ausência |

## Migrations, seed, uploads e scripts operacionais

- Migrations: 53 scripts Flyway verificados no checkout; deploy workflow verifica migrations versionadas no diff imediato. Estado aplicado/checksum de produção NOT VERIFIED.
- Seed: `ProductionSeeder` e `DevSeeder`; valores de configuração não inspecionados, execução em produção NOT VERIFIED.
- Upload de imagem: controlador/storage local backend, bind catalog. Upload de documento genérico não foi assumido sem evidência de fluxo.
- Scripts encontrados: `deploy/deploy-web.sh`, workflow web, workflow de installer, `scripts/deploy.ps1`, `scripts/backup.ps1`, `scripts/restore.ps1`, `scripts/healthcheck.ps1`, build backend/frontend/agent, `pdv2cloud-agent/scripts/build-installer-vps.sh`, role setup de banco, scripts crawler/importadores e sync estadual.
- Backup: deploy faz pg_dump custom format, valida listagem com pg_restore, guarda arquivo no host com política aparente de 7 datas diárias. Não foi confirmado backup off-host, snapshot do provider, recuperação ponto-no-tempo, criptografia, monitor de sucesso ou teste periódico de restauração. `scripts/backup.ps1` usa serviço do compose local e não demonstra operar no perfil VPS.

## Baseline e observabilidade

Ver [VPS-OPT-BASELINE.md](VPS-OPT-BASELINE.md). **Não há métricas de produção confirmadas.**

## Matriz de cobertura e gate de reconciliação

| Área | Encontrada | Inventariada | Itens/IDs | Evidência | Status |
|---|---|---|---|---|---|
| Frontend web | Sim | Sim | APP-02, CTR-03, BLD-02 | `frontend/package.json`, Dockerfile, Compose | VERIFIED declaração; uso PENDING |
| Backend/API | Sim | Sim | APP-01, CTR-02, DB-02..04 | POM, fontes, configuração | VERIFIED declaração; runtime NOT VERIFIED |
| Agente desktop | Sim | Sim | APP-03, BLD-04, JOB-08 | árvore, requirements, workflows | VERIFIED declaração; instalação/uso PENDING |
| Configurador desktop | Sim | Sim | APP-04, BLD-05 | package/config | VERIFIED declaração |
| Containers declarados | Sim, 8 com profile | Sim, 8 | CTR-01..08 | `docker-compose.vps.yml` | VERIFIED declarados; ativos NOT VERIFIED |
| Dockerfiles | Sim, 3 | Sim, 3 | BLD-01..03 | `rg --files -g Dockerfile*` | VERIFIED; builds e digest NOT VERIFIED |
| Compose | Sim, 2 topologias | Sim | CTR-01..08, VOL-12 | Compose VPS e local | VERIFIED declarados; topologia aplicada pendente |
| Banco/ORM | Sim | Sim | DB-01..05 | pom, YAML, Java, migrations | VERIFIED declarado; operação NOT VERIFIED |
| Redis | Não encontrado na arquitetura declarada | Sim, lacuna externa | CFG-08 | Compose/dependências pesquisadas | NOT APPLICABLE declarativo; runtime NOT VERIFIED |
| MinIO/S3 | Não encontrado; filesystem identificado | Sim | STO-01..04 | storage service, binds, dependências | NOT APPLICABLE declarativo; serviço externo NOT VERIFIED |
| Storage/volumes | Sim | Sim, 12 IDs | VOL-01, STO-01..12 | Compose, serviço storage, scripts | declaração VERIFIED; ocupação/owner VPS NOT VERIFIED |
| Workers | Sim | Sim | CTR-04, CTR-06..08, JOB-01..04 | Compose, perfis e scripts | declarados VERIFIED; execução NOT VERIFIED |
| Cron | Scheduler e loops encontrados; cron OS inconclusivo | Sim | JOB-01..07 | `@Scheduled`, Compose, nenhuma inspeção host | Spring declarados; cron do host NOT VERIFIED |
| Filas | Fila local agente referenciada; broker não declarado | Sim | JOB-08, CFG-08 | `queue_manager.py`, busca Compose/dependências | implementação referenciada; broker NOT APPLICABLE declarativo |
| WebSocket | Não localizado por busca | Sim, como lacuna | CFG-08 | busca em código frontend/backend | NOT VERIFIED; sem assumir ausência |
| Proxy | Sim, host condicional e interno | Sim | CTR-05, CFG-07 | shell deploy e nginx confs | config declarada; `nginx -T` efetivo NOT VERIFIED |
| Healthchecks | Sim, PG/backend; ausência de definição nos outros Compose services | Sim | CFG-06, CFG-10 | Compose | declaração VERIFIED; condição real NOT VERIFIED |
| Logs | Sim, stdout e Logback file | Sim | STO-06..07, CFG-09 | Logback e Compose | configuração VERIFIED; rotação efetiva/ocupação NOT VERIFIED |
| Backups | Sim, scripts/deploy | Sim | STO-08..09 | deploy script e workflow | lógica de backup VERIFIED; arquivos e restore test NOT VERIFIED |
| Cache | Cache builder Docker, filesystem/cache de processo; Redis não declarado | Sim | STO-10, CFG-08 | deploy script | limite/uso real NOT VERIFIED |
| Build/deploy/CI-CD | Sim | Sim | BLD-01..05, DEP-01 implícito neste fluxo | Dockerfiles, workflow, shell | sequência declarada VERIFIED; deploy atual NOT VERIFIED |
| Migrations/seed | Sim, 53 migrations e dois seeders | Sim | DB-04..05 | fontes e workflow | VERIFIED no repo; produção NOT VERIFIED |
| Runtime e versões | Sim, declara Java17/Python3.11/Node20 e manifests | Sim | APP-01..05, BLD-* | manifests/Dockerfiles | declarações VERIFIED; runtime imagem/host PENDING |
| Limites RAM/CPU | Memória declarada; CPU ausente | Sim | CFG-01 | Compose | limites configurados VERIFIED; efetivos NOT VERIFIED |
| Heap JVM | Sim, MaxRAMPercentage 60 e metaspace | Sim | CFG-02 | Compose | configuração VERIFIED; heap efetivo NOT VERIFIED |
| Pools | Sim, Hikari + Postgres | Sim | DB-03, CFG-03..04 | YAML, Compose | configuração VERIFIED; métricas NOT VERIFIED |
| Digest/arquitetura de imagem | tags mutáveis; sem digest | Sim | BLD-01..03 | Compose/Dockerfiles | NOT VERIFIED em runtime |
| Serviços ativos/parados | Compose local consulta não encontrou containers | Sim | OBS-01 | saída local `docker ps` | VPS NOT VERIFIED; não transferir resultado local |

### Gate — segunda passagem

- **Compose ↔ containers:** reconciliados os oito serviços (sete comuns + serviço em profile). O projeto alternativo `docker-compose.yml` possui quatro serviços e um volume diferente; não foi fundido com o inventário VPS. Estado real da engine permanece NOT VERIFIED.
- **Dockerfiles ↔ builds:** exatamente três Dockerfiles encontrados com `rg --files -g 'Dockerfile*'`: backend, frontend e collectors; os três estão catalogados em BLD-01..03. Builds e imagens reais não acessíveis.
- **Volumes ↔ persistência:** volume externo de banco e binds catalog/offers/installer/scripts reconciliados com STO-01..12; não há inspeção de mounts nem medição de diretórios VPS.
- **Scripts ↔ deploy:** workflow web transfere código e executa deploy-web.sh remotamente; script inclui validação, backup, build local na VPS, aplicação Flyway no startup e health/cleanup. Workflow separado constrói e publica instalador. Script PowerShell é caminho Compose alternativo, não evidência de execução atual.
- **NOT APPLICABLE justificado:** Redis/broker, MinIO/S3 e registry de imagens da aplicação não fazem parte dos manifests/dependências examinados; filesystem e build local são o caminho declarado. Isso não exclui serviços externos invisíveis sem acesso ao host. Cron do SO, status runtime, WebSocket, tráfego e uso não são marcados como ausentes: permanecem NOT VERIFIED/PENDING.
- **Sem acesso:** VPS, Compose expandido sem mostrar segredos, `docker inspect`, cgroups, volumes, systemd/crontab, logs históricos, métricas, snapshots, backup contents, restore e arquitetura da máquina permanecem lacunas; inventário não é auditoria operacional completa.


## Snapshot da VPS identificado após a coleta inicial — 2026-09-24

Acesso Paramiko read-only, com chave de host ED25519 pinada. Foram observados 40 containers (38 running, 2 exited), oito projetos Compose e dois containers sem labels de projeto. Veja o registro HCTR-001..040 em VPS-OPT-BASELINE.md. Isso preenche a lacuna de configuração e uso instantâneo da engine; consumers, conteúdo/ownership da persistência, picos, backups/restores e tráfego seguem pendentes. Redis e MinIO existem em serviços de projetos distintos deste checkout, logo a ausência no Compose MercadoFlow não prova ausência na VPS. O checkout não foi correlacionado a nenhum serviço observado.


### Origem declarada via labels dos containers observados

| Projeto | working_dir/config_files | Status |
|---|---|---|
| aprenderia | releases b2e39a7 (DB/scheduler/helper) e e82892a (web/nginx) | PENDING reconciliar lifecycle |
| digiurban | /opt/digiurban/docker-compose.vps.yml | PENDING consumers |
| dramarcela | app 6d6516b, DB 7218f99, MinIO c1ea35c | PENDING reconciliar lifecycle |
| ferraco | /root/ferraco-crm/docker-compose.vps.yml | PENDING uso/pico; sem limites Docker explícitos no CRM e PostgreSQL |
| fuse-mcp-platform | /opt/fuse-mcp-platform/compose.production.yaml | PENDING consumer |
| m2centerauto | app d7d2eaa/current, PostgreSQL f1ba7a1 | PENDING reconciliar lifecycle |
| makucho | portal 725b658 | PENDING consumers |
| makucho-studio | app 2f6a1eb, Redis cfb4399 | PENDING reconciliar lifecycle |
| ultrazend-api/postgres | sem labels Compose; caminho de binds /var/lib/ultrazend | NOT VERIFIED gerenciador |

Os valores são labels do estado de containers, não confirmação de que os caminhos/commits são atuais. Veja os detalhes e ressalvas em VPS-OPT-BASELINE.md.


## Revalidacao read-only do host confirmado - 2026-09-24T21:36:21Z

Paramiko 5.0.0 comparou o fingerprint ED25519 recebido ao valor validado no console antes de autenticar; hostname `srv953800.hstgr.cloud`. Identidade, OS e snapshot Docker atualizados em `VPS-OPT-BASELINE.md`. Host observado: 4 vCPU, RAM 16,764,968,960 B, Docker 29.8.0/cgroup v2; 40 containers (38 running), 8 projetos Compose. Filtros por nomes/imagens/projeto `mercadoflow|pdv2cloud` retornaram zero; paths convencionais de release estao ausentes. Esta e evidencia sobre o host no momento da coleta, nao prova de ausencia de consumidores com nomes diferentes.

Os IDs locais `CTR-01..08` seguem declarados pelo checkout e sem correspondencia a containers/projetos/imagens observados. O workflow permanece configurado para `72.60.10.112`, que nao foi contatado; o hostname confirmado resolve para .108 e nao contem a release nos caminhos consultados. Deploy, commit/digest, conteudo dos volumes, persistencia/restore, owner de outras stacks e secret de Actions permanecem NOT VERIFIED/BLOCKED. Nao consultamos `Config.Env` nem arquivos remotos e nao alteramos servicos/dados. Ver baseline atualizado para RAM/swap/disco/PSI/Docker e limites da amostra.



### Atualizacao do fluxo declarado de deploy no checkout - 2026-09-24

`.github/workflows/deploy-pdv2cloud-web.yml` no working tree agora declara `srv953800.hstgr.cloud` com pin de host key (`.github/vps_known_hosts`), SSH/rsync strict, exclusao de `data/offers` durante `rsync --delete` e sem limpeza automatica de imagens/containers. Fonte: diff local e teste estatico/rsync isolado documentados em `DEPLOY-CICD-AUDIT.md: DEP-AUD-17`. Isso e comportamento declarado pelo checkout alterado, nao efeito observado em Actions/VPS. Nenhum deploy foi disparado; segredo GitHub, release/digest atual e caminho remoto seguem NOT VERIFIED.

