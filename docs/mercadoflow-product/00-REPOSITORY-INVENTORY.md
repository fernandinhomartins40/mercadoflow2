# 00 — Inventário verificável do repositório

Data: 2026-09-26 · Commit base: `26487de` (branch `main`) · Fase: Prompt 0

Legenda de status: `CONFIRMADO` (lido no código/execução), `INFERIDO` (dedução a partir de evidência
indireta), `NÃO VERIFICADO` (não foi possível confirmar nesta fase), `DECISÃO NECESSÁRIA`.

Método: leitura estática do repositório com `grep`/`find`, contagem por arquivo e leitura de
configurações. Nenhum serviço foi executado, nenhum dado lido, nenhuma dependência instalada.
Nada de UI foi observado em navegador — toda afirmação de interface aqui é **inspeção de código**.

---

## 1. Estado do git na abertura

| Item | Evidência | Status |
|---|---|---|
| Branch `main`, sincronizada com `origin/main` | `git status -sb` | CONFIRMADO |
| 21 arquivos de frontend modificados e não commitados (componentes `common/`, `ui/`, telas `Landing`, `Promocoes`, `ShoppingList`, `StoreMap`, `SuperAdmin*`, `SupplierOrders`, `tailwind.css`) + `hooks/useModalBehavior.ts` novo | `git status --short` | CONFIRMADO — trabalho do usuário, **preservado e não tocado** |
| Documentos não versionados: `Otimização_UX_e_UI.html`, `Otmizacao_VPS.md`, 11 auditorias VPS em `docs/`, este protocolo | `git status --short` | CONFIRMADO |

## 2. Correção do contexto informado no protocolo

O protocolo cita "Next.js 15, Prisma, PostgreSQL, monorepo pnpm e Docker". O repositório **nega** a maior parte:

| Afirmação do protocolo | Realidade no repositório | Evidência | Status |
|---|---|---|---|
| Next.js 15 | React 18 + Vite 7 SPA + React Router 6 | `frontend/package.json`, `frontend/vite.config.ts` | CONFIRMADO (negado) |
| Prisma | Spring Data JPA/Hibernate + Flyway | `backend/pom.xml` | CONFIRMADO (negado) |
| PostgreSQL | PostgreSQL 16 (alpine) | `docker-compose.vps.yml` | CONFIRMADO |
| monorepo pnpm | Repositório único com projetos independentes; npm (`package-lock.json`) e Maven | raiz, `frontend/`, `pdv2cloud-config/` | CONFIRMADO (negado) |
| Docker | Docker Compose na VPS; imagens construídas no GitHub Actions e publicadas no GHCR | `.github/workflows/deploy-pdv2cloud-web.yml`, `docs/VPS-IMPLEMENTATION-PLAN.md` | CONFIRMADO |
| "Ainda não em produção" | Há deploy ativo em `mercadoflow.com`, porém **sem clientes reais**; mercados, notas e usuários são de teste. Catálogo e imagens são dados reais | memória do projeto + verificação HTTPS de 2026-09-26 | CONFIRMADO |
| Monólito modular | Um backend Spring Boot único com pacotes por camada (não por módulo de domínio), mais cron no mesmo artefato e coletores Python | `backend/src/main/java/com/pdv2cloud/*` | CONFIRMADO: monólito; "modular" é INFERIDO parcial |

## 3. Aplicações e runtimes

