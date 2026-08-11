# AUDITORIA DA INTELIGÊNCIA COMERCIAL — MERCADOFLOW

> **Data da auditoria:** 10/08/2026
> **Método:** análise exclusiva do código-fonte (backend Java/Spring Boot, frontend React/TypeScript, migrations Flyway V1–V44), sem uso de documentação como fonte de verdade. Toda afirmação abaixo aponta arquivo/classe/método/tabela como evidência.
> **Escopo:** camada de inteligência comercial (produtos, vendas, combos, promoções, compras, capital, filiais) + pesquisa atual de APIs/modelos de IA.

---

## 1. Resumo executivo

O Mercadoflow tem uma **fundação de inteligência determinística muito acima do que a percepção de "camada insuficiente" sugere** — mas essa inteligência está **fragmentada, duplicada, recalculada a cada request e mal exposta na interface**. Os principais achados:

1. **Existe inteligência real e sofisticada já implementada**: curva ABC/XYZ, GMROI, estoque teórico com score de confiança, plano de compra por orçamento (alocação gulosa por eficiência de capital), efeito halo de promoções (tração cruzada com filtro de co-ocorrência em cupom), efetividade de promoção com baseline por mediana e elasticidade-preço, market basket (support/confidence/lift/leverage), previsão de demanda Holt-Winters com intervalo de confiança, 8 detectores de alerta com z-score, sazonalidade por dia/hora/mês. **Isso não é um sistema "que só mostra dados".**
2. **O maior problema não é falta de algoritmo — é falta de integração e persistência.** As 4 tabelas criadas em `V31__working_capital_intelligence.sql` para materializar esses cálculos (`product_capital_metrics`, `product_inventory_estimates`, `product_halo_effects`, `product_seasonality`) **nunca são escritas nem lidas**: tudo é recalculado on-line a cada request. O forecast Holt-Winters é gravado em `demand_forecasts` mas **não alimenta o plano de compra** (que usa média simples). Existem **dois motores de analytics, duas sazonalidades, dois momentum, três detecções de promoção e dois sinais de compra** que podem exibir números contraditórios na mesma tela.
3. **Não existe inteligência por filial.** A hierarquia rede→filial existe no banco (`markets.parent_market_id`, V34) mas é usada apenas para billing/limites de plano. Nenhum serviço analítico compara filiais, sugere transferência ou consolida a rede. O que a UI chama de "desempenho por filial" (`fetchProductBranchPerformance`) na verdade agrupa por **PDV (caixa)**, não por loja.
4. **Não existe nenhuma IA generativa, ML supervisionado ou feedback loop.** Zero integrações com provedores de LLM no código. As "explicações" são strings formatadas hardcoded (de boa qualidade, aliás — `WorkingCapitalService.buildReason()` é um ótimo protótipo do que a IA generativa deveria produzir em escala).
5. **Dados valiosos já coletados estão ociosos**: hora da venda (`data_emissao`), CPF do consumidor (`cpf_cnpj_destinatario`), PDV de origem, preços estaduais (V21), histórico de custo de compra, previsões de demanda.

A conclusão estratégica: **o caminho não é reescrever, é consolidar (uma fonte de verdade por métrica), materializar (jobs que persistem scores), conectar (forecast→compra, halo→promoção, rede→filial) e só então adicionar a camada de interpretação com IA generativa** — que terá dados estruturados prontos para consumir.

---

## 2. Como o sistema realmente funciona atualmente

### 2.1 Cadeia de dados (verificada no código)

```
PDV (loja) → pdv2cloud-agent (Windows, coleta XML NFC-e)
   → POST IngestController (API key por agente, pareamento V30)
   → invoices + invoice_items (chave NFe, PDV, data_emissao com hora,
     cpf_cnpj_destinatario, valor_total; matching de produto por EAN)
   → products (catálogo global enriquecido por crawler + imagens)
```

### 2.2 Processamento assíncrono (jobs reais, `@ConditionalOnProperty(jobs.enabled)`)

| Job | Agenda | O que faz | Persiste em |
|---|---|---|---|
| `DailyAggregationJob` | 02:00 | agrega vendas do dia anterior por produto | `sales_analytics` |
| `MarketBasketAnalysisJob` | 02:30 | pares de cesta (90 dias) | `market_basket_rules` (janela móvel 30d) |
| `MLPredictionJob` | 04:00 | Holt-Winters duplo + fator dia-da-semana + IC 90%, top-100 produtos, 30 dias à frente | `demand_forecasts` |
| `PriceIntelligenceJob` | a cada 15 min | estatísticas diárias de preço, eventos, janelas promocionais (threshold dinâmico) | `product_price_daily_stats`, `product_price_events`, `product_promotion_windows` |
| `AlertGenerationJob` | a cada 1h | 8 detectores estatísticos por mercado | `alerts` (dedup 36h) |
| `ProductCatalogMaintenanceJob`, `WebCatalogImportJob`, `CatalogImageRepairJob` | — | catálogo/imagens | tabelas de catálogo |

### 2.3 Camada de consulta (sob demanda, sem persistência)

Todo o resto — cockpit, performance de produto, capital de giro, plano de compra, halo, efetividade de promoção, sazonalidade — é **calculado em SQL/memória no momento do request** e devolvido pela API REST (`/api/v1/markets/{marketId}/...`), com recorte por plano (`GatedListDTO` / `PlanService.sliceInsights`).

### 2.4 Frontend

React SPA com telas ativas: `Dashboard` (cockpit + alertas embutidos), `Products` (abas Desempenho / Combos / Previsão), `ProductDetail`, `Promocoes` (abas Inteligência / Campanhas / Efetividade), `ShoppingList` (inclui `CapitalPlanTab` — capital de giro e plano de compra), `StoreMap`, `SupplierOrders` (não roteada), telas de ofertas/SaaS/superadmin.

---

## 3. Inventário completo das funcionalidades analisadas

