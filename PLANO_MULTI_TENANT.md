# PLANO DE EVOLUÇÃO MULTI-TENANT — MercadoFlow / PDV2Cloud

> **Objetivo do documento:** Roadmap executável para levar a plataforma do nível de maturidade atual (**2/5**, ver `AUDITORIA_MULTI_TENANT.md`) até um SaaS multi-tenant moderno, seguro, escalável e pronto para produção.
> **Premissa:** Este plano é autossuficiente — outra equipe deve conseguir executá-lo usando apenas a auditoria e este plano.
> **Modelo mantido:** banco compartilhado + schema compartilhado + discriminador por coluna (`market_id`). O plano **endurece** este modelo (não o substitui), pois ele escala para milhares de tenants quando bem defendido.

## Como ler este plano

As fases estão ordenadas por risco decrescente: primeiro estanca-se o que **bloqueia produção** (vazamento entre tenants, segredos), depois torna-se o isolamento **estrutural**, depois **escala** e **observabilidade**. Cada fase termina com uma **etapa de reavaliação técnica** obrigatória antes de prosseguir.

**Legenda de esforço:** P (≤2 dias) · M (3–5 dias) · G (1–2 semanas) · GG (>2 semanas).

---

## FASE 0 — Contenção de Emergência (P0, bloqueadores de produção)

### Objetivo
Estancar os dois riscos que, isoladamente, impedem o go-live: o vazamento de dados entre tenants e os segredos versionados.

### Justificativa
São falhas **P0** da auditoria (Z-1, A-1, A-2). Enquanto existirem, nenhum cliente real pode ser onboarded com segurança.

### Benefícios
- Elimina o vazamento cross-tenant conhecido.
- Remove o comprometimento total possível via segredo JWT/credenciais.

### Riscos
- Rotação do JWT secret **invalida todas as sessões ativas** (usuários serão deslogados) — comunicar/agendar.
- Purga de histórico do Git reescreve commits — coordenar com todos os clones.

### Dependências
Nenhuma. É o ponto de partida.

### Alterações no Banco
- Nenhuma alteração de schema. Auditar dados existentes em `supplier_orders`/`suppliers` para confirmar que não houve escrita cross-tenant indevida (query de reconciliação: pedidos cujo `supplier.market_id` ≠ `order.market_id`).

### Alterações no Backend
1. **Corrigir Z-1:** injetar `MarketAccessService` no `SupplierOrderController` e chamar `assertCanAccessMarket(marketId, authentication)` no **início de todos os métodos** (`list`, `get`, `create`, `updateNotes`, `addItem`, `updateItem`, `removeItem`, `send`, `receive`, `cancel`, `delete`). Adicionar `Authentication` aos métodos que ainda não o recebem.
2. **Rotacionar e externalizar segredos (A-1/A-2):**
   - Remover o default de `jwt.secret` do `application.yml` (deixar sem fallback → falha rápida se não configurado).
   - Remover `JWT_SECRET` hardcoded do `docker-compose.yml`; passar por `.env`/secret manager.
   - Gerar novo segredo forte e rotacionar.
   - Trocar as senhas de `admin@mercadoflow.com` e `superadmin@mercadoflow.com`.
   - Remover `CREDENTIALS.md` e `SUPER_ADMIN_TEST_CREDENTIALS.md` do repositório; adicionar ao `.gitignore`; purgar do histórico (`git filter-repo`).

### Alterações no Frontend
- Nenhuma funcional. Após a rotação do JWT, validar o fluxo de re-login.

### Alterações nas APIs
- Nenhuma mudança de contrato; apenas passa a retornar **403** corretamente para acesso cross-tenant em supplier-orders.

### Alterações na Infraestrutura
- Introduzir arquivo `.env` (não versionado) para segredos no compose; documentar variáveis obrigatórias.

### Estratégia de Testes
- Teste de integração: usuário do mercado A recebe **403** em todos os endpoints de `supplier-orders` do mercado B.
- Verificação manual: login funciona com novo segredo; segredo antigo não valida tokens.
- `grep` no repositório confirmando ausência de segredos.

### Critérios de Aceite
- [ ] Todos os métodos de `SupplierOrderController` chamam `assertCanAccessMarket`.
- [ ] Nenhum segredo/credencial presente no working tree nem no histórico do Git.
- [ ] JWT secret e senhas de admin rotacionados; app sobe sem defaults embutidos.
- [ ] Teste automatizado de 403 cross-tenant em supplier-orders passando.

### 🔎 Reavaliação técnica (fim da Fase 0)
Confirmar via revisão de código e execução dos testes que Z-1 está fechado e que não há segredos versionados. **Só prosseguir** se ambos os P0 estiverem resolvidos. Reexecutar a matriz de isolamento (Auditoria §3.8) para a linha "APIs web".