| ITEM | TIPO | CAMINHO | RESPONSABILIDADE | DEPENDÊNCIAS | EVIDÊNCIA | STATUS |
|---|---|---|---|---|---|---|
| Backend API | Java 17, Spring Boot 4.1.1, Tomcat 11 | `backend/` | API REST, regras, jobs (perfil `jobs`), render de ofertas (FFmpeg) | PostgreSQL, FFmpeg, Stripe (opcional), provedores de IA (BYOK) | `backend/pom.xml`, `Dockerfile` | CONFIRMADO |
| Cron | mesmo JAR, perfil `production,jobs`, sem HTTP | `docker-compose.vps.yml` (`mercadoflow-cron`) | 15 jobs agendados | PostgreSQL (role dona do schema) | `application-jobs.yml` | CONFIRMADO |
| Frontend web | React 18 + Vite 7 + Tailwind 4, SPA | `frontend/` | Painel do mercado, super admin, estúdio de ofertas, landing | API `/api` | `frontend/package.json`, `App.tsx` | CONFIRMADO |
| Agente PDV | Python 3.11, serviço Windows + instalador Inno Setup | `pdv2cloud-agent/` | Lê NFC-e/XML no PDV do mercado, enfileira e envia para `/api/v1/ingest` | HMAC/API key, fila local | `service/*.py`, `SecurityConfig` (`/api/v1/ingest/** → AGENT`) | CONFIRMADO (estrutura); comportamento em campo NÃO VERIFICADO |
| Configurador desktop | Electron 29 + React | `pdv2cloud-config/` | Interface de configuração do agente | agente | `pdv2cloud-config/package.json` | CONFIRMADO (existe); uso real NÃO VERIFICADO |
| Coletores | Python em imagem própria | `scripts/catalog/`, `scripts/state_prices/`, `deploy/collectors/` | Crawler de catálogo em sites de varejo, enriquecimento por código de barras, preços estaduais | backend (login super admin), `data/catalog` | `docker-compose.vps.yml` | CONFIRMADO; `state-price-sync` só roda com profile explícito (desligado) |
| Proxy da stack | nginx:alpine | `deploy/nginx.vps.conf` | `/api`, `/health`, `/` | backend, frontend | arquivo | CONFIRMADO |
| Nginx do host | gerado por `deploy/deploy-web.sh` | `/etc/nginx/sites-available/mercadoflow.conf` na VPS | TLS e proxy para `:3300` | certbot | script | CONFIRMADO no script; estado da VPS NÃO VERIFICADO nesta fase |

## 4. Build, CI/CD e execução local

| ITEM | TIPO | CAMINHO | EVIDÊNCIA | STATUS |
|---|---|---|---|---|
| Deploy web | GitHub Actions: `validate-migrations` → build backend/frontend/coletores (GHCR, cache GHA) → deploy SSH + Compose por digest | `.github/workflows/deploy-pdv2cloud-web.yml` | run `36267885595` verde | CONFIRMADO |
| Build do instalador | Workflow desabilitado por inatividade; runner Windows não alcança a porta 22 da VPS | `.github/workflows/build-and-upload-installer.yml` | memória do projeto | CONFIRMADO |
| Scripts locais PowerShell | build/deploy/backup/restore/healthcheck | `scripts/*.ps1` | listagem | CONFIRMADO (existência); uso atual NÃO VERIFICADO |
| Execução local API | `mvn spring-boot:run -Dspring-boot.run.profiles=dev` | `README.md` | README | INFERIDO (não executado) |
| Execução local web | `npm install && npm run dev` (porta 3000) | `README.md`, `vite.config.ts` | README | INFERIDO (não executado) |
| Compose local | `docker-compose.yml` na raiz | raiz | existência | NÃO VERIFICADO |
| Variáveis de ambiente | `.env.example` na raiz; valores **não lidos** | raiz | existência | CONFIRMADO (sem imprimir segredos) |
| Lint / typecheck | **Não há script** de lint nem `tsc --noEmit` no `frontend/package.json`; nenhum ESLint configurado | `frontend/package.json` | CONFIRMADO (lacuna) |

## 5. Rotas do frontend (`frontend/src/App.tsx`)

**Total: 58 declarações de rota** = 29 que sempre renderizam tela + 13 condicionadas a flags hoje desligadas + 16 redirects legados.