| # | Funcionalidade | Onde está (evidência) | Estado |
|---|---|---|---|
| 1 | Dashboard básico (receita, crescimento, top 5, trend, notas recentes) | `AnalyticsService.getMarketDashboard()` | Funciona; parcialmente redundante com o cockpit |
| 2 | Cockpit avançado (overview, top/slow movers, giro, candidatos a reposição/promoção, sazonalidade 3 granularidades, pares, coleções sazonais, impacto de campanhas) | `AdvancedAnalyticsService.getCockpit()` (1718 linhas) | Funciona; caro (recalcula tudo por request) |
| 3 | Performance por produto (receita, qty, preço, velocity, promo share, price index, trend, turnover band, momentum EMA7/SMA28, health score 0–100) | `AdvancedAnalyticsService.loadProductPerformanceRows()` / `loadProductPerformancePage()` | Funciona; caminho paginado **não** calcula momentum/health (`ProductPerformanceDTO` linhas 305-306: `null`) |
| 4 | Dashboard de produto (trend, sazonalidade, "filiais", pares, timeline de preço, janelas promo, sinal de compra) | `AdvancedAnalyticsService.getProductDashboard()` | Funciona; "filial" = PDV |
| 5 | Market basket (pares, lift, leverage) | `MarketBasketService` + `MarketBasketAnalysisJob` | Funciona; só pares; parâmetros `minSupport`/`minConfidence` da API são **ignorados** |
| 6 | Alertas inteligentes (8 detectores z-score) | `AlertService` + `AlertGenerationJob` | Funciona; sem ciclo de vida além de `is_read` |
| 7 | Previsão de demanda (Holt-Winters + IC) | `MLPredictionJob`, `ForecastService`, `demand_forecasts` | Funciona; **desconectada da compra** |
| 8 | Inteligência de preço (eventos, janelas promocionais) | `PriceIntelligenceService`/`Job` | Funciona; alimenta ProductDetail e PromoEffectiveness |
| 9 | Efetividade de promoção (baseline mediana 2 passadas, lifts, elasticidade, score, classificação) | `PromoEffectivenessService` | Funciona; N+1 queries por produto |
| 10 | Inteligência de promoção (efeito halo, tração cruzada, ranking de drivers, candidatos TRAÇÃO/LIQUIDAÇÃO, desconto sugerido com teto de margem) | `PromoIntelligenceService` | Funciona; caríssima (até 40 SQLs pesados por request) |
| 11 | Capital de giro (ABC/XYZ, GMROI, cobertura, estoque teórico + confiança, ponto de reposição, risco de estagnação, status INVEST/MANTER/REDUZIR/LIQUIDAR, explicação textual) | `WorkingCapitalService` | Funciona; recalculado por request; tabelas V31 mortas |
| 12 | Plano de compra por orçamento (alocação gulosa por eficiência de capital, compra parcial, capital congelado, resumo de portfólio) | `PurchasePlanService` | Funciona; **já responde "como distribuir R$ 100 mil"** — usando média simples, não o forecast |
| 13 | Sinal de compra por produto (BUY/HOLD/REDUCE/CAUTION + qty sugerida) | `AdvancedAnalyticsService.buildPurchaseSignal()` | Funciona; **duplicado e potencialmente contraditório** com o item 11 |
| 14 | Campanhas manuais + impacto antes/durante/depois | `Campaign` (entidade), `computeCampaignImpact()` | Parcial: campanha **não tem produtos vinculados**; impacto medido na loja inteira |
| 15 | Sazonalidade da loja (dia da semana, hora, mês) | `fetchSeasonality()` em AdvancedAnalytics; `computeSeasonality()` em PromoIntelligence | Duplicada em dois serviços com metodologias diferentes |
| 16 | Coleções sazonais (Natal, Páscoa etc.) | `resolveSeasonalWindows()` + `SEASONAL_WINDOWS` | Parcial: datas fixas hardcoded, **duas listas divergentes no mesmo arquivo** |
| 17 | Mapa da loja + insights de vizinhança | `StoreLayoutService` (usa regras de cesta) | Funciona |
| 18 | Lista de compras + histórico de custo | `ShoppingListService`, `PurchasePriceService`, `SupplierOrderService` | Funciona (manual) |
| 19 | Preços estaduais (comparação externa) | `StatePriceService` (V21) | Coletado, **não integrado** à inteligência (alerta `PRICE_ABOVE_MARKET` nunca é gerado) |
| 20 | Rede matriz/filiais | `Market.parentMarket/branches` (V34) | Só billing/auth; **zero uso analítico** |
| 21 | IA generativa / LLM / ML supervisionado | — | **Inexistente** (grep por openai/anthropic/gemini/llm: zero ocorrências funcionais) |

---

## 4. Arquitetura atual

- **Backend:** Spring Boot (Java 17), 50 services, 25 controllers, JPA + `NamedParameterJdbcTemplate` para SQL analítico pesado, Flyway V1–V44, PostgreSQL com RLS (não efetiva — role com BYPASSRLS; V41 criou role restrito, troca pendente).
- **Multi-tenant:** `market_id` em todas as tabelas; validação por URL (`TenantAccessFilter` + `MarketAccessService.assertCanAccessMarket`); RLS como segunda camada (hoje inerte).
- **Padrão dominante da inteligência:** *compute-on-read* — SQL agregado + pós-processamento em memória por request. Só cesta, forecast, preço e agregado diário são materializados por job.
- **Frontend:** React + Vite, serviços REST tipados, abas dentro de telas (a inteligência está espalhada em 4 telas: Dashboard, Products, Promocoes, ShoppingList).

---

## 5. Fluxo dos dados

```
NFC-e XML → agente → ingest → invoices/invoice_items
                                   │
      ┌────────────┬───────────────┼───────────────────┬─────────────┐
      ▼            ▼               ▼                   ▼             ▼
sales_analytics  market_basket  demand_forecasts  price_stats/   alerts
(diário, 02:00)  _rules (02:30) (04:00)           events/windows (1h)
      │            │               │               (15 min)        │
      ▼            ▼               ▼                   ▼            ▼
 getSalesTrend  cesta cacheada  aba Previsão      ProductDetail  Dashboard
 (só isso!)     + StoreMap                        + PromoEffect.
                                                       
── E, em paralelo, TUDO abaixo é recalculado de invoices a cada request: ──
 cockpit · performance · capital de giro · plano de compra · halo ·
 efetividade de promoção · sazonalidade · sinal de compra
```

**Observação central:** os materializados cobrem ~20% da inteligência; os 80% mais caros (capital, halo, efetividade) rodam on-line.

---

## 6. Inteligência atual

Classificação honesta do que cada camada realmente entrega:

