# 06 — Arquitetura técnica

Data: 2026-09-26 · Fase: Prompt 4 · Base: inventário (00), tese aprovada (D-024…D-027), auditorias VPS em `docs/`

Legenda: `CONFIRMADO` · `INFERIDO` · `DESCONHECIDO` · `DECISÃO NECESSÁRIA`.

## 1. O que o protocolo presumia × o que existe

| Presumido | Realidade | Status |
|---|---|---|
| Next.js 15 | React 18 + Vite 7 SPA, 31 rotas carregadas sob demanda (`lazy`) | CONFIRMADO (negado) |
| Prisma | Spring Data JPA/Hibernate + JdbcTemplate + Flyway (53 migrations) | CONFIRMADO (negado) |
| PostgreSQL | PostgreSQL 16 com RLS por mercado | CONFIRMADO |
| pnpm monorepo | Maven (backend) + npm (frontend, configurador Electron) em um repositório | CONFIRMADO (negado) |
| Docker | Compose na VPS; imagens construídas no GitHub Actions, publicadas no GHCR e aplicadas por digest | CONFIRMADO |
| Monólito modular | **monólito em camadas** (controller/service/repository/model), não em módulos de domínio; um JAR serve a API e os jobs (perfil `jobs`) | CONFIRMADO |

## 2. Limites atuais e dependências

```text
frontend (SPA) ──/api──► backend (Spring, perfil production)
                            ├─ controllers (33) ─► services (95) ─► repositories (66) ─► PostgreSQL (RLS)
                            ├─ filtros: JWT · API key do agente · HMAC · TenantAccess · RateLimit
                            └─ render de ofertas (FFmpeg)          (ofertas desligadas no frontend)
cron (mesmo JAR, perfil production,jobs, sem HTTP) ─► 15 jobs ─► PostgreSQL (role dona do schema, sem RLS)
coletores Python ──login super admin──► API (catálogo, código de barras)
agente Python (PDV) ──HMAC──► /ingest
```

| Ponto | Evidência | Leitura |
|---|---|---|
| Serviços muito grandes | `OfferDesignerService` 2.004 linhas, `SuperAdminService` 1.635, `AdvancedAnalyticsService` 1.611, `OfferRenderEngineService` 1.039 | concentram regras de vários domínios; custo de mudança alto |
| Controllers com lógica | `MarketController` 455 linhas / 31 endpoints; gating de plano historicamente dentro do controller (`PLANO_EVOLUCAO` §régua) | regra de negócio misturada à borda HTTP |
| Domínio "compra" espalhado | `WorkingCapitalService` (estoque teórico), `PurchasePlanService`, `ShoppingListService`, `SupplierOrderService`, `CapitalOpportunityDetector` | a tese A exige um núcleo "reposição pelo vendido" coeso |
| Dois conceitos de atenção | `AlertService`/`AlertGenerationJob` × `OpportunityEngine` | D-021 manda fundir |
| Cálculo na leitura | `analytics/cockpit` 2,6 s, `products/performance` 2,3 s, `promo-intelligence/recommendations` 4,8 s sobre 34 mil itens (04 §4) | não escala com o histórico real |

## 3. Dados, transações, idempotência e concorrência

| Tema | Achado | Evidência | Status |
|---|---|---|---|
| Idempotência da ingestão | nota duplicada por `(chave, mercado)` é ignorada | `existsByChaveNFeAndMarket_Id` | CONFIRMADO |
| Transação por nota | `InvoiceProcessingService` `@Transactional` na classe; sete pontos `REQUIRES_NEW` (uso, auditoria, rejeição, IA, CRM) | grep | CONFIRMADO |
| **Auto-bloqueio com `REQUIRES_NEW`** | `markFirstIngest` travava a 1ª nota (corrigido, D-028); o padrão "transação interna altera linha já tocada pela externa" é um risco nos outros `REQUIRES_NEW` | teste com RLS | 1 CORRIGIDO; demais NÃO VERIFICADOS |
| RLS | policies por `market_id`; jobs usam role sem RLS; login e cadastro em `runAsSystem` | V42/V43, D-028 | CONFIRMADO |
| **Contexto de sistema ausente** | escrita fora de tenant quebra sob RLS (login quebrou em produção de 10/08 a 26/09; `DevSeeder` quebra) | produção + local | risco recorrente: não há teste com RLS |
| Estoque teórico | `product_inventory_estimates` = compras − vendas; sem compras, gera "comprar" para 100% dos produtos | 04 §4.1 | conflita com D-019/D-025/D-026 |
| Agregado diário | `sales_analytics` só recebe "ontem" (job 02:00); carga histórica não aparece no gráfico semanal | `DailyAggregationJob` | lacuna de ativação |
| Detecção sob demanda | `/opportunities/detect` > 60 s (145 produtos) → 504 no proxy | medido | precisa ser assíncrona ou incremental |
| Ingestão | ≈0,4 s por nota (local); recalcula inteligência de preço por nota | medido | carga histórica de um ano levaria horas |