| Grupo | Rotas que renderizam tela | Proteção | Status |
|---|---|---|---|
| Públicas | `/` (Landing), `/login`, `/register`, `/super-admin/login`, `/download-agente`, `/parear-agente` | nenhuma | CONFIRMADO |
| App do mercado (`secure`) | `/app` (Painel do dia), `/app/inteligencia`, `/app/perguntar`, `/app/rede`, `/app/clientes`, `/app/produtos`, `/app/produtos/:productId`, `/app/lista-compras` (Pedido inteligente), `/app/mapa-loja`, `/app/pdvs`, `/app/promocoes`, `/app/configuracoes`, `/app/planos`, `/app/download-agente`, `/app/admin/catalogo` | `secure()` | CONFIRMADO |
| Super admin (`secureSuperAdmin`) | `/super-admin`, `/super-admin/saas`, `/assinaturas`, `/clientes`, `/cobranca`, `/catalogo`, `/crawler`, `/crawler/runs/:runId` | `secureSuperAdmin()` | CONFIRMADO |
| Atrás de flag **desligada** | `/app/admin/precos-estaduais`, `/super-admin/precos-estaduais` (`FEATURE_STATE_PRICES_ENABLED=false`); `/ofertas`, `/ofertas/campanhas`, `/ofertas/jobs`, `/app/ofertas/*`, `/super-admin/ofertas` (`FEATURE_OFFER_TEMPLATES_ENABLED=false`) | redireciona | CONFIRMADO — `frontend/src/config/features.ts` |
| Redirects legados | `/app/cesta`, `/app/alertas`, `/app/pedidos`, `/app/campanhas`, `/app/previsao-demanda`, `/super-admin/usuarios`, `/produtos`, `/cesta`, `/alertas`, `/lista-compras`, `/pdvs`, `/campanhas`, `/previsao-demanda`, `/configuracoes`, `/baixar-agente`, `*` | — | CONFIRMADO. Indicam funcionalidades **fundidas** (alertas → painel, cesta/previsão → catálogo, campanhas → promoções) |

### Navegação (menus)

| Menu | Itens | Evidência | Status |
|---|---|---|---|
| Sidebar do mercado | Painel do dia · Central de Inteligência · Pergunte aos dados · Semana e rede · Clientes · Catálogo · Pedido inteligente · Promoções · Mapa da loja · Catálogo global · Preços estaduais · PDVs e agente · Plano e consumo · Conta (14) | `components/layout/*.tsx` | CONFIRMADO |
| Super admin | Visão geral · Contas e usuários · Clientes · Assinaturas · Cobrança · Catálogo global · Preços estaduais · Templates de ofertas · Crawler (9) | idem | CONFIRMADO |
| Estúdio de ofertas | Templates · Criar encarte · Meus encartes · Arquivos prontos | idem | CONFIRMADO (inacessível pela flag) |

**Observação:** "Preços estaduais" aparece no menu, mas a rota está desligada por flag. Se o item é filtrado pela flag no menu: NÃO VERIFICADO.

### Telas (36 arquivos em `frontend/src/screens/`)

| Situação | Telas | Status |
|---|---|---|
| Importadas no roteador | 31 (algumas só atrás de flag desligada) | CONFIRMADO |
| **Sem nenhuma importação (órfãs)** | `OfferJobs`, `OfferTemplates`, `OffersCampaigns`, `OffersDashboard`, `SupplierOrders` | CONFIRMADO por busca de import. `SupplierOrders` duplica o que já existe dentro de `ShoppingList` (Pedido inteligente), que usa `SupplierOrder` e `addSupplierOrderItem` |

## 6. API do backend (33 controllers, 253 endpoints)

Proteção em três camadas, **todas confirmadas estaticamente**:
1. regra por rota em `config/SecurityConfig.java` (linhas 60–87): `/api/v1/markets/** → MARKET_OWNER|MARKET_MANAGER|ADMIN|SUPER_ADMIN`, `/super-admin/** → SUPER_ADMIN`, `/agent/**` e `/ingest/** → AGENT`, `anyRequest().authenticated()`;
2. `@PreAuthorize` por controller e/ou `MarketAccessService.assertCanAccessMarket` por endpoint;
3. `security/TenantAccessFilter` + `tenancy/TenantContext` + RLS no PostgreSQL (ver `docs/SEGURANCA_MULTI_TENANT.md`).