| Camada | Nível | Comentário |
|---|---|---|
| Coleta/organização | Maduro | Ingestão robusta, dedup por chave NFe, catálogo enriquecido |
| Métricas descritivas | Maduro | Receita, giro, ticket, tendência, sazonalidade |
| Estatística | Bom | Z-score, mediana, coeficiente de variação, EMA/SMA, elasticidade, Holt-Winters |
| Scoring | Bom mas disperso | healthScore, momentum, stagnationRisk, priorityScore, promo score, confidence — sem catálogo unificado nem persistência |
| Detecção de oportunidades | Parcial | 8 alertas + candidatos a promoção + status de capital — três mecanismos paralelos sem modelo comum de "oportunidade" |
| Recomendação | Parcial | Existe (plano de compra, desconto sugerido, sinal BUY/HOLD) com explicação textual — mas sem registro de aceite/resultado |
| Interpretação (IA) | Inexistente | — |
| Aprendizado (feedback) | Inexistente | — |

---

## 7. Análise de produtos

**O que existe** (`AdvancedAnalyticsService`, ~90 dias de janela padrão):
- Receita, quantidade, preço médio, nº de transações, dias com venda, `sales_velocity` (qty/dias com venda), última venda.
- Split promo/normal: item vendido ≤95% do preço-base (média da janela de baseline) conta como promocional → `promo_revenue_share`, preços médios promo/normal.
- `price_index` = preço médio atual / baseline; `revenue_trend_percentage` vs período anterior de mesma duração.
- `turnover_band` HIGH/MEDIUM/LOW com cortes **fixos** (≥12 e ≥4 un/dia — iguais para açougue e eletro; contrasta com o ABC do `WorkingCapitalService`, que é relativo ao portfólio).
- `momentumScore` = EMA(7)/SMA(28) da receita diária (capped 3.0); `healthScore` 0–100 = 40 pts tendência + 30 consistência + 20 momentum + 10 bônus.
- Classificação de capital (`WorkingCapitalService`): ABC (Pareto 80/95), XYZ (CV ≤0,5 / ≤1,0), GMROI, cobertura, momentum (7d/28d), risco de estagnação, veredito INVEST/MANTER/REDUZIR/LIQUIDAR com explicação.

**Lacunas verificadas:**
- Momentum/health **ausentes na listagem paginada** (só no caminho "rows" completo) — a tela de produtos ordenável não vê os dois scores mais ricos.
- `sales_velocity` divide por *dias com venda* no AdvancedAnalytics e por *dias da janela* no WorkingCapital (comentário do próprio código: "um produto que vendeu 10 unidades em 2 dias de 90 não gira 5/dia") — **duas velocidades diferentes para o mesmo produto em telas diferentes**.
- Sem classificação persistida (estratégico/entrada/saída/problema) — tudo é recalculado e some ao fechar a tela.
- Ruptura é inferida (silêncio de venda), nunca confirmada — não há estoque físico; o estoque teórico existe mas só no fluxo de capital.

---

## 8. Análise de vendas

**Existe:** faturamento, transações, ticket médio, crescimento vs período anterior, série diária, sazonalidade por dia-da-semana/hora/mês (loja), sazonalidade por dia-da-semana (produto), notas recentes, contagem de produtos ativos.

**Não existe:**
- Análise por **cliente**: `invoices.cpf_cnpj_destinatario` é gravado (V1) e **nunca lido por nenhum serviço analítico** — frequência de compra, recompra, ticket por cliente recorrente, tudo inexplorado.
- Análise por **PDV como dimensão gerencial** (frente de caixa) além do quadro no ProductDetail.
- Concentração de vendas (ex.: % da receita nos top-N produtos/horas) — o dado existe implícito no ABC mas não é exposto como visão de vendas.
- Comparação entre filiais (ver §12).

---

## 9. Análise de combos

**Como funciona hoje** (`MarketBasketService.computeRules`):
- SQL puro: self-join de `invoice_items` por cupom → pares (A<B) → `pair_count ≥ 3` em 90 dias → support, confidence A→B e B→A, lift, leverage → filtro `lift > 1.0` → ordena por `pair_count desc, lift desc` → top 200. Cache in-memory 10 min; persistência diária pelo job (30 dias de janela móvel).
- Consumo: aba Combos (Products), pares no cockpit, pares relacionados no ProductDetail, `checkBasketOpportunities` (alerta quando antecedente cresce e consequente estagna), `StoreLayoutService.getNeighborInsights` (adjacência no mapa da loja).

**Problemas concretos:**
- **Parâmetros mortos:** `analyzeMarketBasket(marketId, minSupport, minConfidence)` recebe e **ignora** ambos — o SQL filtra só por `pair_count` e `lift>1`. O job chama com `0.01, 0.5` acreditando filtrar por confiança; o controller expõe os parâmetros na API; nada disso tem efeito. (`MarketBasketService.java:59-149`)
- Só **pares** — sem itemsets de 3+, sem "cesta típica".
- Sem dimensão temporal: a associação "cerveja+carvão é mais forte no sábado" é incomputável hoje (o dado existe: `data_emissao` tem dia e hora).
- Sem valor comercial: nenhuma regra carrega impacto em R$ no ticket, margem conjunta ou categoria — impossível ranquear pares por dinheiro.
- Sem análise por filial (uma loja = um mercado; a rede não compara combos entre lojas).
- **Tração real existe em outro lugar**: o efeito halo do `PromoIntelligenceService` é a melhor resposta do sistema para "produto que faz outros venderem" (compara velocidade dos co-comprados em dias de promoção do driver vs dias normais, com filtro de co-ocorrência ≥5 cupons e score de confiança). Mas halo e cesta **não se conversam** — a cesta não usa halo, o halo não usa lift da cesta (o campo `basket_lift` existe na tabela V31 morta).

---

## 10. Análise de promoções

O Mercadoflow tem **três mecanismos independentes** de detecção/avaliação de promoção:

1. **Heurística inline** (`AdvancedAnalyticsService`): item ≤95% do baseline (média) = promo. Alimenta promo_share, candidatos e destaques do cockpit.
2. **Janelas promocionais** (`PriceIntelligenceService`): threshold dinâmico por produto (8%–60%), detecção incremental por checkpoint, persistidas em `product_promotion_windows` com lift de qty/receita por janela.
3. **Efetividade** (`PromoEffectivenessService`): baseline pela **mediana refinada em duas passadas** (metodologia mais correta das três), lifts diários promo vs normal, elasticidade Δqty%/Δpreço%, score 0–100, classificação BOOSTER / REVENUE_LOSS / BACKFIRE / NEUTRAL / INSUFFICIENT_DATA, com insight textual.

