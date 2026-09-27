PROMPT 00
0. Descoberta, inventário e baseline
Comece aqui. Mapeie o projeto antes de propor alterações.

Copiar prompt
Atue como arquiteto de software e engenheiro de DevOps, performance Linux/VPS, containers e banco de dados.
MISSÃO GLOBAL
Reduzir desperdícios de recursos da VPS sem remover funcionalidades, comprometer persistência, segurança ou estabilidade. Adapte o protocolo à stack real.
ETAPA ATUAL: SOMENTE DESCOBERTA
Não otimize, não altere código ou configurações, não reinicie serviços e não apague dados. Crie apenas os documentos de inventário e baseline. Não inicie outra etapa automaticamente.
1. Explore o repositório
Mapeie aplicações, packages, frontend, backend, APIs, runtimes e versões, framework, gerenciador de pacotes, ORM, banco, workers, cron, filas, WebSockets, Redis, MinIO/S3, proxy, Dockerfiles, Compose, CI/CD, scripts, migrations, seed, uploads, caches, logs e backups.
2. Confirme uso real
Para cada serviço separe: declarado; instalado; referenciado; observado em execução; usado por fluxos internos/externos; necessário em runtime; necessário em build/deploy; persistência mantida. ENV, dependência ou comentário isolados não provam uso. Uma busca sem resultado não autoriza remoção.
3. Catalogue containers e processos
ID | nome | imagem/digest/build | função | dependências | volumes | redes | portas | healthcheck | persistência | limites declarados/efetivos de RAM e CPU | restart | uso confirmado | evidência | status.
Inclua serviços declarados, ativos, parados e auxiliares. Diferencie processo permanente, job temporário e serviço somente de desenvolvimento.
4. Catalogue persistência
Bancos, volumes nomeados, bind mounts, uploads, documentos, backups, dumps, snapshots, logs, caches e temporários. Registre proprietário, consumidores, caminho, tamanho quando acessível, retenção e criticidade. Não delete nada.
5. Mapeie build e deploy
Código -> build -> imagem -> registry -> pull -> migration -> seed, se necessário -> start -> healthcheck -> rollback.
Registre onde cada operação ocorre, autenticação sem expor credenciais, arquitetura CPU da imagem e scripts que compilam na VPS.
6. Configurações de recursos
Localize limites de RAM/CPU, pools, timeouts, caches, rotação de logs, healthchecks e parâmetros do runtime e banco. Confirme sua aplicação efetiva; não assuma que uma chave de configuração é respeitada.
7. Baseline com acesso disponível
Use medições de leitura: docker ps, docker stats --no-stream, docker system df, df, free, uptime e ferramentas existentes de processos/I/O. Registre data, unidade, duração, carga, tráfego, versão e limitações. Não revele ENV ou inspecione segredos em saídas.
Um snapshot em repouso não representa pico. Colete dados existentes sobre pico, reinício, OOM, latência, erros, throughput, conexões e deploy. Sem acesso, marque NOT MEASURED.
Não confunda limite configurado com RAM efetivamente consumida ou reservada. Separe memória usada, disponível, cache e swap. Separe tamanho lógico de imagens das camadas compartilhadas e disco efetivamente ocupado.
8. Estado persistente
Crie docs/VPS-OPT-INVENTORY.md e docs/VPS-OPT-BASELINE.md.
O inventário deve conter arquitetura, stack, aplicações, containers, processos, banco/ORM, storage/volumes, Docker, build, deploy/CI-CD, runtime, workers/cron/filas, cache, logs, backups, serviços externos, configurações, métricas e lacunas.
Use VERIFIED, PENDING, NOT VERIFIED e NOT APPLICABLE para inventário; VERIFIED exige evidência. Registre itens novos mantendo IDs estáveis.
9. Matriz de cobertura
Área | encontrada | inventariada | itens/IDs | evidência | status.
Inclua frontend/backend, containers, Dockerfiles, Compose, banco/ORM, Redis, MinIO/S3, storage/volumes, workers, cron, filas, WebSocket, proxy, healthchecks, logs, backups, cache, build/deploy/CI-CD, migrations/seed, runtime, limites RAM/CPU, heap e pools.
10. Gate
Faça segunda passagem e reconcilie serviços declarados com inventariados, Dockerfiles encontrados com catalogados, volumes com persistência e scripts com fluxo de deploy. Justifique NOT APPLICABLE; falta de acesso é lacuna, não ausência.
SAÍDA
Informe contagens de aplicações/containers/Dockerfiles/bancos/volumes/processos/jobs, método de deploy, métricas medidas e quantidades VERIFIED/PENDING/NOT VERIFIED/NOT APPLICABLE. Informe os dois caminhos.
Com lacunas relevantes não declare auditoria completa. Pare após esta etapa.
PROMPT 01
1. Containers e serviços
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Audite todos os serviços declarados e observados: função, consumidores, dependências, isolamento, dados, permissões, exposição, healthchecks e restart.
Investigue Redis, MinIO, painéis administrativos e ferramentas de desenvolvimento sem tratá-los como removíveis por padrão. Verifique filas, sessões, rate limiting, locks, cache, URLs assinadas e consumidores externos.
Uma remoção candidata exige evidência dos fluxos atendidos, alternativa funcional, impacto no deploy e recuperação de dados. Menos containers não é benefício suficiente se piora isolamento ou confiabilidade.
Identifique jobs que poderiam executar sob demanda, duplicações e serviços ociosos. Não consolide bancos de clientes por conveniência.
Reconcilie todos os IDs de containers do inventário com itens auditados ou exceções justificadas.
DOCUMENTO
Crie docs/CONTAINER-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 02
2. Runtime, RAM e CPU
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Avalie RSS, heap, memória nativa, GC, CPU, picos, concorrência, OOM, reinícios e latência por processo/container. Separe runtime de build/deploy.
Para Node, verifique versão e suporte efetivo a cgroups antes de concluir como o heap é dimensionado. NODE_OPTIONS controla parte da memória, não o RSS inteiro. Inclua buffers, bibliotecas nativas, Sharp, threads e filhos.
Não aplique limite fixo ou múltiplo do consumo em repouso como regra universal. Proponha orçamento baseado em carga representativa, pico e folga; registre o que falta medir.
Audite workers residentes, cron, browsers headless, processamento de mídia e concorrência. Verifique encerramento de conexões e processos órfãos.
Considere orçamento agregado das aplicações, host, banco e jobs simultâneos; confirme limites efetivos e efeitos de throttling.
DOCUMENTO
Crie docs/RUNTIME-RESOURCE-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 03
3. Docker e tamanho de imagens
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Audite todos os Dockerfiles, contextos, .dockerignore, camadas, caches, base image, dependências runtime/build e multi-stage. Diferencie tamanho individual, camadas compartilhadas e espaço recuperável.
Se Next.js estiver presente, avalie standalone, tracing do monorepo, arquivos estáticos/public, imports dinâmicos e módulos nativos. Não presuma compatibilidade Alpine/musl ou ganhos de tamanho.
Se Prisma estiver presente, identifique versão, engine/adapter real, plataforma, cliente gerado, CLI e ferramentas necessárias para migration e seed. Não replique links internos de pnpm ou remoções de binários sem reproduzir a necessidade.
Considere estágio/imagem de migration separado somente com integridade e compatibilidade comprovadas. Seed deve manter dependências reais; bundling exige teste.
Exija testes separados de startup, consulta ao banco, migrations e seed em ambiente descartável. Audite usuário, permissões e segredos em camadas. Não apague imagens necessárias ao rollback.
DOCUMENTO
Crie docs/DOCKER-IMAGE-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 04
4. Banco, ORM e conexões
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Mapeie bancos, tamanho, índices, consultas lentas, N+1, conexões, pools por instância/worker, transações, locks, I/O, manutenção e backups.
Para PostgreSQL avalie shared_buffers, work_mem por operação/concorrência, max_connections e effective_cache_size como estimativa para o planner, não reserva de RAM. Não derive parâmetros por porcentagem fixa.
Avalie pools conforme ORM/driver e versão reais; some réplicas, jobs, migration e administração. Verifique fila de espera, timeouts e capacidade do servidor.
Analise consultas redundantes, seleção de campos, paginação e paralelismo. Paralelizar pode aumentar carga e pressão no pool; meça efeito.
Não crie cache sem escopo de autorização, invalidação, consistência e limite de memória. Não exclua tabelas, migre esquema ou rode consultas pesadas em produção nesta etapa.
Valide backup/restore e requisitos de recuperação; registre melhorias de índices/migrations com risco e rollback compatível.
DOCUMENTO
Crie docs/DATABASE-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 05
5. Storage, disco, logs e backups
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Reconcilie volumes e bind mounts com consumidores, proprietário, permissões, tamanho, crescimento e criticidade. Audite uploads, artefatos, logs, temporários, cache de imagens, dumps e snapshots.
Compare armazenamento local, MinIO e S3 por requisitos: múltiplas instâncias, disponibilidade, acesso privado, URLs assinadas, backup/restore, portabilidade e custo. Quantidade de GB isolada não decide a arquitetura.
Se propor local + proxy, preserve autenticação de arquivos privados, nomes seguros, permissões, validação de uploads e backup. Cache immutable apenas para conteúdo versionado que não muda na mesma URL.
Se Next/image existir, confirme caminho/configuração do cache antes de propor volume. Defina retenção e limite; cache não é fonte de verdade.
Classifique cada candidato de limpeza: descartável confirmado, retenção vencida, necessário ao rollback, dado persistente ou uso desconhecido. Não execute limpeza. Backup só pode ser reduzido após política e recuperação demonstradas.
DOCUMENTO
Crie docs/STORAGE-DISK-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 06
6. Build, deploy e CI/CD
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Trace scripts e workflows do commit ao healthcheck. Meça ou marque indisponíveis CPU/RAM, duração, disco temporário e downtime durante deploy.
Avalie mover builds da VPS para runner compatível, registry, cache e imagens pré-compiladas. Confirme custo, acesso, arquitetura, segredos e disponibilidade; não prometa CI gratuito ou deploy instantâneo.
Proponha referências imutáveis por digest/versão, pull autenticado sem expor tokens e rollback da release. Evite SSH com credenciais em argumentos e host key checking desabilitado.
Mapeie migration como job controlado, compatibilidade com versão anterior e seed condicional/idempotente. Não rode seed automaticamente se seu efeito não estiver confirmado.
Considere download, extração, coexistência de releases, disco livre, smoke tests, healthchecks, readiness, timeouts, concorrência de deploy e recuperação de falha. App saudável não prova migration/seed funcionais.
Registre se rollback de código é insuficiente após migration e a estratégia de recuperação de dados.
DOCUMENTO
Crie docs/DEPLOY-CICD-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 07
7. Aplicação, framework e processos
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Percorra fluxos reais e código executado: SSR, APIs, consultas, caches, jobs, filas, WebSocket, imagens, arquivos, integrações e operações intensivas.
Identifique polling excessivo, serialização, resultados sem paginação, consultas repetidas, concorrência sem limite e trabalho síncrono custoso. Evidencie causas antes de sugerir refatoração.
Cache precisa de invalidação, limites, consistência e isolamento entre usuários/tenants. Preserve escrita durável, filas confiáveis e estado necessário.
Analise repetição/sobreposição de cron, retries, idempotência, backoff e graceful shutdown. Remover código inativo não garante redução de memória ou CPU; avalie artefato e processos afetados.
Adapte ferramentas e recomendações às versões reais; não prescreva APIs de framework sem confirmar compatibilidade.
Inclua testes de upload/download, autenticação, permissões, tarefas assíncronas e fluxos menos visíveis.
DOCUMENTO
Crie docs/APPLICATION-RUNTIME-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 08
8. VPS, Linux e capacidade compartilhada
Auditoria especializada, sem implementação.