| Controller | Base | Endpoints | Guarda de papel/tenant | Status |
|---|---|---|---|---|
| AuthController | `/api/v1/auth` | 4 | login/register públicos | CONFIRMADO |
| SuperAdminAuthController | `/api/v1/super-admin/auth` | 3 | SUPER_ADMIN (login público) | CONFIRMADO |
| HealthController | `/health`, `/api/v1/health` | 2 | público | CONFIRMADO |
| PublicPlanController | `/api/v1/plans` | 1 | GET público | CONFIRMADO |
| DownloadController | `/api/v1/downloads` | 4 | público | CONFIRMADO |
| CatalogImageController | `/api/v1/catalog/images` | 1 | público, cache 12 h | CONFIRMADO |
| StripeWebhookController | `/api/v1/stripe` | 1 | POST público (assinatura Stripe) | CONFIRMADO; verificação de assinatura NÃO VERIFICADA nesta fase |
| AgentController | `/api/v1/agent` | 4 | AGENT | CONFIRMADO |
| IngestController | `/api/v1/ingest` | 2 | AGENT + `HmacSignatureFilter` | CONFIRMADO |
| AgentPairingController | `/api/v1/agent-pairing` | 5 | start/cancel/session públicos; resto OWNER/MANAGER/ADMIN | CONFIRMADO |
| AgentApiKeyController | `/api/v1/agent-keys` | 3 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| MarketController | `/api/v1/markets` | 31 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| IntelligenceCenterController | `…/intelligence` | 11 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| OpportunityController | `…/opportunities` | 9 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| WeeklyDigestController | `…/intelligence/weekly` | 2 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| PriceSimulationController | `…/intelligence/price-simulation` | 1 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| WorkingCapitalController | `/api/v1/markets/{marketId}` | 7 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| NetworkIntelligenceController | `…/network` | 5 | OWNER/ADMIN | CONFIRMADO |
| DataChatController | `…/ai/chat` | 2 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| AiSettingsController | `…/ai` | 7 | OWNER/ADMIN | CONFIRMADO |
| BillingController | `…/billing` | 3 | OWNER/ADMIN | CONFIRMADO |
| CampaignController | `…/campaigns` | 2 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| DataExportController | `…/export` | 4 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| PDVController | `…/pdvs` | 2 | OWNER/MANAGER/ADMIN | CONFIRMADO |
| SupplierController | `…/suppliers` | 4 | `isAuthenticated()` + assert de mercado | CONFIRMADO (estático) |
| SupplierOrderController | `…/supplier-orders` | 11 | assert de mercado em cada endpoint; teste de isolamento existe | CONFIRMADO |
| OfferDesignerController | `…/offers` e `/super-admin/markets/{id}/offers` | 32 | assert de mercado em 32/32 endpoints | CONFIRMADO; UI desligada por flag |
| IndustryController | `/api/v1/industries` | 1 | INDUSTRY_USER/ADMIN | CONFIRMADO; **nenhuma tela** para esse papel (só citado em `SuperAdminUsers.tsx`) |
| StatePriceController | `/api/v1/state-prices` | 6 | ADMIN/SUPER_ADMIN | CONFIRMADO; UI desligada |
| AdminController | `/api/v1/admin` | 6 | ADMIN/SUPER_ADMIN | CONFIRMADO |
| SuperAdminController | `/api/v1/super-admin` | 34 | SUPER_ADMIN | CONFIRMADO |
| SubscriptionAdminController | `/api/v1/super-admin/subscriptions` | 26 | SUPER_ADMIN | CONFIRMADO |
| CrmController | `/api/v1/super-admin/crm` | 17 | SUPER_ADMIN | CONFIRMADO |