**Respondendo às perguntas da auditoria com base no código:**

| Pergunta | Resposta hoje |
|---|---|
| A promoção funcionou? | Sim, por produto (classificação + score do PromoEffectiveness) |
| Antes/durante/depois? | Por produto: sim (janelas com lift). Por campanha: só receita **da loja inteira** (`computeCampaignImpact` agrega `invoices` sem filtro de produto — `Campaign` não tem produtos) |
| O aumento foi causado pela promoção? | Não — não há contrafactual (baseline dessazonalizada) nem grupo de controle; lift = promo vs dias normais da mesma janela |
| Houve canibalização? | **Não medido em lugar nenhum** — nenhuma query compara substitutos/mesma categoria durante a promoção |
| Aumentou o ticket / itens por cupom? | Não medido por promoção (ticket só existe agregado da loja) |
| Puxou complementares? | **Sim** — efeito halo (receita incremental por target, confiança) |
| O que promover junto? | Sim — `topTargets` do TrafficDriver |
| Qual promoção destruiu margem? | Parcial — REVENUE_LOSS detecta receita caindo; **margem** real depende de custo cadastrado (ver §14) |
| Preço promocional ideal? | Não — elasticidade é calculada mas não é usada para simular preço ótimo |
| Em qual filial promover? | Não — sem dimensão de rede |
| Repetir/não repetir? | Implícito na classificação; não há registro de decisão nem comparação entre edições da mesma promoção |

**Demanda real vs deslocamento:** não diferenciado. Não há análise de pós-promoção (pantry-loading/queda após a janela — o dado `after` existe só no impacto de campanha, loja inteira).

---

## 11. Produtos tracionadores

- O conceito **existe e é o melhor achado da auditoria**: `PromoIntelligenceService.computeHaloEffects` + `rankTrafficDrivers` identifica drivers (produtos cuja promoção acelera co-comprados), com velocidade promo vs normal por target, lift %, receita incremental estimada, confiança (dias observados + força de co-ocorrência) e ranking por receita incremental total. Exposto em `/promo-intelligence/traffic-drivers` e na aba Inteligência de Promoções.
- **Limitações:** (a) tração é medida **apenas via promoção do driver** — não há "porta de entrada" fora de promoção (ex.: produto presente em cupons de maior ticket independentemente de preço); (b) sem influência sobre categorias (só produto→produto); (c) sem "ausência reduz vendas relacionadas" (exigiria janelas de ruptura, inexistentes); (d) custo computacional: até 40 drivers × 1 SQL com 5 CTEs cada, por request, sem cache; (e) resultados voláteis — sem persistência, o ranking pode mudar entre dois cliques.

---

## 12. Análise por filial

**Achado mais crítico da auditoria.**

- Modelo: `Market` = uma loja. `parent_market_id` + `branches` (V34, dois níveis, trigger impede filial de filial) + `cnpj_root` para detectar redes. **Uso real:** `AuthService`, `SubscriptionAdminService`, limites de plano. Grep por `parentMarket|getBranches|cnpj_root` em serviços analíticos: **zero ocorrências**.
- Consequências: cada filial tem sua inteligência isolada (o que é correto como base — os cálculos já são "por loja e relativos à loja", ex.: ABC relativo ao portfólio). Mas **não existe**: comparação de um produto entre filiais, benchmark de preço/giro na rede, oportunidade de transferência (excesso na filial A + ruptura na B), consolidação de compra da rede, visão do dono da rede.
- **Rótulo enganoso:** `fetchProductBranchPerformance` (AdvancedAnalyticsService:795) agrupa por `pdvs` (frente de caixa) e o DTO se chama `ProductBranchPerformanceDTO` com `branch_name` — a UI apresenta caixas como "filiais".
- A arquitetura conceitual pedida (REDE → FILIAL → CATEGORIA → PRODUTO → VENDA → RELAÇÕES → OPORTUNIDADES) existe **do nível FILIAL para baixo**; o nível REDE e as OPORTUNIDADES formais não existem.

---

## 13. Inteligência de compras

**Existe mais do que se percebe:**
- `WorkingCapitalService`: ponto de reposição = velocidade×lead time + safety stock (desvio-padrão × fator XYZ × √lead time); quantidade sugerida = alvo de 21 dias − estoque teórico; valor sugerido com custo real quando cadastrado.
- `PurchasePlanService.buildPlan(marketId, budget)`: ordena candidatos por eficiência de capital (GMROI ou margem×velocidade), aloca orçamento com compra parcial do item que não cabe inteiro, devolve selecionados/adiados/capital congelado + margem esperada e taxa de retorno. **É exatamente a resposta estrutural para "tenho R$ 100.000, como distribuo?"** — já implementada e exposta em `/capital/purchase-plan`, consumida pela `CapitalPlanTab` dentro da tela Lista de Compras.
- `buildPurchaseSignal` (ProductDetail): decisão BUY/HOLD/REDUCE/CAUTION com uplift sazonal.

**Lacunas:**
- **Forecast ignorado:** a demanda usada é média da janela (90d) — `demand_forecasts` (Holt-Winters com tendência e sazonalidade semanal) nunca entra no cálculo de reposição. Dois números de "demanda esperada" convivem no sistema.
- **Lead time fixo:** `DEFAULT_LEAD_TIME_DAYS = 7` constante; `supplier_orders` (V25) tem datas de pedido/entrega que permitiriam lead time real por fornecedor — não calculado.
- **Dois sinais de compra contraditórios:** `buildPurchaseSignal` (cobertura 14–21d, velocity por dias-com-venda) vs `suggestedOrderUnits` (cobertura 21d, velocity por dias-da-janela, com estoque e safety stock). O mesmo produto pode receber "Comprar agora: 120 un" no ProductDetail e outra quantidade na CapitalPlanTab.
- Estoque em trânsito (pedidos em aberto em `supplier_orders`) não desconta da sugestão.
- Sem eventos/calendário (promoções futuras planejadas não inflam a compra).