---

## FASE 1 — Isolamento Estrutural (P1)

### Objetivo
Transformar o isolamento de tenant de "opt-in manual" (frágil) para "garantido por arquitetura", de modo que endpoints nasçam seguros por padrão.

### Justificativa
Z-1 aconteceu porque o padrão atual depende de o desenvolvedor lembrar de chamar `assertCanAccessMarket` (71 chamadas manuais, Z-2). Sem mudança estrutural, o vazamento se repetirá.

### Benefícios
- Novos endpoints herdam isolamento automaticamente.
- Defesa em profundidade: mesmo um bug de aplicação não vaza dados (RLS).

### Riscos
- RLS mal configurado pode **bloquear queries legítimas** ou os jobs (que operam sobre todos os tenants) — exige `BYPASSRLS`/role de serviço para jobs.
- Refatoração ampla; risco de regressão sem a suíte de testes (por isso a Fase 1 pressupõe testes da Fase 0 em expansão).

### Dependências
Fase 0 concluída.

### Alterações no Banco
1. **Row-Level Security (defesa em profundidade):**
   - Ativar RLS nas tabelas com `market_id` (`invoices`, `invoice_items`* , `sales_analytics`, `alerts`, `campaigns`, `pdvs`, `suppliers`, `supplier_orders`, `demand_forecasts`, `market_basket_rules`, tabelas de ofertas).
   - Policy: `USING (market_id = current_setting('app.current_market')::uuid)`.
   - Role de aplicação sujeita à RLS; role separada (jobs/admin) com `BYPASSRLS`.
   - *Para `invoice_items` (sem `market_id` direto), usar policy via join com `invoices` ou denormalizar `market_id`.
2. **Corrigir nullability (D-2):** migration para `market_id NOT NULL` em `sales_analytics`, `alerts`, `campaigns`, `pdvs` após limpeza de eventuais órfãos.

### Alterações no Backend
1. **`TenantContext` + interceptor:** um `HandlerInterceptor`/filtro que, após a autenticação, resolve o `market_id` do usuário e o coloca num `ThreadLocal` (`TenantContext`) e no `SET app.current_market` da conexão (para a RLS).
2. **Validação automática de rota:** interceptor que, para qualquer path com `{marketId}`, compara com o `TenantContext` e rejeita divergência — eliminando a necessidade das 71 chamadas manuais (que podem ser removidas gradualmente ou mantidas como redundância defensiva).
3. **Origem única do tenant:** services deixam de confiar no `marketId` da URL para escrita; passam a derivá-lo do `TenantContext`.

### Alterações no Frontend
- Nenhuma obrigatória (o `marketId` na URL continua válido, mas deixa de ser a fonte de verdade de segurança). Opcional: simplificar chamadas removendo `marketId` redundante.

### Alterações nas APIs
- Comportamento idêntico para o cliente legítimo; acesso cross-tenant passa a ser bloqueado em **duas camadas** (interceptor + RLS).

### Alterações na Infraestrutura
- Configurar a role de banco da aplicação **sem** `BYPASSRLS`; role de jobs **com** `BYPASSRLS`. Ajustar `docker-compose`/deploy.

### Estratégia de Testes
- Teste de contrato multi-tenant **genérico**: varredura de todos os endpoints com `{marketId}` verificando 403 cross-tenant.
- Teste de RLS: query direta na role de aplicação sem `SET app.current_market` retorna vazio; com o tenant errado, vazio.
- Teste de que os jobs (role BYPASSRLS) continuam enxergando todos os tenants.

### Critérios de Aceite
- [ ] RLS ativa e testada nas tabelas transacionais; jobs funcionam via role BYPASSRLS.
- [ ] `TenantContext` populado por interceptor; `SET app.current_market` por request.
- [ ] Teste genérico de 403 cross-tenant cobrindo **todos** os endpoints `{marketId}`.
- [ ] `market_id NOT NULL` nas tabelas corrigidas, sem órfãos.

### 🔎 Reavaliação técnica (fim da Fase 1)
Refazer a matriz de isolamento da Auditoria (§3.8). Alvo: linhas "Consultas", "APIs web" e "Autorização" passam de ⚠️ para ✅. Rodar teste de penetração interno (tentar acessar tenant alheio por todas as rotas). **Só prosseguir** com o teste genérico 100% verde.

---

## FASE 2 — Autenticação, Sessão e Auditoria (P1/P2)

### Objetivo
Endurecer autenticação/sessão e tornar a plataforma auditável e rastreável por tenant.

### Justificativa
Achados A-3, A-4, API-1, L-1: JWT sem claims/revogação, sem rate limit no login, logs sem contexto de tenant, auditoria parcial.