Documentação OpenAPI: Swagger UI público em `/swagger-ui/**` e `/v3/api-docs/**` (`SecurityConfig:63`). Exposição em produção: NÃO VERIFICADO → risco a avaliar no Prompt 4.

## 7. Papéis e autorização

| Papel | Onde aparece | Status |
|---|---|---|
| SUPER_ADMIN | operador da plataforma (SaaS, cobrança, catálogo global, crawler) | CONFIRMADO |
| ADMIN | acesso administrativo a mercados | CONFIRMADO |
| MARKET_OWNER | dono do mercado: billing, IA, rede | CONFIRMADO |
| MARKET_MANAGER | gerente: inteligência, pedidos, promoções; sem billing/IA/rede | CONFIRMADO |
| INDUSTRY_USER | fabricante/indústria: 1 endpoint, sem UI | CONFIRMADO; "divisão para fabricantes" planejada, não implementada (memória do projeto) |
| AGENT | credencial de máquina do agente PDV | CONFIRMADO |

## 8. Dados: schema, migrations e entidades

| Item | Valor | Evidência | Status |
|---|---|---|---|
| Migrations Flyway | 53 (`V1` … `V53__index_product_enrichments_fetched_at.sql`) | `backend/src/main/resources/db/migration` | CONFIRMADO |
| Entidades JPA (`@Entity`) | 65 | `grep @Entity` | CONFIRMADO |
| Repositórios | 66 | `repository/` | CONFIRMADO |
| Multi-tenancy | tenant = `Market`; `TenantContext` + `TenantAwareDataSource` + RLS; jobs usam role dona do schema | `tenancy/`, `docker-compose.vps.yml`, `docs/SEGURANCA_MULTI_TENANT.md` | CONFIRMADO |

Entidades agrupadas por domínio (INFERIDO pelo nome e pacote):

| Domínio | Entidades |
|---|---|
| Conta e acesso | User, UserRole, Market, AuditLog |
| Ingestão de vendas | PDV, AgentApiKey, AgentPairingSession, Invoice, InvoiceItem, InvoiceRejection, MarketProductAlias |
| Produto e catálogo | Product, ProductEnrichment, ProductDataSource, ProductIdentityType, CatalogCrawlerConfig/Source/Run/Checkpoint |
| Análise de vendas | SalesAnalytics, MarketBasketRule, DemandForecast, ProductSeasonality, ProductHaloEffect, ProductInventoryEstimate, ProductCapitalMetric |
| Preço | ProductObservation, ProductPriceDailyStat, ProductPriceEvent, PriceEventDirection, PriceIntelligenceCheckpoint, PurchasePriceHistory, StatePriceObservation, StatePriceSource |
| Decisão | Alert, AlertType, AlertPriority, Opportunity, Recommendation, RecommendationOutcome, WeeklyDigest, AiInterpretation |
| Compra | Supplier, SupplierOrder, SupplierOrderItem, ShoppingListItem |
| Promoção e ofertas | Campaign, CampaignProduct, ProductPromotionWindow, PromotionWindowStatus, OfferTemplate, OfferTemplateVariant, OfferBrandKit, OfferCampaignKit, OfferMarketProfile, OfferGenerationJob, OfferGenerationJobItem, OfferRenderOutput |
| Loja física | StoreLayout |
| Rede de mercados | NetworkContract, NetworkInvoice |
| IA (BYOK) | AiProviderCredential, AiUsageLog |
| Monetização | PlanType, PlanCatalogEntry, PlanPriceHistory, MarketBillingStatus, MarketUsageCounter, SubscriptionEvent, StripeProcessedEvent, DunningRule, DunningLog |
| CRM interno | CustomerActivity, CustomerTask |

## 9. Jobs, workers e processos permanentes