---

## 14. Capital investido

- GMROI, capital saudável vs congelado, % congelado, GMROI ponderado do portfólio, contagens por status e classe ABC — tudo em `PortfolioSummary`.
- **Fragilidades estruturais honestas (bem sinalizadas no código):** estoque é teórico (compras registradas − vendas pós-primeira-compra) com `confidence` 0–1 e `reason` (`SEM_COMPRA_REGISTRADA`, `ENTRADA_NAO_REGISTRADA`, `HISTORICO_PARCIAL/CONSISTENTE`); custo depende de `purchase_price_history`/`supplier_order_items` digitados; sem custo → margem estimada em 25% fixos (`FALLBACK_MARGIN_PERCENT`) e GMROI nulo. Ou seja: **a qualidade da inteligência de capital é diretamente proporcional à disciplina de cadastro de compras do cliente** — e não há nenhum fluxo de importação de XML de NF de *entrada* (compra), que resolveria isso na raiz, já que o agente só coleta notas de *saída*.

---

## 15. Algoritmos existentes (catálogo)

| Algoritmo | Implementação | Avaliação técnica |
|---|---|---|
| Pareto ABC / classe XYZ (CV) | `WorkingCapitalService` | Correto, relativo à loja |
| GMROI | idem | Correto; nulo sem estoque confiável (decisão certa) |
| Ponto de reposição + safety stock (√lead time, fator por XYZ) | idem | Padrão de mercado; lead time fixo é a fraqueza |
| Alocação gulosa por eficiência | `PurchasePlanService` | Adequada (o próprio código justifica não usar knapsack — correto dado o erro do estoque) |
| Co-ocorrência + support/confidence/lift/leverage | `MarketBasketService` | Correto para pares; sem Apriori/FP-Growth para itemsets |
| Efeito halo (diff de velocidade em dias-promo com filtro de co-ocorrência) | `PromoIntelligenceService` | Metodologicamente honesto (evita confundir calendário com causalidade); não é inferência causal formal |
| Baseline por mediana refinada + elasticidade | `PromoEffectivenessService` | Boa prática; elasticidade subutilizada |
| Holt-Winters duplo + fatores DOW + IC 90% | `MLPredictionJob` | Razoável; sem sazonalidade mensal/anual, sem backtesting/erro medido |
| Z-score portfólio | `AlertService` | Correto e barato |
| EMA/SMA momentum | `AdvancedAnalyticsService` e `WorkingCapitalService` | Duplicado com fórmulas diferentes |
| Threshold dinâmico de promoção | `PriceIntelligenceService` | Bom |

---

## 16. Limitações encontradas (formato pedido)

**Problema:** Tabelas de inteligência materializada nunca populadas
**Onde está:** `V31__working_capital_intelligence.sql`; `ProductCapitalMetricRepository`, `ProductInventoryEstimateRepository`, `ProductHaloEffectRepository`, `ProductSeasonalityRepository`
**Como funciona atualmente:** os 4 repositories existem, as tabelas têm índices e RLS, e o comentário da migration afirma "recalculadas por job e consumidas pelas telas" — mas nenhum job escreve nelas e nenhum serviço as lê; `WorkingCapitalService`/`PromoIntelligenceService` recalculam tudo por request
**Evidência:** grep por uso dos repositories → apenas imports do enum `CapitalStatus`
**Impacto:** latência alta (halo = até 40 SQLs de 5 CTEs por clique), carga no banco, scores voláteis entre requests, impossibilidade de histórico/tendência de score, impossibilidade de comparar filiais sem estourar custo
**Gravidade:** ALTA
**Oportunidade:** criar o job noturno que a migration já previa; ligar os serviços às tabelas (leitura) mantendo o cálculo on-line só para rebuild sob demanda

**Problema:** Dois motores de analytics paralelos
**Onde está:** `AnalyticsService` (usa `sales_analytics` p/ trend + `invoices` p/ resto) vs `AdvancedAnalyticsService` (só `invoices`)
**Impacto:** dois dashboards com números que podem divergir (ex.: trend do dashboard vem do agregado diário, trend do cockpit vem de invoices ao vivo); manutenção dobrada
**Gravidade:** MÉDIA — **Oportunidade:** aposentar `AnalyticsService` (dashboard antigo) ou reduzi-lo a fachada do cockpit

**Problema:** Duas sazonalidades, dois momentum, duas velocidades, dois sinais de compra
**Onde está:** `fetchSeasonality`/`computeSeasonality`; `loadMomentumScores` (EMA7/SMA28 receita) vs momentum (avg7/avg28 quantidade) do WorkingCapital; velocity por dias-com-venda vs por dias-da-janela; `buildPurchaseSignal` vs `suggestedOrderUnits`
**Impacto:** o mesmo produto exibe números diferentes em telas diferentes; erosão de confiança do usuário na "inteligência"
**Gravidade:** ALTA — **Oportunidade:** uma "Metric Layer" única (ver plano)

**Problema:** Forecast desconectado da compra
**Onde está:** `demand_forecasts` (gravado) × `WorkingCapitalService.buildMetric` (usa `dailyVelocity` médio)
**Gravidade:** ALTA — **Oportunidade:** demanda esperada do plano de compra = forecast quando disponível, média como fallback, com blending sazonal

**Problema:** Campanha sem vínculo com produtos
**Onde está:** entidade `Campaign` (name, description, datas); `computeCampaignImpact` agrega `invoices` da loja inteira
**Impacto:** impossível atribuir efeito, medir canibalização ou halo da campanha; qualquer feriado no meio contamina o resultado
**Gravidade:** ALTA — **Oportunidade:** `campaign_products` + reuso do PromoEffectiveness/halo por campanha

**Problema:** Parâmetros mortos na API de cesta
**Onde está:** `MarketBasketService.analyzeMarketBasket(minSupport, minConfidence)` — ignorados; `MarketController /analytics/market-basket` os expõe
**Gravidade:** BAIXA (funcional) / MÉDIA (confiabilidade) — **Oportunidade:** aplicar os filtros ou remover os parâmetros

**Problema:** Alertas declarados e nunca gerados
**Onde está:** `AlertType.EXPIRATION_RISK` e `AlertType.PRICE_ABOVE_MARKET` — nenhum `createAlert` os usa; preços estaduais (V21) coletados e não cruzados
**Gravidade:** MÉDIA — **Oportunidade:** integrar `StatePriceService` ao detector de preço; validade exigiria dado novo