Copiar prompt
Atue como arquiteto de software e engenheiro de plataforma, performance e banco de dados. Adapte a análise à stack efetivamente encontrada; não presuma Node, Next.js, Prisma ou Docker.
Objetivo: reduzir desperdícios de RAM, CPU, disco, I/O, imagens, containers e deploy preservando funcionalidades, persistência, segurança e confiabilidade.
Leia o inventário e os documentos anteriores. Esta etapa é somente auditoria: não altere código, configurações, serviços ou dados. Pode criar/atualizar os documentos de evidência.
Diferencie configuração declarada, comportamento efetivo e medição real. Ausência de referência em uma busca não prova ausência de uso. Confirme fluxos, jobs, integrações e consumidores externos.
Para cada item registre ID estável, arquivo/linha ou comando/data, ambiente, achado, impacto, proposta, risco, dependências, teste de aceite, rollback e métrica esperada. Não registre segredos ou dados pessoais.
Status de cobertura: PENDING, AUDITED, BLOCKED ou NOT APPLICABLE com justificativa. AUDITED significa analisado, não corrigido. Métrica indisponível: NOT MEASURED; não invente valores.
Não execute prune, exclusão de volumes, DROP, TRUNCATE ou limpeza destrutiva. Não gere carga significativa em produção durante a auditoria.