### Benefícios
- Logout real (revogação), proteção contra brute force, investigação de incidentes por tenant.

### Riscos
- Introdução de revogação (blacklist) adiciona dependência de estado (Redis) — coordenar com Fase 3.
- Mudança de claims do JWT invalida tokens antigos (novo re-login).

### Dependências
Fase 1 (TenantContext facilita popular MDC/auditoria).

### Alterações no Banco
- Tabela de tokens revogados (`revoked_tokens`) **ou** uso de Redis (preferível). Expandir `audit_logs` se necessário (já tem `market_id`).

### Alterações no Backend
1. **JWT com claims** de `tenantId`, `role`, `jti`; validar `expiration`/`issuer`. Migrar da API depreciada do jjwt (A-4).
2. **Revogação de sessão:** `jti` + blacklist (Redis) checada no `JwtAuthenticationFilter`; logout adiciona o `jti` à blacklist.
3. **Rate limit no login** (API-1): estender o filtro para `/api/v1/auth/login` e `/super-admin/auth/login` (por IP + email).
4. **MDC por request** (L-1): filtro que seta `userId`/`marketId`/`requestId`/`agentKeyId` no MDC (já declarados no `logback-spring.xml`).
5. **Cobertura de auditoria:** interceptar todas as ações de escrita (não só ingestão) via aspecto/anotação `@Audited`.

### Alterações no Frontend
- Tratar 401 pós-revogação com re-login limpo (já há interceptor em `api.ts`; validar).

### Alterações nas APIs
- Restringir Swagger em produção (API-2): `permitAll` só em `dev`.

### Alterações na Infraestrutura
- Provisionar Redis (compartilhado com Fase 3).

### Estratégia de Testes
- Logout invalida o token imediatamente (request seguinte → 401).
- Brute force de login barrado após N tentativas.
- Logs de qualquer request carregam `marketId`/`userId` populados.
- Auditoria registra CREATE/UPDATE/DELETE das entidades principais.

### Critérios de Aceite
- [ ] Token revogado no logout; claims de tenant/role presentes.
- [ ] Rate limit ativo no login (web e super-admin).
- [ ] MDC populado em 100% dos requests autenticados.
- [ ] Auditoria cobrindo ações de escrita das entidades de tenant.
- [ ] Swagger não exposto em produção.

### 🔎 Reavaliação técnica (fim da Fase 2)
Revisar Auditoria §3.1, §3.6 e linha "Logs/Auditoria" da §3.8 — alvo ✅. Simular incidente e confirmar rastreabilidade fim-a-fim por tenant. **Só prosseguir** após validar revogação e observabilidade.

---

## FASE 3 — Escalabilidade (P2)

### Objetivo
Preparar a plataforma para crescimento de tenants, usuários, dados e integrações.

### Justificativa
Achados E-1 e §3.7: jobs sequenciais, rate limit local (quebra ao escalar réplicas), sem cache/fila, sem particionamento.

### Benefícios
- Escala horizontal da API; janela de jobs constante independente do nº de tenants; integrações desacopladas.

### Riscos
- Introdução de fila/particionamento aumenta complexidade operacional.
- Particionamento exige migração cuidadosa de tabelas grandes.

### Dependências
Fase 2 (Redis já provisionado).

### Alterações no Banco
- **Particionamento** de `invoices`, `invoice_items`, `sales_analytics` por intervalo de tempo (e/ou hash de `market_id`).
- Política de **retenção/arquivamento** de dados frios.

### Alterações no Backend
1. **Rate limit distribuído** (E-1): migrar `RateLimitFilter` para bucket4j + Redis.
2. **Cache de sessão/perfil**: cachear `loadUserByUsername`/perfil por curto TTL (reduz hit no banco por request — A-3).
3. **Jobs paralelizados por tenant** com pool controlado (`AsyncConfig` já existe); ou migrar para fila de trabalho.
4. **Mensageria** (RabbitMQ/SQS) para crawler/enriquecimento/ingestão pesada, desacoplando do request e dos jobs monolíticos.

### Alterações no Frontend
- Nenhuma obrigatória.

### Alterações nas APIs
- Endpoints de longa duração (ex.: import de catálogo) passam a responder assíncrono (job id + polling/webhook).

### Alterações na Infraestrutura
- Provisionar broker de fila; múltiplas réplicas da API atrás do nginx/load balancer; Redis já presente.

### Estratégia de Testes
- Teste de carga: N tenants × M usuários com janela de jobs dentro do SLA.
- Rate limit efetivo com 2+ réplicas.
- Failover: réplica cai, sessões continuam (stateless + Redis).