## 4. Autenticação, autorização e isolamento

| Camada | Estado | Status |
|---|---|---|
| Sessão | JWT em cookie `HttpOnly` (`Lax` em HTTP, configurável em HTTPS) + `Authorization`; nada em `localStorage` | CONFIRMADO, bom |
| Papéis | SUPER_ADMIN, ADMIN, MARKET_OWNER, MARKET_MANAGER, INDUSTRY_USER, AGENT (inventário §7) | CONFIRMADO |
| Por rota | `SecurityConfig` 60–87 | CONFIRMADO |
| Por mercado | `assertCanAccessMarket` + `TenantAccessFilter` + RLS; acesso a outro mercado → 403 (testado) | CONFIRMADO |
| Comprador × dono (D-016) | MARKET_MANAGER existe e já é mais restrito que o dono | CONFIRMADO; aderente à tese |

## 5. Integrações, webhooks, uploads, filas e crons

| Item | Estado |
|---|---|
| Stripe | webhook com `Webhook.constructEvent` (assinatura verificada); desligado por padrão |
| IA BYOK | chave cifrada (AES-GCM); **provedor `CUSTOM` aceita qualquer URL sem validação** (ver 07, SEC-01) |
| Uploads | imagem de oferta decodificada e regravada como PNG (neutraliza payload) |
| Filas | não existem; jobs agendados no cron; render de oferta com fila própria em tabela (`OfferGenerationJob`) |
| Crons | 15 jobs em série numa thread; CPU limitada a 1 vCPU (Fase 15 VPS) |

## 6. Menor mudança capaz de sustentar a tese aprovada (A + B + C sobre fundação)

Sem novo serviço, fila, cache externo ou banco. Tudo dentro do monólito e do cron existentes:

1. **Módulo de domínio "compra"** (pacote próprio) com um único cálculo: reposição pelo vendido desde o último pedido,
   corrigida por tendência e sazonalidade (D-025). Substitui estoque teórico no `CapitalOpportunityDetector` e no
   `PurchasePlanService` (D-026). Detectores de venda: queda de giro, sem venda há X dias, ruptura provável.
2. **Feed único "Hoje"**: oportunidades priorizadas e paginadas; alertas passam a ser notificações de oportunidade (D-021).
3. **Ação a partir da decisão**: aceitar COMPRAR insere/atualiza o item no rascunho do pedido do fornecedor, com desfazer (D-011).
4. **Leitura barata**: materializar no job e no refresh incremental o que hoje é calculado na leitura (cockpit, performance,
   recomendações de promoção); detecção sob demanda vira tarefa assíncrona.
5. **Saídas do pedido**: texto para WhatsApp, PDF e lista para o representante, gerados sob demanda no backend (D-012).
6. **PWA + Web Push**: manifest, service worker e envio a partir do cron, sem serviço novo (D-020).
7. **Testes de integração com PostgreSQL real e RLS** no CI (a classe de bug que derrubou login e ingestão).

Impacto estimado em recursos (ESTIMADO): CPU de leitura cai (materialização) e a do cron sobe, dentro do teto de 1 vCPU; banco
com algumas tabelas pequenas (ciclo por fornecedor, inscrições push, materializações); sem container novo.