**Problema:** Datas sazonais fixas e divergentes
**Onde está:** `AdvancedAnalyticsService` — `resolveSeasonalWindows` (Páscoa 15/03–15/04) e `SEASONAL_WINDOWS` (Páscoa 01/03–30/04), duas listas no mesmo arquivo; Páscoa e Carnaval são datas móveis
**Gravidade:** MÉDIA — **Oportunidade:** tabela de eventos de calendário (com cálculo de datas móveis) editável por mercado

**Problema:** Telas órfãs no frontend
**Onde está:** `MarketBasket.tsx`, `Alerts.tsx`, `DemandForecast.tsx`, `Campaigns.tsx`, `PromoEffectiveness.tsx` existem mas as rotas redirecionam (`App.tsx:124-137`); a lógica foi re-implementada como abas
**Gravidade:** BAIXA — **Oportunidade:** deletar os arquivos órfãos

**Problema:** Custo/latência dos cálculos on-line
**Onde está:** `AlertGenerationJob` chama `getProductPerformance` 8× por mercado/hora (cada uma recomputa performance completa + momentum de todos os produtos); `PromoEffectivenessService.analyzeMarket` roda ~5 queries por produto; `recommend()` = portfólio completo + halo completo
**Gravidade:** ALTA (escala) — **Oportunidade:** materialização (mesmo item 1) + cache por mercado

**Problema:** RLS não efetiva
**Onde está:** V29/V40–V44 criam 35+ policies; role de aplicação tem BYPASSRLS (V41 criou role restrito; `DATABASE_USER` não trocado)
**Gravidade:** ALTA (segurança multi-tenant, pré-requisito para IA com dados de clientes)
**Oportunidade:** concluir a Fase de troca de role antes de qualquer feature de IA

---

## 17. Duplicidades

Resumo (detalhes no §16): dois dashboards; duas sazonalidades; dois momentum; duas fórmulas de velocity; três detecções de promoção (heurística 95%-média, janelas do PriceIntelligence, mediana do PromoEffectiveness); dois sinais/quantidades de compra; duas listas de janelas sazonais no mesmo arquivo; telas React órfãs duplicando abas; `AnalyticsService.getMarketBasketAnalysis` e `getCachedMarketBasketAnalysis` expondo a mesma coisa por caminhos distintos.

## 18. Funcionalidades obsoletas

- `AnalyticsService.getMarketDashboard` + `SalesAnalyticsRepository.getProductAnalytics*` (o cockpit substitui).
- Telas órfãs listadas acima.
- `sales_analytics` (`DailyAggregationJob`): hoje serve apenas `getSalesTrend` do dashboard antigo — candidata a virar a base da Metric Layer (reaproveitar) ou ser aposentada junto com o dashboard.
- Parâmetros `minSupport`/`minConfidence` da API de cesta.

## 19. Funcionalidades incompletas

- Persistência V31 (capital/halo/estoque/sazonalidade) — criada e nunca usada.
- Alertas EXPIRATION_RISK / PRICE_ABOVE_MARKET — declarados, nunca disparados.
- Campanhas — sem produtos, sem atribuição.
- Rede/filiais — modelo criado (V34), inteligência ausente.
- Momentum/health no caminho paginado — `null` de propósito ("performance"), deixando a tela principal sem os scores.
- Elasticidade-preço — calculada e não usada para recomendação de preço.
- `SupplierOrders.tsx` — tela existe, não roteada.

## 20. Dados existentes que não estão sendo aproveitados

| Dado | Onde está | Inteligência possível sem coletar nada novo |
|---|---|---|
| Hora da venda | `invoices.data_emissao` | Sazonalidade horária em promo/compra/staffing; associação de cesta por período do dia |
| CPF do consumidor | `invoices.cpf_cnpj_destinatario` | Frequência/recompra, clientes recorrentes, ticket por cliente, cesta por perfil (com hash/anonimização — LGPD §27) |
| PDV | `invoices.pdv_id` | Desempenho por caixa (rotulado corretamente) |
| Rede | `markets.parent_market_id` | Comparação entre filiais, transferências, compra consolidada |
| Forecast | `demand_forecasts` | Reposição, risco de ruptura probabilístico (IC), validação do próprio modelo (previsto vs realizado) |
| Preços estaduais | `state_price_observations` (V21) | Alerta PRICE_ABOVE_MARKET, price index externo |
| Lead time real | `supplier_orders` datas | Ponto de reposição por fornecedor |
| Custo histórico | `purchase_price_history` | Inflação de custo, erosão de margem por produto |
| Janelas promocionais detectadas | `product_promotion_windows` | Já usadas no PromoEffectiveness; poderiam alimentar halo e calendário de promoções |

## 21. Problemas de UX relacionados à inteligência

1. **A inteligência está escondida dentro de abas de telas com outros nomes**: capital de giro e plano de compra vivem dentro de "Lista de Compras"; tracionadores dentro de "Promoções"; previsão dentro de "Produtos". Não existe um lugar que responda "o que está acontecendo / o que devo fazer".
2. **Alertas são um feed passivo**: título+mensagem+`is_read`; a metadata rica (números que sustentam o alerta) existe no JSON mas o alerta não leva a uma ação nem registra o que o usuário fez.
3. **Números conflitantes entre telas** (duplicidades do §17) minam a confiança.
4. **Sem histórico**: nenhum score tem série temporal visível ("o health desse produto está melhorando?").
5. **Sem visão de rede** para o dono de mais de uma loja (troca de mercado é manual, contexto por vez).
6. Recorte do plano gratuito (`GatedListDTO`) é bem feito (mostra o tamanho do problema, corta o detalhe) — registrar como decisão comercial correta.

## 22. Problemas arquiteturais

1. **Compute-on-read para cálculos caros** (capital, halo, efetividade) — sem materialização, sem cache distribuído (caches são `ConcurrentHashMap` por instância — quebram com 2+ réplicas).
2. **Ausência de camada de métricas única** — cada serviço reimplementa velocity/baseline/momentum.
3. **Ausência de modelo de "oportunidade"** — alertas, candidatos e status de capital são três formatos distintos para o mesmo conceito.
4. **Ausência de registro de decisão** — nada liga recomendação → ação do usuário → resultado (pré-requisito do feedback loop).
5. **`AdvancedAnalyticsService` com 1718 linhas** concentrando cockpit, performance, sazonalidade, campanha, coleções e sinal de compra — deveria ser decomposto.
6. **RLS inerte** (BYPASSRLS) — risco multi-tenant.
7. Jobs iteram todos os mercados serialmente sem particionamento — ok hoje, gargalo com centenas de tenants.

