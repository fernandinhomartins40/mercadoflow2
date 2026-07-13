# AUDITORIA MULTI-TENANT — Plataforma MercadoFlow / PDV2Cloud

> **Escopo:** Engenharia reversa da implementação atual (branch `main`) para avaliar a maturidade da arquitetura multi-tenant e a prontidão para operar como SaaS em produção.
> **Método:** A análise tem como fonte primária o código-fonte observado. A documentação do repositório (`README.md`, `docs/`, `CREDENTIALS.md`) foi usada apenas como apoio e validada contra a implementação.
> **Data:** 2026-07-13

---

## 1. Sumário Executivo

O MercadoFlow é uma plataforma SaaS para coleta e análise de dados de vendas de supermercados, composta por: **agente desktop** (Python/Windows, coleta XML de NF-e), **backend** (Spring Boot 3 / Java 17 / PostgreSQL 16), **frontend web** (React + Vite) e um **painel Super Admin** separado. O modelo de negócio é multi-tenant, onde cada **Mercado (`Market`)** é o tenant.

**Nível de maturidade multi-tenant: 2 de 5 — "Multi-tenant funcional, porém inconsistente e não pronto para produção".**

| Dimensão | Nota (0–5) | Comentário |
|---|---|---|
| Isolamento de dados (modelo) | 3 | Todo dado transacional carrega `market_id`; catálogo de produtos é global por design. |
| Isolamento em runtime (consultas/APIs) | 2 | Aplicado via checagem manual repetida; há endpoints sem checagem (vazamento real). |
| Autenticação | 3 | JWT + cookie HttpOnly, BCrypt, separação de escopo super-admin. Segredos fracos e versionados. |
| Autorização / RBAC | 2 | RBAC por role existe, mas o isolamento de tenant não é garantido pela arquitetura. |
| Modelo de dados | 3 | Constraints e índices por `market_id` presentes; sem defesa em profundidade (RLS). |
| Escalabilidade | 2 | Tenant único por schema compartilhado; jobs sequenciais; sem cache distribuído. |
| Segurança geral | 2 | Segredos hardcoded, credenciais no repositório, CORS/JWT frágeis. |
| Preparação para produção | 1 | Sem testes, segredos versionados, isolamento não garantido. |

**Veredito:** A plataforma **ainda não pode ser considerada um SaaS multi-tenant pronto para produção.** A modelagem de dados suporta o conceito de tenant, mas o isolamento depende de checagens manuais repetidas em cada controller — um padrão frágil que **já apresenta pelo menos uma falha concreta de vazamento entre tenants** (módulo de pedidos a fornecedores). Combinado com segredos versionados no Git e ausência total de testes automatizados, o risco para produção é alto.

---

## 2. Arquitetura Encontrada

### 2.1 Componentes

```
┌─────────────────┐     HTTPS (X-API-Key + HMAC)    ┌──────────────────────┐
│ Agente Desktop  │ ───────────────────────────────>│                      │
│ (Python/Windows)│      POST /api/v1/ingest/*       │   Backend Spring     │
└─────────────────┘                                  │   Boot (API REST)    │
                                                     │                      │
┌─────────────────┐     HTTPS (cookie JWT)           │   - Controllers      │
│ Frontend React  │ ───────────────────────────────>│   - Services         │
│ (app + super-   │      /api/v1/**                  │   - Repositories JPA │
│  admin)         │                                  │   - Jobs @Scheduled  │
└─────────────────┘                                  └──────────┬───────────┘
                                                                │
                                                     ┌──────────▼───────────┐
                                                     │  PostgreSQL 16        │
                                                     │  (schema único        │
                                                     │   compartilhado)      │
                                                     └───────────────────────┘
```