FOCO DESTA AUDITORIA
Com acesso autorizado de leitura, avalie memória disponível, swap, pressão de memória/I/O, load, CPU user/system/iowait/steal, disco/inodes, processos, limites e aplicações vizinhas.
Diferencie saturação da aplicação, concorrência entre clientes e contenção do provedor. Uma amostra de steal não basta para atribuir causa; registre série/contexto.
Inspecione proxy, TLS, logs, serviços do host, observabilidade e recuperação. Não desabilite controles de segurança/monitoramento para economizar recursos.
Avalie swap conforme carga e disco, sem tratá-la como RAM extra ou cura para falta de capacidade. Não altere sysctl, kernel, firewall ou serviços nesta auditoria.
Calcule capacidade agregada com folga para deploy, backup e falhas; não reduza limites comprometendo tráfego esperado. Se necessário, registre necessidade de maior VPS, separação de cargas ou contato com provedor.
DOCUMENTO
Crie docs/VPS-HOST-AUDIT.md. Inclua matriz item do inventário -> evidência -> status de cobertura. Mesmo sem achados registre a evidência examinada. Ao finalizar, informe totais AUDITED/PENDING/BLOCKED/NOT APPLICABLE e não avance automaticamente.
PROMPT 09
9. Plano mestre e gate de cobertura
Consolide todas as auditorias e prepare mudanças verificáveis.