## 23. Oportunidades de evolução

(Consolidadas e priorizadas no documento de plano; síntese:)
1. Materializar V31 + criar Metric Layer única (maior alavanca de custo/consistência).
2. Conectar forecast→compra e lead time real→reposição.
3. Vincular campanhas a produtos e reusar efetividade/halo por campanha.
4. Inteligência de rede (comparação, transferência, compra consolidada).
5. Opportunity Engine unificando alertas/candidatos/status num modelo com ciclo de vida.
6. Camada de cliente (CPF hasheado) para frequência/recorrência.
7. IA generativa como camada de interpretação sobre dados já calculados (os `buildReason`/`buildInsight` atuais são o template).
8. Feedback loop (decisões registradas + medição do realizado vs previsto).

## 24. Necessidades de IA (o que é e o que não é caso para LLM)

| Necessidade | Tecnologia certa | Por quê |
|---|---|---|
| Métricas, agregações, ABC/XYZ, cesta, halo | SQL/estatística (já existe) | Determinístico, auditável, barato |
| Previsão de demanda | Séries temporais (HW já existe; evoluir para avaliação de erro/backtesting; modelos por categoria) | LLM não prevê demanda |
| Detecção de anomalia | Z-score/EWMA (existe) + limiares por confiança | idem |
| Score/priorização de oportunidades | Fórmulas determinísticas → depois regressão simples calibrada pelo feedback | Interpretável |
| Elasticidade/preço ótimo | Regressão log-log por produto | Estatística clássica |
| **Explicar** oportunidades em linguagem do supermercadista, compor o "resumo da semana", responder perguntas ("por que a margem caiu?") | **LLM** recebendo somente os números já calculados (contexto estruturado) | É exatamente o gap atual: interpretação |
| Normalização/categorização de descrições de produto do XML | LLM barato (batch) ou embeddings | Tarefa linguística real |
| Chat/copiloto sobre os dados | LLM + tool calling sobre APIs internas | idem |

## 25. Pesquisa atual de APIs e modelos (ago/2026)

> Preços verificados em ago/2026; tratar como voláteis. Valores por 1M tokens (input/output).

| Provedor | Modelos relevantes | Preço | Free tier | Observações para o Mercadoflow |
|---|---|---|---|---|
| **Anthropic** | Claude Opus 5 ($5/$25); Sonnet 5 ($3/$15, intro $2/$10 até 31/08/2026); Haiku 4.5 ($1/$5) | — | Não (créditos iniciais eventuais) | SDK Java oficial (`com.anthropic:anthropic-java`) — encaixa direto no backend; structured outputs, tool use, prompt caching (leituras ~0,1×), Batch API −50%. Sonnet 5/Haiku 4.5 são o par natural análise-complexa/tarefa-simples |
| **OpenAI** | GPT-5.6 Sol ($5/$30), Terra ($2/$12), Luna ($0.20/$1.20); GPT-5.4-mini ($0.75/$4.50), nano ($0.20/$1.25) | — | Não | Compatibilidade "OpenAI API" é o formato de fato dos gateways; Batch/Flex −50%; caching −75–90% |
| **Google Gemini** | Gemini 3 Flash ($0.50/$3.00); 3.5 Flash ($1.50/$9.00) | — | **Sim** — Flash/Flash-Lite com cotas (ex.: 3 Flash ≈ 10 RPM / 250k TPM / 1.500 req-dia; Pro saiu do free tier em 2026; cotas variam e não são mais fixas publicamente) | Free tier útil para desenvolvimento e para plano gratuito com cota; Batch −50%; caching até −90% |
| **DeepSeek** | V3.2 ($0.14/$0.28) | — | Não | Custo mínimo, qualidade próxima de fronteira; retenção/privacidade e hospedagem (China) exigem análise LGPD — para Mercadoflow, usar via host BR/US (Together/Fireworks, ~$1.25/$1.25) se necessário |
| **Groq** | Llama 3.3 70B ($0.59/$0.79), Llama 3.1 8B ($0.05/$0.08), Qwen/Mistral | — | Sim (dev tier c/ rate limits) | Latência baixíssima (LPU) — bom para classificação/normalização em tempo real |
| **Mistral** | Small 3.2 ($0.10/$0.30) | — | Sim (limitado) | Opção EU/GDPR-friendly; menos relevante para LGPD-BR mas postura de privacidade boa |
| **Together / Fireworks / inference.net** | Llama 4, DeepSeek, Qwen open-weight | ~50–90% abaixo de APIs de fronteira | Créditos iniciais | Hospedagem US de modelos abertos; alternativa BYO-modelo sem self-host |
| **OpenRouter** (gateway) | Todos acima via API compatível OpenAI | Markup ~5,5% sobre créditos; **BYOK: 5% do preço de lista** (isento no 1º 1M req/mês; enterprise 5M) — sinalizado que o fee BYOK migrará para assinatura fixa | Rotas :free limitadas | Um só endpoint p/ multi-modelo + fallback + provisioning keys com **limite de gasto por chave** (útil para cota por tenant); dependência de terceiro no fluxo de dados |
| **Self-hosted** (vLLM/Ollama + Llama/Qwen) | abertos | custo de infra | — | Só faz sentido para cliente enterprise com exigência de dados on-premise; a VPS atual não tem GPU — não recomendado no curto prazo |

**Modelos por tarefa (recomendação técnica):**
- Interpretação/relatórios semanais e chat: Sonnet 5 ou GPT-5.6 Terra (qualidade/custo), com Batch API para o resumo noturno (−50%).
- Classificação, normalização de descrições de produto, extração: Haiku 4.5 / GPT-5.4-nano / Gemini 3 Flash / Groq Llama 8B — centavos por milhão.
- Análises complexas sob demanda ("explique a queda de margem do trimestre"): Opus 5 / GPT-5.6 Sol, raras e cacheadas.