### Critérios de Aceite
- [ ] API escala horizontalmente com rate limit consistente.
- [ ] Jobs concluem dentro do SLA com Nx tenants (definir N alvo, ex.: 1.000).
- [ ] Tabelas de fato particionadas com plano de retenção.
- [ ] Integrações pesadas rodando via fila.

### 🔎 Reavaliação técnica (fim da Fase 3)
Reavaliar Auditoria §3.7 — alvo todas as linhas ✅. Rodar teste de carga com o alvo de tenants definido. **Só prosseguir** se os SLAs forem atingidos.

---

## FASE 4 — Governança, Qualidade e Prontidão Final (P2/P3)

### Objetivo
Fechar as lacunas de qualidade e operação que faltam para um SaaS maduro.

### Justificativa
Ausência total de testes (§4.3), contratos não tipados (API-3), catálogo global sem barreira (D-3), gestão de segredos contínua.

### Benefícios
- Rede de segurança contra regressões; contratos estáveis; operação confiável.

### Riscos
- Baixo; é consolidação.

### Dependências
Fases 0–3.

### Alterações no Banco
- Trilha de auditoria de escrita no catálogo global (D-3).

### Alterações no Backend
1. **Suíte de testes**: unitários + integração, com **cobertura obrigatória do isolamento multi-tenant** como gate de CI.
2. **Tipar contratos** (API-3): substituir `Map<String,Object>` por DTOs com validação (`SupplierOrderController` e afins).
3. **Versionamento de API** e documentação estável.

### Alterações no Frontend
- Testes E2E dos fluxos críticos por role; revisar exposição de autofill de teste (F-3).

### Alterações nas APIs
- Contratos tipados e versionados; OpenAPI gerado e revisado.

### Alterações na Infraestrutura
- Pipeline CI/CD com gates (testes, lint, scan de segredos, SAST).
- Secret manager (Vault/cloud) em vez de `.env` em produção.
- Backups testados e restauração ensaiada.

### Estratégia de Testes
- CI falha se qualquer teste de isolamento cross-tenant quebrar.
- Scan de segredos no pipeline (bloqueante).
- E2E cobrindo login, ingestão, dashboards, ofertas, super-admin.

### Critérios de Aceite
- [ ] Cobertura de testes com gate de isolamento multi-tenant no CI.
- [ ] Contratos tipados e versionados; sem `Map<String,Object>` em endpoints públicos.
- [ ] Scan de segredos e SAST no pipeline.
- [ ] Backups com restauração ensaiada e documentada.

### 🔎 Reavaliação técnica (fim da Fase 4)
Reexecutar a auditoria completa (`AUDITORIA_MULTI_TENANT.md`). **Meta:** maturidade **≥ 4/5** em todas as dimensões e **zero** achados P0/P1 abertos. Emitir parecer de go-live.

---

## Resumo do Roadmap

| Fase | Foco | Esforço | Bloqueia produção? |
|---|---|---|---|
| 0 | Contenção (vazamento + segredos) | M | **Sim** — obrigatória |
| 1 | Isolamento estrutural (RLS + TenantContext) | G | **Sim** — obrigatória |
| 2 | Auth/sessão/auditoria/observabilidade | G | Recomendada antes do GA |
| 3 | Escalabilidade (fila, cache, partição) | GG | Necessária para escala real |
| 4 | Governança, testes, contratos | G | Necessária para GA maduro |

**Sequenciamento mínimo para primeiro cliente real (MVP seguro):** Fases 0 e 1 completas + itens de rate limit de login e revogação da Fase 2. As Fases 3 e 4 podem correr em paralelo ao onboarding controlado, desde que a reavaliação de cada fase seja respeitada antes de avançar.

---

## Rastreabilidade Auditoria → Plano

| Achado (Auditoria) | Fase que resolve |
|---|---|
| Z-1 (vazamento supplier-orders) | Fase 0 |
| A-1, A-2 (segredos/credenciais no Git) | Fase 0 |
| Z-2, D-1 (isolamento opt-in / sem RLS) | Fase 1 |
| D-2 (`market_id` nullable) | Fase 1 |
| A-3, A-4 (JWT/sessão) | Fase 2 |
| API-1 (rate limit login) | Fase 2 |
| L-1 (MDC vazio) | Fase 2 |
| API-2 (Swagger público) | Fase 2 |
| E-1 (rate limit local) | Fase 3 |
| §3.7 (jobs/cache/partição) | Fase 3 |
| Ausência de testes | Fase 0 (semente) → Fase 4 (gate) |
| API-3 (contratos não tipados) | Fase 4 |
| D-3 (catálogo global) | Fase 4 |
| Z-3, Z-4 (ADMIN/INDUSTRY escopo) | Fase 1 (reavaliar modelo de papéis) |