| Job | Agenda | Evidência | Status |
|---|---|---|---|
| AdaptiveRefreshJob | a cada 5 min; decide por loja se recalcula | `job/AdaptiveRefreshJob.java` | CONFIRMADO |
| PriceIntelligenceJob | a cada 15 min, incremental por checkpoint | `job/PriceIntelligenceJob.java` | CONFIRMADO |
| AlertGenerationJob | a cada 1 h, 8 verificações por mercado | `job/AlertGenerationJob.java` | CONFIRMADO |
| AgentPairingExpirationJob | a cada 1 h | idem | CONFIRMADO |
| DailyAggregationJob | 02:00 | idem | CONFIRMADO |
| MarketBasketAnalysisJob | 02:30 | idem | CONFIRMADO |
| ProductIntelligenceJob | 03:00 | idem | CONFIRMADO |
| OpportunityDetectionJob | 03:30 | idem | CONFIRMADO |
| MLPredictionJob | 04:00 | idem | CONFIRMADO |
| OutcomeEvaluationJob | segunda 04:00 | idem | CONFIRMADO |
| WeeklyDigestJob | segunda 05:00 | idem | CONFIRMADO |
| DunningJob | 09:00 | idem | CONFIRMADO |
| ProductCatalogMaintenanceJob, CatalogImageRepairJob, WebCatalogImportJob | configuráveis por ENV | idem | CONFIRMADO |
| Coletores Python | catalog-harvester (6 h), barcode-enricher (12 h), state-price-sync (profile desligado) | `docker-compose.vps.yml` | CONFIRMADO |
| `@Async` | somente AuditService | `service/AuditService.java` | CONFIRMADO |

Filas, Redis, MinIO/S3, WebSocket: **não existem** nesta aplicação (arquivos de persistência em bind mount `data/catalog` e `data/offers`). CONFIRMADO por busca.

## 10. Integrações externas

| Integração | Uso | Evidência | Status |
|---|---|---|---|
| Stripe | assinatura e webhook; desligado por padrão (`STRIPE_ENABLED=false`) | `application.yml`, `StripeService` | CONFIRMADO |
| IA BYOK | Cerebras, Groq, OpenAI, Gemini, entre outros; chave por mercado cifrada com AES-GCM | `enum AiProvider`, `AiSettingsController` | CONFIRMADO |
| Crawler de varejo | cerca de 30 sites de supermercados/farmácias (Pão de Açúcar, Atacadão, Carrefour/VTEX etc.) para catálogo e imagens | `scripts/catalog/*`, contagem de hosts | CONFIRMADO. **Base legal/termos de uso: DECISÃO NECESSÁRIA** |
| Web catalog import | Open Food/Beauty/Products Facts (desligado por padrão) | `application.yml` | CONFIRMADO |
| Portais de preços estaduais | coletor desligado | compose profile | CONFIRMADO |
| SEFAZ/NFC-e | XML lido no PDV pelo agente; não há chamada direta à SEFAZ | `pdv2cloud-agent/service/parser.py`, `download_xsd` | INFERIDO |

## 11. Interface, design e assets

| Item | Quantidade/valor | Evidência | Status |
|---|---|---|---|
| Arquivos `.tsx` | 103 (≈38,6 mil linhas em `.ts`/`.tsx`) | `find` | CONFIRMADO |
| Componentes | `common` 13, `ui` 8, `layout` 8, `dashboard` 5, `admin` 4, `product` 4, demais 1–2 cada; `features/offers-studio` 15 | `ls` | CONFIRMADO |
| Formulários (`<form`) | 6 arquivos | grep | CONFIRMADO (muitos formulários podem não usar `<form>`: NÃO VERIFICADO) |
| Modais (`<Modal`/`role="dialog"`) | 5 arquivos | grep | CONFIRMADO |
| Tabelas (`<table`/`<Table`) | 19 arquivos | grep | CONFIRMADO |
| Drawers/Sheets | 11 arquivos | grep | CONFIRMADO |
| Tokens | `@theme` Tailwind 4 em `tailwind.css`: escala `brand` verde (`#22c55e`/`#16a34a`), cerca de 40 variáveis CSS | `frontend/src/tailwind.css` | CONFIRMADO |
| Tipografia | Inter (400–800) + JetBrains Mono via Google Fonts | `index.html` | CONFIRMADO |
| Ícones | lucide-react | `package.json` | CONFIRMADO |
| Logos | `public/logomercadoflow-color.png`, `-branco.png` | `frontend/public` | CONFIRMADO |
| Dois design systems paralelos | `components/common/*` e `components/ui/*` (ex.: `EmptyState` × `Empty`) | `ls` | INFERIDO (duplicação a auditar no Prompt 3) |
| Auditoria de viewport | `qa/viewport/` | existência | NÃO VERIFICADO (conteúdo) |