Copiar prompt
Leia docs/VPS-OPT-INVENTORY.md, docs/VPS-OPT-BASELINE.md e as oito auditorias: CONTAINER-AUDIT, RUNTIME-RESOURCE-AUDIT, DOCKER-IMAGE-AUDIT, DATABASE-AUDIT, STORAGE-DISK-AUDIT, DEPLOY-CICD-AUDIT, APPLICATION-RUNTIME-AUDIT e VPS-HOST-AUDIT.
Não implemente ainda. Crie docs/VPS-OPT-MASTER-PLAN.md.
1. Gate de cobertura
Confronte todos os IDs do inventário com as auditorias. Registre itens analisados, pendentes, bloqueados e não aplicáveis. Lacunas relevantes impedem declarar o plano completo. É possível planejar tarefas independentes, deixando as dependentes bloqueadas.
2. Reconciliação de achados
Cada achado recebe exatamente um destino: tarefa no plano, duplicado de ID, falso positivo justificado, não aplicável justificado ou bloqueado. Preserve rastreabilidade de várias origens para uma tarefa.
Demonstre: achados totais = mapeados + duplicados + falsos positivos + não aplicáveis + bloqueados. Conte achados e tarefas separadamente.
3. Tarefas
ID | IDs de origem | problema/evidência | arquivos/serviços | solução | benefício esperado | métrica/unidade | risco | dependências | teste/critério de aceite | rollback | escopo autorizado | status.
Benefício é hipótese até medição. Limites somados menores não provam redução de consumo; imagens menores não equivalem automaticamente a disco físico recuperado.
4. Fases
Ordene por benefício, risco e dependências: mudanças reversíveis e observáveis; build/deploy; runtime/consultas; alterações arquiteturais apenas quando justificadas. Evite mudar dimensões independentes simultaneamente.
5. Operação
Defina ambiente de teste, carga comparável, janela de observação, checkpoints, backups restauráveis, limites de regressão para latência/erros/throughput e pontos de parada. Registre ações de produção ou destrutivas que dependem de autorização ainda não existente.
Status de tarefas: PENDING, IN PROGRESS, DONE, BLOCKED. DONE exige implementação e validação suficiente para seu escopo. Mudança local testada não é deploy validado.
SAÍDA
Fases, primeira fase elegível, tarefas, exceções, lacunas, métricas e plano de rollback. Pare após o plano.
PROMPT 10
10. Implementação de uma fase
Repita este prompt para cada próxima fase elegível.

Copiar prompt
Leia inventário, baseline, auditorias e docs/VPS-OPT-MASTER-PLAN.md. Execute somente a próxima fase elegível no escopo já autorizado. Não execute produção, limpeza ou migração destrutiva sem autorização existente.
ANTES
Confirme ambiente, branch, arquivos, dependências, escopo e critérios de aceite. Revalide evidências. Prepare rollback, checkpoint e backup/restauração quando houver dados afetados. Se dependência estiver bloqueada, registre e execute apenas tarefas independentes elegíveis.
DURANTE
Implemente mudanças pequenas com rastreabilidade por ID. Preserve funcionalidades, isolamento, persistência e integrações. Não substitua banco por memória/localStorage, não use mock em fluxo real e não remova serviços por suposição.
Mantenha versões de runtime/ORM compatíveis, módulos nativos e ferramentas necessárias ao ciclo completo. Não limpe volumes ou imagens de rollback para produzir ganho artificial.
DEPOIS
Execute verificações adequadas: lint/typecheck/build e testes dos fluxos alterados. Para imagens/deploy, teste isoladamente startup, consulta real ao banco, migration em banco descartável e seed quando necessário, sem contaminar produção.
Teste também autenticação, uploads/downloads, jobs, filas e permissões quando afetados. Confirme limites efetivos, healthcheck, logs, OOM e reinícios.
Atualize o plano com evidência, comandos sem segredos, ambiente, resultados, métricas e rollback. Marque DONE apenas conforme critério de aceite; documente o que permanece não verificado em produção.
Se teste falhar, interrompa a mudança dependente, corrija dentro da fase ou faça rollback e registre BLOCKED. Não esconda regressão para concluir.
Informe diffs/resumo, IDs, testes, pendências e próximo passo. Não implemente outra fase automaticamente.
PROMPT 11
11. Validação e medição antes/depois
Comprove o efeito da fase e verifique regressões.