- **Backend:** `backend/` — Spring Boot, ~323 arquivos Java. Pacotes: `controller` (19), `service`, `repository`, `model/entity` (49 entidades), `model/dto` (120 DTOs), `security`, `job` (8 jobs), `config`.
- **Frontend:** `frontend/` — React + Vite + TypeScript, ~120 arquivos. Autenticação por cookie (`withCredentials`), dois contextos de auth (`AuthContext`, `SuperAdminAuthContext`).
- **Agente:** `pdv2cloud-agent/` (serviço Python) + `pdv2cloud-config/` (Electron/React).
- **Infra:** `docker-compose.yml` — nginx + postgres + api + cron-jobs. Deploy VPS via `deploy/`.
- **Migrations:** Flyway, 27 versões (`V1`–`V27`), `ddl-auto: validate`.

### 2.2 Estratégia multi-tenant

**Modelo: banco compartilhado, schema compartilhado, discriminador por coluna (`market_id`).**

- O tenant é a entidade **`Market`** (`markets`).
- Um **`User`** pertence a **no máximo um** `Market` (relação `@ManyToOne`, `market_id` na tabela `users`). Não há suporte a um usuário atuando em múltiplos tenants.
- Papéis (`UserRole`): `SUPER_ADMIN`, `ADMIN`, `MARKET_OWNER`, `MARKET_MANAGER`, `INDUSTRY_USER`.
- Todo dado transacional (`invoices`, `invoice_items`, `sales_analytics`, `alerts`, `campaigns`, `pdvs`, `suppliers`, `supplier_orders`, `demand_forecasts`, `market_basket_rules`, ofertas, etc.) referencia `market_id`.
- **Catálogo de produtos (`products`) é global e compartilhado entre todos os tenants** — decisão de design deliberada (identidade por GTIN/EAN, enriquecido por crawler). O vínculo produto↔tenant se dá via `product_observations` (que carrega `market_id`) e via as agregações de vendas.

---

## 3. Análise Detalhada por Dimensão

### 3.1 Autenticação

**Implementado:**
- Login por email/senha com **BCrypt** (`BCryptPasswordEncoder`).
- **JWT** (HS512) emitido no login, transportado por **cookie `HttpOnly`** (`pdv2cloud_token`), com `Secure` quando a conexão é HTTPS e `SameSite` configurável. TTL de 1 dia (ou 30 dias com "manter conectado").
- **Escopo separado para Super Admin:** cookie distinto (`pdv2cloud_superadmin_token`), endpoint de login isolado (`/api/v1/super-admin/auth/login`), e o `/api/v1/auth/me` **rejeita** (403) usuários `SUPER_ADMIN`, evitando cruzamento de escopos. Boa prática observada em `JwtAuthenticationFilter` e `AuthService`.
- **Autenticação do agente:** filtro dedicado (`AgentApiKeyAuthenticationFilter`) que valida uma API key (`pdv2_...`) por **SHA-256** contra `agent_api_keys`, e um **`HmacSignatureFilter`** que valida assinatura HMAC-SHA256 do corpo + timestamp (janela anti-replay de 5 min) nos writes de ingestão. Este é o ponto **mais maduro** de toda a segurança do sistema.
- **Bloqueio de acesso por billing:** `CustomUserDetailsService.isUserEnabled()` desabilita o usuário se o `Market` estiver inativo, com billing `PENDING`/`SUSPENDED`/`CANCELLED`, ou com `accessExpiresAt` vencido. Bom mecanismo de "kill switch" por tenant.

**Riscos / achados:**

| # | Severidade | Achado |
|---|---|---|
| A-1 | 🔴 CRÍTICO | **Segredo JWT hardcoded e versionado.** O `application.yml` traz um default de `jwt.secret` real, e o `docker-compose.yml` fixa o **mesmo** segredo. Qualquer pessoa com acesso ao repositório pode forjar tokens de qualquer usuário/tenant. |
| A-2 | 🔴 CRÍTICO | **Credenciais de produção no repositório.** `CREDENTIALS.md` e `SUPER_ADMIN_TEST_CREDENTIALS.md` contêm senhas de admin e super-admin de produção (valores redigidos; rotacionados na Fase 0) versionadas. |
| A-3 | 🟠 ALTO | **JWT sem claims de tenant/role/expiração de sessão server-side.** O token só carrega o `subject` (email). Todo request refaz `loadUserByUsername` no banco (custo por request) e não há revogação de token (logout apenas apaga o cookie do lado do cliente; o token continua válido até expirar). |
| A-4 | 🟠 ALTO | **API do JWT depreciada e algoritmo via string.** Uso de `Jwts.parser().setSigningKey(String)` e `SignatureAlgorithm.HS512` da API antiga do jjwt; `parseClaimsJws` sem `requireExpiration`/validação de issuer/audience. Recomendado migrar para a API nova e chave derivada corretamente. |