## 12. Testes

| Suite | Quantidade | Evidência | Status |
|---|---|---|---|
| Backend JUnit | 21 classes: isolamento de tenant (2), IA (5), inteligência/métricas (8), planos/quota (2), entidades/mapeamento (2), demais (2) | `backend/src/test` | CONFIRMADO (existência); resultado atual NÃO VERIFICADO (não executado) |
| Frontend | **0 testes**; sem lint e sem typecheck no script | `find *.test.* *.spec.*` | CONFIRMADO (lacuna) |
| E2E | nenhum | — | CONFIRMADO (lacuna) |
| Agente | `test_service_startup.py` | `pdv2cloud-agent/service` | CONFIRMADO (existência) |
| CI | só `validate-migrations` antes do build; testes não rodam no pipeline | workflow | INFERIDO — conferir no Prompt 4 |

## 13. Documentação de produto já existente

`README.md` (ainda com nome "PDV2Cloud"), `PLANO_V2.md`, `PLANO_EVOLUCAO_INTELIGENCIA_MERCADOFLOW.md`, `AUDITORIA_INTELIGENCIA_MERCADOFLOW.md`, `PLANO_MULTI_TENANT.md`, `AUDITORIA_MULTI_TENANT.md`, `IMPLEMENTATION-REPORT.md`, `docs/architecture.md`, `docs/api.md`, `docs/user-manual.md`, `docs/public-product-catalog.md` e as auditorias VPS. Serão insumo do Prompt 1. Nenhum foi tratado como fato sem conferir no código.

## 14. Cobertura alcançada

| Categoria | Inventariado | Verificação |
|---|---|---|
| Aplicações | 7/7 (backend, cron, frontend, agente, configurador, coletores, proxies) | estrutura confirmada; execução não |
| Rotas frontend | 58/58 declarações | 100% estático |
| Telas | 36/36 | 100% por import; 0% visual |
| Itens de menu | 23 + 4 do estúdio | estático |
| Controllers / endpoints | 33/33 · 253/253 (`@Get/Post/Put/Patch/DeleteMapping`) | guarda confirmada por controller; por endpoint apenas em Offer/SupplierOrder |
| Entidades | 65/65 listadas | agrupamento por domínio INFERIDO |
| Migrations | 53/53 contadas | conteúdo não lido |
| Jobs | 15/15 + 3 coletores | agenda confirmada; duração não medida |
| Integrações | 6 grupos | estático |
| Formulários/modais/tabelas | contados por padrão de código | pode subcontar |
| Testes | 21 backend, 0 frontend | não executados |
| Fluxos ponta a ponta | 0 executados | **lacuna**: nenhum fluxo observado rodando |

## 15. Lacunas conhecidas

1. Nenhum fluxo foi executado; UI e responsividade ainda sem evidência visual.
2. Suíte do backend não executada nesta fase (resultado atual desconhecido).
3. Não se sabe se "Preços estaduais" some do menu quando a flag está desligada.
4. Conteúdo das 53 migrations e das RLS policies não relido nesta fase (auditado antes em `docs/SEGURANCA_MULTI_TENANT.md`).
5. Comportamento do agente em PDV real e do configurador Electron não verificado.
6. Uso real de funcionalidades é impossível de medir: não há clientes nem telemetria de produto.