Copiar prompt
Leia docs/VPS-OPT-BASELINE.md e a fase implementada do plano. Crie/atualize docs/VPS-OPT-VALIDATION.md. Esta etapa valida; não introduza novas otimizações.
1. Condições comparáveis
Registre versão/digest, ambiente, tráfego/dataset, cache frio/quente, duração e concorrência. Use a mesma definição de métrica nos dois lados. Sem ambiente real, identifique validação local e não declare ganho de produção.
2. Recursos
Compare RAM/RSS e pico, heap/GC quando aplicável, CPU, I/O, disco/inodes, imagens/camadas compartilhadas, volumes, logs, conexões, containers/processos, tempo/pico de deploy e downtime.
Registre limite configurado separado do consumo. Inclua unidade, fonte, janela, antes, depois, delta e limitações. Não compare snapshots de cargas diferentes como prova.
3. Qualidade
Compare latência p50/p95 quando disponível, erros, throughput, OOM, reinícios, filas/backlog, jobs, upload/download, autenticação/permissões, integridade e recuperação. Uma redução de RAM que degrada serviço não é aprovação.
4. Ciclo de deploy
Valide imagem final, startup, migrations e seed separadamente em ambiente seguro. Confirme healthchecks, readiness, persistência após recriação, compatibilidade e rollback. Seed não aplicável exige justificativa.
5. Resultados
Ganho percentual para métrica em que menor é melhor = (antes - depois) / antes x 100, apenas com baseline não zero e comparável. Para zero, ausência ou NOT MEASURED, não calcule percentual.
6. Gate
Classifique a fase como VALIDATED, PARTIALLY VALIDATED, BLOCKED ou REGRESSION FOUND. Se limite de regressão for excedido, indique rollback conforme autorização vigente e suspenda dependentes.
Atualize evidências no plano. Informe ganhos medidos, hipóteses ainda não comprovadas, testes, lacunas e janela de observação. Não avance automaticamente.
PROMPT 12
12. Auditoria final independente
Reconfira o estado real; não confie somente nos status do plano.

Copiar prompt
Revise o estado atual com independência de julgamento. Não presuma conclusão porque tarefas estão DONE. Esta revisão não exige executar outro agente; se houver outro revisor, ele deve usar as mesmas evidências.
Leia inventário, baseline, oito auditorias, plano, validação, código/configurações atuais e ambiente acessível. Crie docs/VPS-OPT-FINAL-AUDIT.md.
Reconte aplicações, serviços/containers, processos, volumes e Dockerfiles. Registre itens novos e alterações de uso. Compare cada achado com plano, implementação e teste; verifique arquivos/linhas e comportamento atual.
Reconfira funcionalidade, persistência, segurança, isolamento entre clientes, runtime, banco/pools, imagens, build/deploy, jobs, storage, logs, backups e capacidade do host.
Verifique caminhos independentes: aplicação e consulta, migrations e seed aplicável. Procure ferramentas removidas, motores ausentes, imports dinâmicos, cache sem invalidação, jobs perdidos, exposição de arquivos privados e regressões de latência/erro.
Revise medições e condições de comparação. Não aceite limite configurado como consumo, soma de imagens como disco real ou dados locais como ganho medido em produção.
Matriz: ID de origem | tarefa | implementação encontrada | teste/evidência | resultado | pendência. Reconcilie inventário, cobertura, achados e tarefas sem misturar suas contagens.
Informe: totais inventariados, auditados, implementados, verificados, DONE/PENDING/BLOCKED, não aplicáveis, regressões, problemas novos, exceções e métricas NOT MEASURED. Liste testes e limitações de acesso.
Dê um veredito proporcional: concluído no escopo verificado, parcialmente validado ou bloqueado. Com item relevante pendente, bloqueado, não verificado ou regressão, não declare 100% concluído.
Novos problemas viram IDs no plano, não correções silenciosas nesta etapa. Informe ganhos reais, riscos remanescentes, recuperação e manutenção recomendada. Pare após a auditoria.