Fontes: [CloudZero — OpenAI pricing](https://www.cloudzero.com/blog/openai-pricing/), [Morph — tabela por token OpenAI](https://www.morphllm.com/openai-api-pricing), [PricePerToken — OpenAI](https://pricepertoken.com/pricing-page/provider/openai), [Curlscape — Gemini pricing guide](https://curlscape.com/blog/google-gemini-api-pricing-guide-2026), [PE Collective — Gemini free tier](https://pecollective.com/tools/gemini-free-tier-guide/), [AI Pricing Guru — Google](https://www.aipricing.guru/google-ai-pricing/), [OpenRouter — BYOK docs](https://openrouter.ai/docs/use-cases/byok), [TrueFoundry — OpenRouter pricing](https://www.truefoundry.com/blog/openrouter-pricing), [flo2 — OpenRouter pricing explained](https://flo2.com/blog/openrouter-pricing-explained), [CloudZero — LLM API comparison](https://www.cloudzero.com/blog/llm-api-pricing-comparison/), [Layer3 — Groq pricing](https://www.layer3labs.io/guides/groq-pricing), [Inference.net — comparativo](https://inference.net/content/llm-api-pricing-comparison/).

## 26. Análise de OpenRouter / BYOK / OAuth

- **Modo Mercadoflow (chave própria da plataforma):** viável e recomendado como padrão. Controle de custo por tenant via contadores próprios (o sistema já tem `MarketUsageCounter` para notas — replicar para tokens).
- **Modo Gateway (OpenRouter):** tecnicamente sólido — API compatível OpenAI, roteamento/fallback entre provedores, *provisioning keys* com limite por chave (mapeável 1 chave-filha por tenant). Custos: ~5,5% sobre créditos, BYOK 5% (com isenção inicial). Riscos: terceiro no caminho dos dados (avaliar DPA/retenção), dependência de disponibilidade, e o próprio fee BYOK anunciado como mutável. Veredito: **bom para acelerar a Fase 6 (multi-provedor), não obrigatório na Fase 5** (um provedor direto basta).
- **Modo BYOK (cliente traz chave de API):** viável e de baixa complexidade jurídica (o contrato de dados fica entre cliente e provedor). Requisitos técnicos: criptografia da chave em repouso (AES-GCM com chave de app / KMS), never-log, teste de validade, isolamento por tenant, revogação, e fallback claro quando a chave falhar. É a resposta certa para clientes maiores com contratos próprios.
- **Modo OAuth (cliente autoriza a conta dele de ChatGPT/Claude/Gemini):** **NÃO viável comercialmente hoje.** Pesquisa atual: a Anthropic proibiu em 20/02/2026 o uso de OAuth de assinatura em ferramentas de terceiros e desde 04/04/2026 esse tráfego é cobrado como crédito extra, não pela assinatura; o Google fez movimento análogo com o Gemini CLI em fev/2026; o "Sign in with ChatGPT" da OpenAI é **identidade**, não uso do plano do usuário. Conclusão: descartar OAuth de assinatura; OAuth só como *login/identidade* se algum dia fizer sentido. Fontes: [fazm.ai — Claude third-party apps/billing](https://fazm.ai/blog/claude-third-party-apps), [sunpeak — Claude connector OAuth](https://sunpeak.ai/blogs/claude-connector-oauth-authentication/), [issue Codex/OpenAI sobre Sign in with ChatGPT](https://github.com/openai/codex/issues/10974), [OpenHands CLI — brainstorming OAuth](https://github.com/OpenHands/OpenHands-CLI/issues/261).
- **Modo Self-hosted:** adiar (sem GPU na infra; caso raro de cliente).

## 27. Segurança e LGPD

- **Pré-requisito absoluto:** efetivar a RLS (trocar `DATABASE_USER` para o role sem BYPASSRLS criado na V41) **antes** de qualquer feature que envie dados a terceiros — vazamento entre tenants + envio externo seria o pior cenário.
- **Minimização para a IA:** o modelo deve receber **agregados e métricas** (ex.: "produto X: velocity 12/dia, trend +14%, cobertura 3 dias"), nunca: CPF de consumidor, chave de NFe, CNPJ de destinatário, dados de billing. O Context Builder (plano, §14 do plano) deve ter allowlist explícita de campos.
- **CPF do consumidor:** se a camada de cliente for construída, usar hash com salt por tenant (pseudonimização), agregação mínima (k-anonimato nas telas), base legal = legítimo interesse com opt-out documentado; CPF cru nunca sai do banco.
- **Retenção/DPA dos provedores:** exigir modo API/enterprise sem treinamento sobre dados (OpenAI API e Anthropic API não treinam por padrão; verificar por contrato); registrar retenção (Anthropic exige 30 dias para modelos topo — relevante se usar Fable).
- **Auditoria:** logar por tenant: prompt-template + versão, modelo, tokens, custo, hash do contexto (não o contexto integral com dados sensíveis).
- **BYOK:** chaves cifradas em repouso, mascaradas na UI, revogáveis, jamais logadas.

## 28. Conclusão da auditoria

O Mercadoflow **já é** um sistema com inteligência determinística de bom nível técnico — ABC/XYZ, GMROI, halo, elasticidade, Holt-Winters, plano de compra por orçamento — mas essa inteligência está **invisível para o próprio sistema**: não persiste, não se integra, não tem modelo unificado de oportunidade, não registra decisões e não fala a língua do supermercadista num lugar só. A sensação de "camada de inteligência insuficiente" vem de fragmentação e apresentação, não de ausência de cálculo.

A rota de evolução correta, detalhada no `PLANO_EVOLUCAO_INTELIGENCIA_MERCADOFLOW.md`:
**Fase 0** (RLS efetiva, deletar órfãos, corrigir parâmetros mortos e datas sazonais) → **Fase 1** (consolidar métricas duplicadas, reorganizar telas em torno de uma Central de Inteligência) → **Fase 2** (materializar V31, conectar forecast→compra, campanhas→produtos, lead time real) → **Fase 3** (Opportunity Engine) → **Fase 4** (Recommendation Engine com registro de decisão) → **Fase 5** (IA generativa interpretando dados estruturados) → **Fase 6** (orquestração multi-provedor + BYOK) → **Fase 7** (experiência de agente) → **Fase 8** (feedback loop e aprendizado).