### 3.2 Autorização / RBAC / Isolamento entre tenants

Este é o **ponto mais frágil** da arquitetura.

**Como funciona hoje:**
1. **Camada 1 — RBAC por rota** (`SecurityConfig`): mapeia prefixos de URL a roles (`/api/v1/markets/**` → `MARKET_OWNER`/`MARKET_MANAGER`/`ADMIN`/`SUPER_ADMIN`, `/api/v1/super-admin/**` → `SUPER_ADMIN`, etc.). Isso garante *que role* pode acessar, **mas não qual tenant**.
2. **Camada 2 — checagem manual de tenant** (`MarketAccessService.assertCanAccessMarket`): chamada **explicitamente em cada método** de controller que recebe `{marketId}` no path. Compara o `marketId` da URL com o `market_id` do usuário autenticado; `ADMIN`/`SUPER_ADMIN` passam livremente.

**O problema estrutural:** o isolamento **não é garantido pela arquitetura** — depende de o desenvolvedor **lembrar** de chamar `assertCanAccessMarket` em cada novo endpoint. Não há interceptor global, filtro por tenant no Hibernate, nem Row-Level Security no banco. É um padrão "opt-in", e o custo de esquecer é um vazamento entre tenants.

**Achados concretos:**

| # | Severidade | Achado |
|---|---|---|
| Z-1 | 🔴 CRÍTICO | **Vazamento entre tenants em Pedidos a Fornecedores.** `SupplierOrderController` (`/api/v1/markets/{marketId}/supplier-orders`) **não chama `assertCanAccessMarket` em nenhum método**, e o `SupplierOrderService` **não tem nenhuma referência** a `MarketAccessService`/`Authentication` (0 ocorrências). Um usuário autenticado de um mercado A pode listar/criar/editar/receber/cancelar/**excluir** pedidos de qualquer mercado B, bastando trocar o `{marketId}` da URL. As queries até filtram por `marketId`, mas o `marketId` vem da URL sem validação contra o usuário. |
| Z-2 | 🟠 ALTO | **Padrão de isolamento não escalável e propenso a erro.** Há **71 chamadas manuais** de `assertCanAccessMarket` espalhadas por 6 arquivos (30 só no `MarketController`, 32 no `OfferDesignerController`). Cada novo endpoint precisa repetir o boilerplate; o Z-1 é a prova de que a omissão já ocorreu. |
| Z-3 | 🟡 MÉDIO | **`ADMIN` global sem escopo de tenant.** O papel `ADMIN` (distinto de `SUPER_ADMIN`) tem bypass total de tenant em `assertCanAccessMarket` e pode listar todos os mercados (`IndustryController`, `MarketController.listMarkets`). É um "super-usuário" adicional cujo blast radius não está segmentado. |
| Z-4 | 🟡 MÉDIO | **`INDUSTRY_USER` enxerga todos os mercados ativos.** `IndustryController.listMarkets()` retorna `findAllActive()` sem qualquer filtro de relacionamento indústria↔mercado. Se o produto de indústria evoluir, isso é um vetor de exposição de base de clientes. |

### 3.3 Modelo de Dados

**Implementado:**
- Chaves primárias **UUID** em todas as entidades (bom para multi-tenant — sem IDs sequenciais adivinháveis).
- `market_id` presente e com **foreign key** para `markets(id)` em todas as tabelas transacionais.
- **Constraints de unicidade** que respeitam o tenant onde importa: `uq_sales_analytics_market_product_date (market_id, product_id, date)`, `uq_demand_forecast_market_product_date`, etc.
- **Índices compostos com `market_id` à esquerda:** `idx_market_date (market_id, data_emissao)`, `idx_market_product_date`, `idx_market_basket_rules_market_computed`, índices de billing (`idx_markets_billing_status`, `idx_markets_access_expires_at`). Isso é adequado para queries filtradas por tenant.
- Migrations versionadas com Flyway e `ddl-auto: validate` (não deixa o Hibernate alterar o schema em produção — boa prática).

**Riscos / achados:**

| # | Severidade | Achado |
|---|---|---|
| D-1 | 🟠 ALTO | **Sem defesa em profundidade no banco.** Não há **Row-Level Security (RLS)** no PostgreSQL nem qualquer filtro automático por tenant no ORM (ex.: Hibernate `@Filter`/multitenancy). O `market_id` é a única barreira, e ela vive na camada de aplicação. Um bug de query (como Z-1) contorna tudo. |
| D-2 | 🟡 MÉDIO | **`market_id` nullable em várias tabelas.** Em `V1`, `sales_analytics.market_id`, `alerts.market_id`, `campaigns.market_id` e `pdvs.market_id` **não são `not null`** (apenas `invoices.market_id` é). Registros órfãos (sem tenant) são fisicamente possíveis. |
| D-3 | 🟡 MÉDIO | **Catálogo global sem barreira de escrita por tenant.** `products` é compartilhado (correto por design), mas as rotas de escrita do catálogo (`/api/v1/admin/catalog/**`) dependem só do papel `ADMIN`. Não há trilha que impeça um `ADMIN` de um contexto de contaminar o catálogo global visto por todos. |
| D-4 | 🟢 BAIXO | **Ausência de particionamento/estratégia de arquivamento.** Para "milhares de tenants" com histórico de NF-e, tabelas como `invoice_items` e `sales_analytics` crescerão sem particionamento por tempo/tenant previsto. |

**A modelagem suporta milhares de tenants?** Conceitualmente **sim** (discriminador por coluna com índices adequados escala para milhares de tenants em schema compartilhado). Na prática, **ainda não com segurança**, pela ausência de RLS/defesa em profundidade (D-1) e pela nullabilidade que permite órfãos (D-2). O gargalo será operacional (jobs e agregações — ver 3.7), não o modelo relacional em si.

### 3.4 Backend (Controllers, Services, Repositories, Jobs)

- **Controllers:** o contexto de tenant é derivado de duas formas — (a) do `{marketId}` no path + `assertCanAccessMarket` (maioria), (b) do principal do agente (`AgentPrincipal.getMarketId()`) na ingestão. A forma (b) é **segura por construção** (o `marketId` vem da API key, e o `IngestController` rejeita divergência com o header `X-Market-ID`). A forma (a) é **segura só quando a checagem é chamada** — ver Z-1.
- **Services:** recebem `marketId` como parâmetro e propagam para os repositories. **Não há um "tenant context" central** (ex.: `ThreadLocal`/`TenantContext`); o `marketId` viaja manualmente por assinaturas de método.
- **Repositories:** as queries JPA filtram por `market.id`/`marketId` de forma consistente (validado em `SalesAnalyticsRepository`, `SupplierOrderRepository`, `PDVRepository`, etc.). O filtro existe — o problema é a **origem** do `marketId` (URL vs. usuário).
- **Jobs (`@Scheduled`):** rodam em perfil separado (`jobs`), iteram `marketRepository.findAllActive()` e processam **tenant a tenant sequencialmente** (`DailyAggregationJob`). Corretos quanto ao isolamento (cada iteração usa um `marketId`), mas **não paralelizados** e sem particionamento de carga — gargalo de escala.
- **Events:** não há uso de eventos de domínio/mensageria; o processamento é síncrono/agendado.

### 3.5 Frontend

**Implementado:**
- **Tenant ativo implícito:** o frontend não gerencia "troca de tenant" porque **cada usuário tem exatamente um `marketId`**, obtido de `/api/v1/auth/me` e guardado no `AuthContext`. Hooks como `useMarketData` leem `marketId` do contexto e o repassam nas chamadas.
- **Auth por cookie:** `axios` com `withCredentials: true`; o token nunca transita por `localStorage` (bom contra XSS-exfiltração).
- **Dois escopos isolados no cliente:** `AuthContext` (app) e `SuperAdminAuthContext` (painel), com header `X-Auth-Scope: super-admin` decidido por rota, e route guards distintos (`ProtectedRoute`, `SuperAdminProtectedRoute`).
- **Navegação por role:** `Sidebar` mostra/oculta itens conforme `role === 'ADMIN'`.

**Riscos / achados:**

| # | Severidade | Achado |
|---|---|---|
| F-1 | 🟡 MÉDIO | **Autorização de UI é cosmética.** O gating por role no frontend é só UX; toda a segurança real está no backend. Isso é correto em princípio, mas amplifica o impacto de qualquer falha de backend (Z-1). |
| F-2 | 🟢 BAIXO | **`marketId` confiado do cliente nas chamadas.** O frontend envia o `marketId` na URL; a confiança está inteiramente no backend validar. Aceitável se o backend for consistente (não é — Z-1). |
| F-3 | 🟢 BAIXO | **Botões de autofill de credenciais de teste** podem ser expostos em build com `VITE_SHOW_TEST_LOGINS=true`. Risco baixo, mas atenção ao pipeline. |

### 3.6 APIs e Integrações

- **Identificação do tenant:** por path (`{marketId}`) nas APIs web; por API key nas APIs de agente. **Contratos inconsistentes:** alguns controllers recebem corpos como `Map<String, Object>` sem DTO tipado (`SupplierOrderController`), o que enfraquece validação e documentação.
- **Proteção das APIs:** CORS restrito por origem (`CORS_ALLOWED_ORIGINS`), CSRF desabilitado (adequado para API stateless com cookie `SameSite`), rate limiting **apenas** nos endpoints de agente/ingestão (`RateLimitFilter`), HMAC nos writes de ingestão. **Não há rate limiting nas APIs web** (login, por exemplo, é passível de brute force).
- **Integrações externas:** BrasilAPI/ReceitaWS (lookup de CNPJ, via proxy no backend — bom para evitar CORS e esconder o cliente), crawler de catálogo web (InfoPrice/fontes de supermercado), Swagger exposto (`/swagger-ui/**` `permitAll`).

| # | Severidade | Achado |
|---|---|---|
| API-1 | 🟠 ALTO | **Sem rate limit em `/api/v1/auth/login`.** Brute force de credenciais é viável. |
| API-2 | 🟡 MÉDIO | **Swagger/OpenAPI público** (`permitAll`). Expõe a superfície de ataque completa a anônimos. Em produção deve ser restrito. |
| API-3 | 🟡 MÉDIO | **Contratos não tipados** em parte das APIs (`Map<String,Object>`), sem validação declarativa nem versionamento de schema. |

### 3.7 Escalabilidade

| Vetor | Situação | Comentário |
|---|---|---|
| Nº de tenants | ⚠️ Limitado | Modelo relacional escala, mas jobs iteram **todos** os mercados sequencialmente à noite; com milhares de tenants a janela de agregação estoura. |
| Nº de usuários | ⚠️ Limitado | Cada request refaz `loadUserByUsername` no banco (sem cache de sessão/claims no JWT). Sem cache distribuído (Redis). |
| Volume de dados | ⚠️ Limitado | Sem particionamento de `invoices`/`invoice_items`/`sales_analytics`; índices ajudam mas não substituem estratégia de retenção/partição. |
| Integrações | ⚠️ Limitado | Crawler e enriquecimento rodam no mesmo processo/perfil de jobs; sem fila (RabbitMQ/SQS) para desacoplar. |
| Estado da aplicação | ✅ OK | API stateless (JWT), rate limit em memória (⚠️ não compartilhado entre réplicas — quebra ao escalar horizontalmente). |

**Achado E-1 (🟡 MÉDIO):** o `RateLimitFilter` usa um `ConcurrentHashMap` em memória local. Ao escalar para múltiplas réplicas da API, o limite se multiplica por réplica e deixa de ser efetivo. Precisa de backend distribuído (Redis/bucket4j-redis).

### 3.8 Isolamento — matriz consolidada

| Recurso | Isolado por tenant? | Como | Observação |
|---|---|---|---|
| Banco (modelo) | ✅ Sim | Coluna `market_id` + FK | Sem RLS (D-1) |
| Consultas | ⚠️ Parcial | Filtro `market_id` nas queries | Origem do `marketId` não validada em Z-1 |
| APIs web | ⚠️ Parcial | `assertCanAccessMarket` manual | **Falha em SupplierOrder (Z-1)** |
| APIs agente | ✅ Sim | `marketId` da API key + HMAC | Ponto mais maduro |
| Autenticação | ✅ Sim | Escopos de cookie separados | Segredo fraco (A-1) |
| Autorização | ⚠️ Parcial | RBAC por rota + checagem manual | Não garantido por arquitetura |
| Arquivos / uploads | ✅ Sim | Diretórios por `marketId` (`assets/{marketId}`), path normalizado | Uploads protegidos por `assertCanAccessMarket` |
| Logs | ✅ Sim (design) | MDC com `marketId`/`userId` no logback | ⚠️ **MDC nunca é populado** (0 `MDC.put` no código) — campos ficam vazios |
| Auditoria | ✅ Sim | `audit_logs.market_id` + índice | Cobertura parcial (só ingestão e algumas ações) |
| Cache | ➖ N/A | Sem cache aplicacional | — |
| Filas | ➖ N/A | Sem mensageria | — |
| Notificações | ⚠️ Parcial | `alerts.market_id` | Sem canal externo (email/push) isolado |

**Achado L-1 (🟡 MÉDIO):** o `logback-spring.xml` declara campos MDC (`requestId`, `userId`, `marketId`, `agentKeyId`) mas **nenhum código chama `MDC.put`**. Os logs estruturados saem sem contexto de tenant — a rastreabilidade multi-tenant prometida não existe na prática.

---

## 4. Funcionalidades — Estado de Implementação

### 4.1 Implementadas (✅)
- Modelo de dados multi-tenant com discriminador `market_id` e FKs.
- Autenticação JWT por cookie HttpOnly, BCrypt, escopos separados app/super-admin.
- Autenticação de agente por API key (SHA-256) + HMAC com anti-replay.
- RBAC por rota via Spring Security.
- Bloqueio de tenant por status de billing/expiração (kill switch).
- Ingestão de NF-e com isolamento seguro por API key.
- Isolamento de uploads por diretório de tenant com normalização de path.
- Índices e constraints compostos por `market_id`.
- Painel Super Admin para gestão manual de tenants/planos/catálogo/crawler.
- Migrations versionadas (Flyway) com `validate`.

### 4.2 Parcialmente implementadas (⚠️)
- **Isolamento de tenant em runtime** — via checagem manual, com falha real (Z-1).
- **Auditoria** — entidade e serviço existem, mas cobertura de ações é parcial.
- **Rastreabilidade por logs** — infraestrutura MDC pronta, mas não alimentada (L-1).
- **Rate limiting** — só agente; ausente na web; não distribuído (E-1).
- **Contratos de API** — parte tipada, parte `Map<String,Object>`.

### 4.3 Pendentes (❌)
- Defesa em profundidade no banco (RLS PostgreSQL ou multitenancy do Hibernate).
- Contexto de tenant centralizado (interceptor/`TenantContext` + filtro automático).
- Revogação de token / gestão de sessão server-side.
- Testes automatizados (**0 arquivos de teste** no backend, apesar de `spring-boot-starter-test` no `pom.xml`).
- Gestão segura de segredos (vault/variáveis, remoção do Git).
- Cache distribuído e fila de mensageria.
- Particionamento/retenção de dados.
- Rate limit na autenticação web.
- Multi-tenant de usuário (um usuário em vários tenants) — não suportado (pode ser intencional).

---

## 5. Riscos para Produção (priorizados)

| Prioridade | Risco | Impacto | Achados |
|---|---|---|---|
| 🔴 P0 | **Vazamento de dados entre tenants** (pedidos a fornecedores acessíveis cross-tenant) | Quebra do contrato fundamental de SaaS; exposição de dados comerciais entre concorrentes | Z-1 |
| 🔴 P0 | **Segredos e credenciais versionados** (JWT secret + senhas admin/super-admin no Git) | Comprometimento total: forja de tokens, acesso administrativo | A-1, A-2 |
| 🟠 P1 | **Isolamento não garantido por arquitetura** (opt-in manual) | Novos endpoints nascem inseguros por padrão; Z-1 se repetirá | Z-2, D-1 |
| 🟠 P1 | **Ausência total de testes** | Nenhuma rede de segurança; regressões silenciosas de isolamento | 4.3 |
| 🟠 P1 | **Brute force de login** (sem rate limit web) | Tomada de conta | API-1 |
| 🟡 P2 | Sessão sem revogação; JWT sem claims de tenant | Logout não invalida token; custo por request | A-3, A-4 |
| 🟡 P2 | Escala de jobs sequenciais e rate limit local | Degradação com crescimento de tenants/réplicas | E-1, 3.7 |
| 🟡 P2 | Rastreabilidade multi-tenant ausente nos logs | Investigação de incidentes prejudicada | L-1 |
| 🟡 P2 | Swagger público; contratos não tipados | Superfície de ataque exposta | API-2, API-3 |
| 🟢 P3 | `market_id` nullable; catálogo global sem barreira | Órfãos; contaminação de catálogo | D-2, D-3 |

---

## 6. Oportunidades de Melhoria

1. **Tornar o isolamento estrutural, não opt-in:** interceptor global que resolve o tenant do usuário autenticado e o injeta num `TenantContext`; validação automática de que o `marketId` da rota == tenant do contexto; RLS no PostgreSQL como rede de segurança final.
2. **Externalizar segredos:** remover do Git, rotacionar JWT secret e senhas, usar variáveis de ambiente/secret manager, e purgar o histórico.
3. **Cobertura de testes de isolamento:** suíte que, para cada endpoint com `{marketId}`, verifica 403 ao acessar tenant alheio (teste de contrato multi-tenant).
4. **Observabilidade:** popular o MDC por request (filtro que seta `userId`/`marketId`), expandir auditoria para todas as ações de escrita.
5. **Escala:** paralelizar jobs por tenant, mover rate limit para Redis, avaliar particionamento de tabelas de fato.
6. **Endurecer autenticação:** claims de tenant/role no JWT, `jti` + blacklist para revogação, rate limit no login, migração da API do jjwt.

---

## 7. Respostas Diretas às Perguntas da Missão

- **A plataforma já pode ser considerada um SaaS multi-tenant?** *Parcialmente.* O conceito de tenant está modelado e a maior parte do sistema o respeita, mas **existe vazamento real entre tenants (Z-1)** e o isolamento não é garantido pela arquitetura. Como SaaS **funcional em piloto/beta controlado**, sim; como **SaaS pronto para produção com múltiplos clientes reais**, **não**.
- **Quais requisitos já estão implementados?** Modelo de dados por tenant, autenticação (app + agente + super-admin), RBAC por rota, isolamento de ingestão e uploads, kill switch por billing, migrations. (Detalhe em 4.1.)
- **Quais requisitos ainda estão pendentes?** Isolamento garantido por arquitetura (RLS/interceptor), gestão de segredos, testes, revogação de sessão, rate limit web, observabilidade por tenant, escala de jobs/cache. (Detalhe em 4.3.)
- **Quais riscos existem para produção?** Ver Seção 5 — dois riscos **P0** (vazamento entre tenants e segredos versionados) que, isoladamente, **bloqueiam** o go-live.

**Conclusão:** Maturidade **nível 2/5**. Há uma base sólida (modelo, ingestão, escopos de auth), mas o isolamento entre tenants — o requisito nº 1 de um SaaS multi-tenant — não é confiável no estado atual. Ver `PLANO_MULTI_TENANT.md` para o roadmap de evolução.
