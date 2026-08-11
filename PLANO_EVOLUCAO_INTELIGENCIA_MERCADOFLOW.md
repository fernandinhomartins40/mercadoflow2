# PLANO DE EVOLUÇÃO DA INTELIGÊNCIA — MERCADOFLOW

> **Base:** `AUDITORIA_INTELIGENCIA_MERCADOFLOW.md` (10/08/2026). Este plano parte do que **existe no código** e prioriza evolução incremental: consolidar → materializar → conectar → interpretar → aprender.
> **Convenção:** cada item marca claramente `[EXISTE]` (código atual reaproveitado), `[REFATORAR]` (existe e muda) ou `[NOVO]`.

---

## 1. Visão futura do Mercadoflow

De "sistema que mostra dados" para o ciclo completo:

```
DADOS → INFORMAÇÃO → ANÁLISE → INTELIGÊNCIA → OPORTUNIDADE
     → RECOMENDAÇÃO → DECISÃO → AÇÃO → RESULTADO → APRENDIZADO
```

Hoje o código cobre DADOS→ANÁLISE bem, INTELIGÊNCIA de forma fragmentada, OPORTUNIDADE/RECOMENDAÇÃO parcialmente (alertas, candidatos, plano de compra) e **nada** de DECISÃO→APRENDIZADO. O plano fecha o ciclo.

> **PRINCÍPIO REITOR: a IA generativa é uma função adicional, não o plano.** O Mercadoflow deve ficar mais inteligente de forma **independente do uso de LLM**: todo o ciclo acima — métricas, scores, oportunidades, recomendações com evidência e texto explicativo determinístico, decisões e resultados — funciona completo sem nenhum provedor de IA configurado. O LLM entra apenas como camada opcional de redação/interpretação (Fases 5–7), preferencialmente usando **APIs gratuitas** (§24), e o sistema degrada graciosamente para os textos determinísticos quando a IA estiver indisponível, sem cota ou desligada. Nenhuma fase de 0 a 4 depende de IA.

## 2. Conceito do Agente Inteligente do Supermercadista

Uma experiência única que responde, por filial e por rede:
1. **O que está acontecendo?** — feed de oportunidades/riscos priorizados (Opportunity Engine).
2. **Por que está acontecendo?** — evidências numéricas de cada oportunidade (metadata que os alertas já carregam hoje, padronizada).
3. **O que devo fazer?** — recomendação acionável com quantidade/desconto/prazo (Recommendation Engine).
4. **Qual impacto esperado?** — estimativa em R$ (receita incremental, capital liberado, margem protegida).
5. **O que aconteceu depois que fiz?** — medição do realizado vs previsto (Feedback Loop).

O LLM entra apenas nos passos 2–4 como **redator/intérprete de números já calculados** — nunca como calculadora.

## 3. Nova arquitetura de inteligência

```
                       ┌────────────────────────────────────────┐
 invoices/items ──────▶│ 4. DATA INTELLIGENCE LAYER             │
 purchase_history      │    metric_daily (materializada)        │
 supplier_orders       │    + Metric Layer (fórmulas únicas)    │
 state_prices          └───────────────┬────────────────────────┘
                                       ▼
        ┌──────────────────────────────────────────────────────┐
        │ 5–13. ENGINES (jobs noturnos + rebuild sob demanda)  │
        │ Product · Sales · Promotion · Combo · Purchase ·     │
        │ Capital · Branch/Network · Forecast                  │
        │ → escrevem nas tabelas V31 + novas (scores, halo,    │
        │   sazonalidade, comparativos de rede)                │
        └───────────────┬──────────────────────────────────────┘
                        ▼
        ┌──────────────────────────────┐   ┌─────────────────────┐
        │ 9. OPPORTUNITY ENGINE        │──▶│ 10. RECOMMENDATION  │
        │ opportunities (ciclo de vida)│   │ recommendations     │
        └───────────────┬──────────────┘   └──────────┬──────────┘
                        ▼                             ▼
        ┌──────────────────────────────┐   ┌─────────────────────┐
        │ 14. CONTEXT BUILDER          │──▶│ 14. AI ORCHESTRATOR │
        │ (allowlist LGPD, só números) │   │ provider A/B/gateway│
        └──────────────────────────────┘   │ /BYOK + fallback    │
                                           └──────────┬──────────┘
                                                      ▼
                       Central de Inteligência (UI) → decisão do usuário
                                                      ▼
                              15. FEEDBACK LOOP (decisions + outcomes)
```

## 4. Data Intelligence Layer

- `[EXISTE]` `sales_analytics` (agregado diário por produto, `DailyAggregationJob`) — promover a **fonte canônica** de série diária: adicionar colunas (custo do dia quando conhecido, qty promo/normal, transações) e passar todos os engines a ler dela em vez de re-agregar `invoice_items`.
- `[NOVO]` **Metric Layer**: classe única (`MetricDefinitions`) com as fórmulas canônicas — `velocity` (por dias de janela, definição do WorkingCapital), `momentum` (EMA7/SMA28, definição do AdvancedAnalytics), `baseline de preço` (mediana refinada do PromoEffectiveness), `turnover band` (relativo ao portfólio, substituindo cortes fixos 12/4). Todos os serviços passam a importar daqui. **Resolve as duplicidades §17 da auditoria.**
- `[REFATORAR]` `AdvancedAnalyticsService` (1718 linhas) decomposto: cockpit, performance, sazonalidade, campanhas, coleções viram serviços separados sobre a Metric Layer.

## 5. Product Intelligence Engine

- `[REFATORAR]` Job noturno `ProductIntelligenceJob` grava em `product_capital_metrics` (tabela V31 **já criada**) o resultado de `WorkingCapitalService.computePortfolio` + momentum/health do AdvancedAnalytics. Serviços/telas passam a **ler** da tabela; o cálculo on-line vira apenas `POST /rebuild`.
- `[NOVO]` Histórico de score: `product_metric_history` (snapshot semanal de health/momentum/status) → tendência do score na UI.
- `[NOVO]` Classificação persistida de papel do produto (ESTRATEGICO / TRACIONADOR / MARGEM / CAUDA / PROBLEMA) derivada de ABC×halo×margem — regra determinística documentada.

## 6. Sales Intelligence Engine

- `[EXISTE]` Sazonalidade dia/hora/mês, trend, ticket — consolidar na versão do `PromoIntelligenceService.computeSeasonality` (tem confiança por observações) e persistir em `product_seasonality` (V31, morta hoje) + nível loja.
- `[NOVO]` Camada de cliente: `customer_profiles` com `customer_hash = HMAC(cpf, salt_do_tenant)`, frequência, recência, ticket médio, itens/cupom. Alimenta: produtos que trazem clientes recorrentes, taxa de recompra por produto. (LGPD: pseudonimizado, nunca exibir CPF.)
- `[NOVO]` Detecção de anomalia de vendas diária (EWMA ± k·σ por loja e por categoria) → evento `ANOMALIA_DE_VENDAS`.

## 7. Promotion Intelligence Engine

- `[REFATORAR]` Unificar as três detecções de promoção: `product_promotion_windows` (PriceIntelligence, incremental, persistida) vira a **única** fonte de "dias em promoção"; `PromoEffectivenessService` e o split promo/normal do performance passam a consumi-la (aposentar a heurística 95%-da-média).
- `[REFATORAR]` `Campaign` ganha `campaign_products` (migration nova) + tipo de mecânica e preço alvo; impacto por campanha = PromoEffectiveness restrito aos produtos + halo dos produtos + **canibalização**: `[NOVO]` comparação da velocidade dos demais produtos da mesma categoria durante a janela vs baseline (mesma técnica do halo, sinal invertido).
- `[NOVO]` Pós-promoção: velocidade nos 7–14 dias após a janela vs baseline → distingue demanda incremental de antecipação de compra (pantry loading).
- `[NOVO]` Preço promocional sugerido: usar a elasticidade já calculada (`PromoEffectivenessService`) para simular 3 profundidades de desconto e escolher a de maior margem incremental esperada (respeitando o teto de 70% da margem que `suggestedDiscount` já aplica).

## 8. Combo Intelligence Engine

- `[REFATORAR]` `MarketBasketService`: aplicar (ou remover) `minSupport`/`minConfidence`; adicionar dimensão temporal (associação por dia-da-semana e período do dia — mesma CTE com `extract(dow)`), valor da cesta (ticket médio dos cupons com o par vs sem) e margem conjunta quando houver custo.
- `[NOVO]` Itemsets de 3+ produtos via extensão do SQL atual (juntar pares fortes) ou FP-Growth em job — só onde volume justificar.
- `[REFATORAR]` Persistir halo em `product_halo_effects` (V31, morta) preenchendo `basket_lift` com o lift da cesta — halo e cesta finalmente integrados; `checkBasketOpportunities` e `StoreLayoutService` leem da tabela.

## 9. Opportunity Engine

- `[NOVO]` Tabela `opportunities`: `id, market_id, type, product_id/category, title, evidence (jsonb — números), expected_impact_value, confidence, priority_score, status (NOVA→VISTA→EM_ACAO→CONCLUIDA→EXPIRADA→DESCARTADA), recommendation_id, created_at, expires_at`.
- Detectores plugáveis (interface `OpportunityDetector` + registro Spring — extensível sem reescrever): mapeamento do que **já existe** para os tipos pedidos:

| Tipo | Fonte hoje | Ação |
|---|---|---|
| QUEDA_DE_VENDAS | `checkSlowMoving` | migrar detector |
| CRESCIMENTO_DE_VENDAS | `checkHighPerformers` | migrar |
| RISCO_DE_RUPTURA | `checkLowStock`/`DEMAND_SPIKE` + `[NOVO]` cobertura < lead time usando forecast | migrar + upgrade |
| EXCESSO_DE_ESTOQUE / CAPITAL_PARADO | `CapitalStatus.REDUZIR/LIQUIDAR` | migrar do WorkingCapital |
| PRODUTO_TRACIONADOR | `rankTrafficDrivers` | migrar |
| OPORTUNIDADE_DE_COMBO | `checkBasketOpportunities` | migrar |
| OPORTUNIDADE_DE_PROMOÇÃO | `checkPromotionOpportunities` + candidatos TRAÇÃO/LIQUIDAÇÃO | migrar |
| PROMOÇÃO_INEFICIENTE | classificação REVENUE_LOSS/BACKFIRE | migrar |
| PRODUTO_EMERGENTE / EM_DECLÍNIO | momentum + trend (existem) | novo detector fino |
| OPORTUNIDADE_DE_COMPRA | `suggestedOrderUnits` + forecast | novo detector |
| OPORTUNIDADE_DE_TRANSFERÊNCIA | `[NOVO]` requer Branch Intelligence (§13) | novo |
| ANOMALIA_DE_VENDAS / MUDANÇA_DE_COMPORTAMENTO | `[NOVO]` EWMA §6 | novo |
| PREÇO_ACIMA_DO_MERCADO | `state_price_observations` (coletado, não usado) | novo detector — fecha o alerta declarado e nunca gerado |

- `alerts` atual vira a *notificação* de uma oportunidade (FK), preservando a UI existente durante a transição.

## 10. Recommendation Engine

- `[NOVO]` Tabela `recommendations`: `opportunity_id, action_type (COMPRAR/PROMOVER/LIQUIDAR/TRANSFERIR/REPOSICIONAR/AJUSTAR_PRECO), parameters (jsonb: qty, desconto, janela, filial), evidence, calculation_trace, confidence, expected_impact, status (PROPOSTA→ACEITA→REJEITADA→EXECUTADA), decided_by, decided_at`.
- Estrutura pedida **RECOMENDAÇÃO → EVIDÊNCIAS → CÁLCULOS → CONFIANÇA → IMPACTO → AÇÃO** já tem protótipos no código: `buildReason` (capital), `buildInsight` (promo), `decisionReason` (compra) — padronizar nesses campos.
- Ações executáveis dentro do produto: COMPRAR → adiciona à Lista de Compras/pedido a fornecedor (fluxo existe); PROMOVER → cria Campaign com produtos (fluxo passa a existir no §7); demais registram decisão.

## 11. Purchase Intelligence Engine

- `[REFATORAR]` `WorkingCapitalService.buildMetric`: demanda esperada = `demand_forecasts` (soma dos próximos `lead_time + cobertura` dias, com IC) quando houver forecast; fallback média atual. Risco de ruptura probabilístico = P(demanda no lead time > estoque teórico) via IC do forecast.
- `[REFATORAR]` Lead time real por fornecedor: média/percentil-90 de (`delivered_at − order_date`) de `supplier_orders`; fallback 7 dias.
- `[REFATORAR]` Descontar estoque em trânsito (pedidos abertos) da sugestão.
- `[REFATORAR]` **Eliminar o sinal duplicado**: `buildPurchaseSignal` do ProductDetail passa a exibir o resultado do WorkingCapital (uma única quantidade sugerida no sistema).
- `[EXISTE]` `PurchasePlanService` permanece como está (alocação por orçamento) — só herda os inputs melhores. Perguntas "e se eu comprar menos/mais?": recalcular cobertura/risco com o slider de orçamento (função pura já disponível).

## 12. Capital Allocation Engine

- `[EXISTE]` GMROI/ABC/XYZ/status/priority — manter fórmulas.
- `[DESCARTADO]` ~~Importar XML de NF de entrada (compra)~~ — **fora do foco do produto** (decisão do dono, 11/08/2026). O Mercadoflow analisa as **vendas** (NFC-e emitidas no PDV, que o agente já coleta) para orientar a **decisão de compra**. Processar a nota de compra de mercadoria não é o eixo do produto. Custo de compra permanece como **dado opcional de cadastro** (`purchase_price_history` / `supplier_order_items`), com degradação explícita quando ausente — que é como o `WorkingCapitalService` já se comporta: sem custo, GMROI fica nulo em vez de inventado. A prioridade é extrair mais sinal das vendas já coletadas.
- `[NOVO]` Série semanal de capital (total, saudável, congelado, GMROI) por filial → gráfico de evolução e meta de % congelado.

## 13. Branch Intelligence (rede)

- `[NOVO]` `NetworkIntelligenceService` sobre `markets.parent_market_id` (já existe): para cada produto da rede, comparar velocity/preço/margem/cobertura entre filiais (lendo `product_capital_metrics` materializada — barato).
- Detectores de rede: OPORTUNIDADE_DE_TRANSFERÊNCIA (excesso em A com `stagnation_risk` alto + venda saudável/ruptura em B, com custo logístico ignorado na v1 e sinalizado), DIVERGÊNCIA_DE_PREÇO entre filiais, benchmark "sua filial vende X 40% abaixo da irmã".
- `[REFATORAR]` Renomear a visão por PDV (`ProductBranchPerformanceDTO`) para "por caixa" e criar a visão real por filial para usuários da matriz.
- UI: seletor rede/filial no topo da Central de Inteligência; papéis de acesso já existem (owner/manager).

## 14. AI Orchestrator

- `[NOVO]` Módulo backend `ai/`:
  - **Context Builder**: monta o contexto do LLM exclusivamente a partir de `opportunities`/`recommendations`/métricas agregadas, com allowlist de campos (LGPD §20). Nada de dados brutos de nota, CPF, chave NFe.
  - **Provider abstraction**: interface `LlmProvider` (chat + structured output) com implementações: Anthropic (SDK Java oficial), OpenAI-compatível (cobre OpenAI, Gemini-compat, Groq, DeepSeek, OpenRouter — um cliente só), e decorators de retry/timeout/circuit breaker.
  - **Roteamento por tarefa em camadas (free-first)**: Camada 0 = **provedores gratuitos** (§24: Cerebras 1M tokens/dia, Groq, NVIDIA NIM, OpenRouter `:free`, Gemini Flash free) para interpretação de oportunidades, resumo semanal e classificação — cobre a operação normal de um tenant a custo zero; Camada 1 = modelo pago barato (Haiku 4.5 / nano / Gemini Flash pago) quando a cota free esgota e o plano do tenant permite; Camada 2 = modelo pago médio/topo apenas para `ANALISE_PROFUNDA` sob demanda em planos superiores. Batch/agendado onde o provedor der −50%.
  - **Fallback**: cadeia por tarefa (free A → free B → pago se habilitado → **texto determinístico atual**, que já existe e é a degradação final sempre disponível). Como quase todos os provedores free são compatíveis com a API OpenAI, um único cliente HTTP cobre a cadeia inteira trocando `base_url` + chave.
  - **Custos/quotas**: contador de tokens/custo por tenant (padrão `MarketUsageCounter` existente), teto por plano, cache de respostas por hash do contexto (uma oportunidade só é interpretada 1×; TTL até os números mudarem).
  - **Observabilidade**: log por chamada (tenant, tarefa, modelo, versão de prompt, tokens, latência, custo); prompts versionados em recurso versionado no repositório.
  - **Multi-tenant**: BYOK por mercado (chave cifrada AES-GCM, mascarada, revogável) sobrescreve o provedor padrão; OpenRouter provisioning-keys como opção de gateway com limite por tenant. **Sem OAuth de assinatura** (proibido pelos provedores — auditoria §26).

## 15. Feedback Loop

- `[NOVO]` Ao decidir (aceitar/rejeitar/executar) uma recomendação, gravar snapshot dos números previstos. Job semanal `OutcomeEvaluationJob` mede o realizado no horizonte da recomendação (vendas/margem/capital) e grava `recommendation_outcomes (predicted, actual, delta, verdict)`.
- Usos: (a) tela "Resultado das decisões"; (b) calibração dos pesos de priority score por tipo (começar com ajuste manual informado por relatório; regressão simples só quando houver volume); (c) acurácia do forecast (previsto vs realizado por produto — também valida o Holt-Winters, hoje nunca medido); (d) contexto para o LLM ("da última vez que você aceitou uma recomendação deste tipo, o resultado foi…").

## 16. Nova arquitetura de telas

**Princípio:** uma porta de entrada orientada a decisão; telas atuais viram detalhe/ferramenta.

```
Central de Inteligência (nova home)
├── Feed de Oportunidades (priorizado, com filtros por tipo/filial)
├── Saúde da Loja (KPIs + capital + anomalias)
├── Recomendações pendentes / Histórico de decisões / Resultados
└── Resumo da IA (semanal + pergunte aos dados)
Produtos · Promoções · Compras (telas atuais reorganizadas)
Rede (nova, para matriz)
```

## 17. Reorganização das telas existentes

| Tela atual | Mudança |
|---|---|
| Dashboard | vira "Saúde da Loja" (KPIs do cockpit + resumo de capital + anomalias); alertas migram para o feed |
| Products (Desempenho/Combos/Previsão) | mantém; adiciona coluna de papel do produto e badge de oportunidades abertas; Previsão ganha "previsto vs realizado" |
| Promocoes (Inteligência/Campanhas/Efetividade) | Campanhas com produtos vinculados e impacto atribuído + canibalização + pós-janela |
| ShoppingList/CapitalPlanTab | promovida a tela "Compras" de 1º nível (plano por orçamento + pedidos + capital) |
| ProductDetail | um único sinal de compra (WorkingCapital); "por caixa" renomeado; halo do produto |
| Telas órfãs (MarketBasket, Alerts, DemandForecast, Campaigns, PromoEffectiveness .tsx) | **deletar** |

## 18. Novas telas (com justificativa)

| Tela | Problema que resolve | Usuário | Dados | IA? | Prioridade |
|---|---|---|---|---|---|
| Central de Inteligência | "o que devo fazer hoje?" espalhado em 4 telas | dono/gerente | opportunities + recommendations | Opcional (resumo) | P0 |
| Comparação entre Filiais | invisibilidade da rede | dono de rede | metrics materializadas por filial | Não | P1 |
| Histórico & Resultado de Decisões | nada registra o que foi feito e se funcionou | dono | recommendations + outcomes | Opcional | P1 |
| Resumo da IA / Pergunte aos dados | interpretação em linguagem natural | dono | contexto estruturado | **Sim** | P2 |
| Inteligência de Compras (evolução da CapitalPlanTab) | decisão de compra com forecast/risco | comprador | purchase engine | Opcional | P1 |

## 19. Novos indicadores

Cobertura em dias com IC; risco de ruptura probabilístico; lead time real por fornecedor; canibalização (%); lift pós-promoção; ticket incremental por par de cesta; % capital congelado (série); taxa de recompra por produto; acurácia do forecast (MAPE); custo médio ponderado e erosão de margem por produto; índice de preço vs mercado (estadual).

## 20. Novos scores (e os que já existem)

| Score | Estado | Fórmula/nota |
|---|---|---|
| Product Health Score | `[EXISTE]` | manter (40 trend + 30 consistência + 20 momentum + 10 bônus); persistir + histórico |
| Sales Momentum | `[EXISTE]` | EMA7/SMA28 — canônico único |
| Stock Risk Score | `[REFATORAR]` | de `stagnationRisk` + risco de ruptura probabilístico (forecast) |
| Promotion Opportunity Score | `[EXISTE]` | score TRAÇÃO/LIQUIDAÇÃO atual |
| Combo Opportunity Score | `[NOVO]` | lift × frequência × ticket incremental (dinheiro, não só estatística) |
| Capital Efficiency | `[EXISTE]` | GMROI |
| Purchase Priority | `[EXISTE]` | priorityScore do capital + urgência de ruptura |
| Branch Opportunity Score | `[NOVO]` | gap de desempenho do produto vs melhor filial da rede |

Para todos: persistir com `computed_at`, expor confiança e limitações (ex.: "estoque estimado, confiança 0,4"), validar via feedback loop (§15).

## 21. Novos algoritmos

1. Forecast: manter Holt-Winters; adicionar backtesting (MAPE por produto) e fator mensal; avaliar Croston para itens intermitentes (cauda C). **Não** adotar ML pesado sem antes medir o erro do atual.
2. EWMA para anomalias diárias.
3. Elasticidade → simulação de preço promocional (grid de 3 descontos).
4. FP-Growth opcional para itemsets (apenas se pares se mostrarem insuficientes).
5. Regressão simples para calibrar priority scores com outcomes (Fase 8).

## 22. Uso de IA generativa

Casos aprovados (todos consumindo apenas números calculados):
1. **Interpretação de oportunidade** (batch noturno, modelo médio, cache por hash) — transforma a evidência jsonb no parágrafo no estilo do exemplo do §9 do prompt; os `buildReason` atuais viram fallback determinístico.
2. **Resumo semanal da loja/rede** (batch, −50% via Batch API).
3. **Pergunte aos dados**: chat com tool calling sobre endpoints internos read-only (cockpit, capital, promo) — o LLM chama ferramentas, não inventa números; respostas citam as métricas usadas.
4. **Normalização/categorizção de descrições de produto** (modelo barato, batch) — melhora o matching de catálogo.
Anti-casos: cálculo de métrica, previsão, decisão automática de compra/preço sem humano.

## 23. Uso de machine learning

Curto prazo: nenhum modelo treinado — estatística já cobre. Médio prazo (pós-feedback): regressão para pesos de score; classificação de propensão de sucesso de promoção (features: elasticidade, halo, sazonalidade, categoria). Sempre com baseline determinístico comparável.

## 24. APIs e provedores de IA — estratégia FREE-FIRST

**Decisão: a Fase 5 inteira roda sobre APIs gratuitas.** Provedor pago só entra como upgrade opcional por plano (Fase 6). Panorama verificado em ago/2026 (limites mudam — revalidar na implementação):

| Provedor gratuito | O que oferece de graça | Limites (ago/2026) | Adequação ao Mercadoflow |
|---|---|---|---|
| **Cerebras** | 1M tokens/DIA, sem cartão, hardware ultrarrápido (Llama, Qwen, GLM) | 14.400 req/dia por modelo; contexto 8K no free | **Melhor cota free do mercado** — 1M tokens/dia cobre dezenas de resumos/interpretações; contexto 8K exige contexto enxuto (que o Context Builder já garante) |
| **Groq** | Todos os modelos (Llama 3.3 70B, Qwen, Mistral) em LPU, sem cartão, sem sistema de créditos | 30 RPM, ~30K tokens/min, 14.400 req/dia | Ótimo para classificação/normalização em tempo real e interpretações curtas; latência mínima |
| **NVIDIA NIM (build.nvidia.com)** | 100+ modelos (Nemotron, Llama, Gemma, GLM); plano free permanente + créditos iniciais (1.000–5.000) | ~40 RPM (elevável a 200 via pedido); modelos "free" não consomem créditos | Boa 2ª opção da cadeia; catálogo grande; créditos extras concedidos via fórum para projetos |
| **OpenRouter `:free`** | 28+ modelos free (DeepSeek R1, Llama 3.3 70B, Qwen3 Coder, Gemma 3, Gemini Flash) num endpoint só | 20 RPM; 50 req/dia — ou **1.000 req/dia após compra única de $10** (não expira) | Com $10 únicos, vira um agregador free de produção leve + fallback automático entre modelos |
| **Google Gemini** | Flash/Flash-Lite com cota free (AI Studio) | ~10 RPM / 250K TPM / 1.500 req-dia (variável) | Bom para dev/teste e volume moderado |
| **Mistral (Experiment)** | Todos os modelos da La Plateforme | ~1B tokens/mês, para avaliação (não produção) | Dev/teste |
| ~~GitHub Models~~ | — | **Fechado para novos clientes em jun/2026** | Descartar |

**Arquitetura recomendada:** cadeia free com rotação — `Cerebras → Groq → NVIDIA NIM → OpenRouter :free → texto determinístico`. Todos expõem API compatível com OpenAI, então a implementação é **um** cliente HTTP com lista ordenada de `(base_url, api_key, modelo)` por tarefa, circuit breaker por provedor e contabilidade de cota local (RPM/tokens-dia) para trocar de provedor **antes** do 429. Com as cotas acima somadas (~2M+ tokens/dia), a operação free comporta o resumo semanal + interpretação de oportunidades de dezenas de tenants; quando não comportar, o corte é gracioso (texto determinístico), nunca quebra.

**Pago (opcional, Fase 6):** Anthropic (SDK Java oficial; Sonnet 5/Haiku 4.5) ou OpenAI (Terra/nano) como Camada 1/2 para planos superiores — mesma abstração `LlmProvider`, zero mudança estrutural.

Fontes: [Cerebras free tier 1M tokens/dia](https://adam.holter.com/cerebras-opens-a-free-1m-tokens-per-day-inference-tier-and-ccerebras-now-offers-free-inference-with-1m-tokens-per-day-real-speed-benchmarks-show-2600-tokens-sec-on-llama4scout-here-are-the-actual-n/) · [Cerebras rate limits (docs)](https://inference-docs.cerebras.ai/support/rate-limits) · [Groq free tier limits](https://tokenmix.ai/blog/groq-free-tier-limits-2026) · [Groq free (PricePerToken)](https://pricepertoken.com/endpoints/groq/free) · [NVIDIA NIM free 2026](https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/) · [NVIDIA Build free API](https://pasqualepillitteri.it/en/news/1621/nvidia-build-free-api-100-ai-models-2026) · [OpenRouter rate limits (oficial)](https://openrouter.zendesk.com/hc/en-us/articles/39501163636379-OpenRouter-Rate-Limits-What-You-Need-to-Know) · [OpenRouter free models](https://costgoat.com/pricing/openrouter-free-models) · [Free LLM API tiers 2026](https://ianlpaterson.com/blog/free-llm-api-2026/) · [Mistral free tier](https://pricepertoken.com/endpoints/mistral/free) · [GitHub Models fechado](https://free-llm-apis.pages.dev/providers/github-models/)

## 25. OpenRouter / BYOK / OAuth / gateways self-hosted

- **BYOK ampliado (Fase 6):** o cliente configura chave de API **e opcionalmente um endpoint customizado** (qualquer URL compatível com OpenAI). Isso cobre com uma única feature: chave própria de OpenAI/Anthropic/Gemini, conta própria no OpenRouter, e até um gateway self-hosted que o cliente rode na infra dele (LiteLLM, 9Router etc.). Chave cifrada por tenant (AES-GCM), validada, mascarada, revogável; fallback para a cadeia free da plataforma.
- **OpenRouter:** duplo papel — rotas `:free` na cadeia gratuita da plataforma (§24) e, para tenants pagos, provisioning keys com limite por chave; fee ~5,5% (BYOK 5%) aceitável; não fica no caminho crítico.
- **OAuth de assinatura (conta ChatGPT/Claude do cliente) e instâncias 9Router por cliente: descartados.** A Anthropic proíbe OAuth de assinatura em terceiros desde 02/2026 e desde 04/2026 esse tráfego é cobrado como crédito extra (não usa a assinatura); Google seguiu o mesmo caminho; "Sign in with ChatGPT" é só identidade. Rodar uma instância 9Router por cliente na VPS agregaria custo operacional (N containers/dashboards/backups), custódia de tokens de terceiros (risco LGPD) e nenhum benefício, já que a economia de assinatura deixou de existir. Quem quiser seu próprio gateway usa o campo "endpoint customizado" do BYOK — na infra e responsabilidade dele.

## 26. Segurança

Ordem obrigatória: (1) efetivar RLS (trocar `DATABASE_USER` para o role V41 sem BYPASSRLS — pendência conhecida); (2) segredos de IA fora do repositório (env/secret manager, rotação); (3) chaves BYOK cifradas (AES-GCM) e nunca logadas; (4) rate limit por tenant nas rotas de IA; (5) prompts injetáveis: contexto estruturado gerado pelo servidor, entrada do usuário do chat sanitizada e separada do contexto de sistema; (6) auditoria de chamadas de IA por tenant.

## 27. LGPD

Minimização: o Context Builder envia apenas agregados/métricas (allowlist). CPF nunca sai do banco; camada de cliente usa HMAC por tenant. DPA/no-training com o provedor escolhido; documentar retenção. Transparência: página "como a IA usa seus dados". Direitos do titular: exclusão do hash mediante pedido. Isolamento: RLS efetiva + contexto sempre construído sob o `market_id` autenticado.

## 28. Observabilidade

Métricas por engine-job (duração, linhas gravadas, erros) e por chamada de IA (tenant, tarefa, modelo, tokens, custo, latência, cache hit). Dashboard interno de custo de IA por tenant/plano. Alarme de custo diário. Versionamento de prompt no log de cada resposta.

## 29. Controle de custos de IA

**Custo-alvo da Fase 5: R$ 0** — a cadeia free (§24) com contabilidade local de cota (RPM/tokens-dia por provedor) cobre a operação padrão. Além disso: teto mensal de tokens por plano (reuso do padrão `PlanService`/usage existente); cache por hash de contexto (uma oportunidade interpretada 1×); batch para tudo que não é interativo; provedores pagos só por plano e por tarefa; corte gracioso: cota esgotada → texto determinístico (que continua existindo e é o mesmo conteúdo, sem a redação do LLM).

## 30. Multi-tenancy

RLS efetiva + `market_id` em todas as novas tabelas (`opportunities`, `recommendations`, `outcomes`, `customer_profiles`, `ai_usage`) com policies no padrão V29; jobs particionados por mercado (paralelizáveis); custo de IA e BYOK por tenant.

## 31. Estratégia por filial

Todos os engines rodam por filial (como hoje) — os cortes já são relativos à loja (ABC, z-score), o que é a decisão certa e deve ser preservada. A rede entra como camada de **comparação e arbitragem** (§13), nunca como média que apaga a realidade local. Oportunidades têm sempre `market_id` de filial; oportunidades de rede (transferência) referenciam origem e destino.

## 31-A. Status da implementação (atualizado em 10/08/2026)

### FASE 0 — concluída, exceto RLS

| Item | Status | Observação |
|---|---|---|
| Deletar telas órfãs | ✅ Feito | 5 arquivos, 1.336 linhas. Confirmado antes que nenhum import as referenciava e que as rotas já eram `Navigate` |
| Parâmetros mortos da cesta | ✅ Feito | **Aplicados**, não removidos: os 5 chamadores usam thresholds distintos de propósito (mapa da loja 0,05; cockpit 0,15; job 0,5). Corrigido também um bug não previsto na auditoria — o cache era chaveado só por `marketId`, então os thresholds se contaminavam entre chamadores; agora o cache guarda o conjunto bruto e o filtro é aplicado na leitura |
| Janelas sazonais | ✅ Feito (com desvio) | **Não unificadas.** As duas listas servem a propósitos diferentes (anunciar evento na UI vs medir venda histórica) e fundi-las degradaria ambas — ver comentários no código. O defeito real era Páscoa/Carnaval como datas fixas: criado `BrazilianHolidays` (algoritmo de Meeus, validado contra 6 datas reais). O Carnaval de 2025 caiu em 04/03, totalmente fora da janela "fevereiro 1–28" |
| "Filial" → "caixa" | ✅ Feito | DTO renomeado para `ProductPdvPerformanceDTO`, aliases SQL, tipos do frontend e o rótulo visível ("Filiais e PDVs" → "Por caixa (PDV)") |
| RLS efetiva | ⛔ Pendente | Troca de `DATABASE_USER` para o role da V41. É operação de deploy/VPS, não de código. **Continua sendo pré-requisito para qualquer feature de IA** |

### FASE 1 — concluída

| Item | Status | Observação |
|---|---|---|
| Metric Layer | ✅ Feito | `service/metric/MetricDefinitions.java` com velocity, momentum, EMA/SMA, turnover band, health score e coeficiente de variação. 18 testes, incluindo paridade que prova que EMA/SMA/health são cópias fiéis das fórmulas originais |
| Velocity unificada | ✅ Feito | Definição canônica = quantidade ÷ **dias da janela**. Antes o AdvancedAnalytics dividia por dias-com-venda: um produto com 10 un em 2 dias de 90 aparecia como 5,0/dia numa tela e 0,11/dia na outra (**45× de diferença**) |
| Turnover band | ✅ Melhorado | Passou de cortes fixos (≥12 e ≥4 un/dia, iguais para açougue e eletro) para **percentil do portfólio**. Num mercado pequeno, os cortes fixos faziam todo o catálogo virar "LOW". O percentil é sempre calculado contra o portfólio inteiro (`loadMarketVelocities`), nunca contra a página ou o produto isolado |
| Momentum/health no caminho paginado | ✅ Feito | Eram `null` de propósito ("performance"), deixando a tela principal de produtos sem os dois scores mais ricos. Agora preenchidos com uma query por página, não uma por produto |
| Sinal de compra único | ✅ Feito | A quantidade sugerida agora vem SEMPRE do `WorkingCapitalService` (`computeForProduct`, com cache de 10 min do portfólio). O ProductDetail deixou de ter régua própria de 14 dias. A sazonalidade continua enriquecendo por cima (uplift de temporada), porque o capital não a enxerga — e o veredito REDUZIR/LIQUIDAR do capital tem prioridade sobre a leitura de tendência |
| Decompor `AdvancedAnalyticsService` | ✅ Feito | 1.832 → ~1.520 linhas. Extraídos `seasonal/SeasonalCalendarService` (janelas de exibição e de medição, datas móveis, resolução de status) e `campaign/CampaignImpactService` (impacto antes/durante/depois) |
| Aposentar `AnalyticsService` | ✅ Marcado como `@Deprecated` | **Não deletado, de propósito.** O endpoint `/dashboard` é API pública e pode ter clientes fora do frontend. Além disso, três coisas vivem SÓ nele e o cockpit não cobre: status de ingestão (notas em 24h, última processada, notas recentes), alertas não lidos e a leitura de `market_basket_rules`. O Javadoc documenta o que precisa de destino antes da remoção. No frontend, o `getDashboard` morto foi removido |
| Central de Inteligência v0 | ✅ Feito | `intelligence/IntelligenceCenterService` + `GET /markets/{id}/intelligence/feed` + tela `/app/inteligencia` no menu. Unifica alertas, vereditos de capital e candidatos a promoção num **modelo único de oportunidade** com prioridade comparável — o embrião do Opportunity Engine, sem tabela nova. Cada fonte é tolerante a falha: se a promo cair, o feed ainda entrega alertas e capital |
| Momentum do WorkingCapital | ⚠️ Divergência aberta | Continua avg7/avg28 de **quantidade** enquanto a tela de produto usa EMA7/SMA28 de **receita**, e ele É exibido (vai para `momentumScore` e aparece no texto de `buildReason`). Unificar exige a série diária de cada SKU, e o método roda sobre todo o portfólio numa query só para não fazer 8 mil round-trips. **Resolve-se na Fase 2**, quando a materialização da V31 pré-calcular a série. Documentado no código |

**Validação:** backend compila em Java 17 (imagem do Dockerfile) e passa 36 testes; frontend com build de produção do Vite OK e os mesmos 124 erros de tipo pré-existentes de antes das mudanças (verificado via `git stash`), nenhum introduzido.

**O que a Central v0 deliberadamente NÃO faz** (fica para a Fase 3): persistir oportunidades, dar-lhes ciclo de vida (NOVA→VISTA→EM_AÇÃO→CONCLUÍDA) e registrar decisão do usuário. O feed é recalculado a cada request e não tem memória.

### FASE 2 — concluída

| Item | Status | Observação |
|---|---|---|
| Materializar a V31 | ✅ Feito | `ProductIntelligenceJob` (03:00) + `ProductIntelligenceMaterializer` gravam `product_capital_metrics`, `product_inventory_estimates` e `product_seasonality` — três das quatro tabelas que existiam desde a V31 sem que **nenhum job escrevesse nem nenhum serviço lesse**. As fórmulas não mudaram: persiste-se exatamente o que o `WorkingCapitalService` já calculava |
| Leitura das materializadas | ✅ Feito | `CapitalMetricsReader` passa a ser a porta de entrada de `WorkingCapitalController`, `PurchasePlanService`, `PromoIntelligenceService`, `AdvancedAnalyticsService` e da Central. **Com fallback deliberado**: sem materialização (loja nova, `jobs.enabled=false`), cai para o cálculo on-line — a diferença entre "a tela demora" e "a tela está vazia" |
| Endpoint de rebuild | ✅ Feito | `POST /markets/{id}/intelligence/rebuild`, para quem acabou de cadastrar custos e quer ver o GMROI sem esperar a madrugada |
| Forecast → compra | ✅ Feito | `ExpectedDemandService` lê `demand_forecasts` (Holt-Winters que o `MLPredictionJob` já gravava e **ninguém consumia**) e alimenta o ponto de reposição. Só substitui a média quando a previsão cobre ≥70% do horizonte; abaixo disso subestimaria a demanda. 7 testes cobrindo a regra |
| Lead time real | ✅ Feito | Mediana de (entrega − envio) por produto em `supplier_orders`, no lugar da constante de 7 dias. Mediana, não média, para que um atraso de greve não vire regra; mínimo de 2 entregas; faixa limitada a 1–90 dias contra sujeira de cadastro |
| Estoque em trânsito | ✅ Feito | Pedidos enviados e não entregues agora são descontados da sugestão. Antes o sistema mandava comprar de novo o que já estava a caminho |
| Rastreabilidade da decisão | ✅ Feito | O texto de `buildReason` passa a dizer quando a quantidade veio de previsão (e não de média), qual o prazo medido e quanto já há em pedido aberto |
| Cache de velocities | ✅ Feito | O `AlertGenerationJob` chama `getProductPerformance` 8×/mercado/hora; com o turnover relativo da Fase 1 isso passaria a fazer 8 varreduras idênticas de `invoice_items`. Cache de 5 min por mercado+janela absorve a rajada |
| Halo materializado (`product_halo_effects`) | ✅ Feito | Quarta e última tabela da V31. O halo era o cálculo mais caro do sistema (até 40 drivers × 1 SQL de 5 CTEs por clique, sem cache, com ranking que mudava entre dois cliques). `HaloEffectsReader` lê o materializado com o mesmo fallback do capital. O campo `basket_lift`, criado na V31 e **nunca preenchido**, agora recebe o lift da regra de cesta do mesmo par — halo e market basket mediam a mesma relação por caminhos diferentes e nunca se falavam |
| Campanhas com produtos | ✅ Feito | Migration V45 (`campaign_products`) + `CampaignProductIntelligenceService`. O impacto deixa de ser medido sobre a loja inteira (onde qualquer feriado contaminava o número) e passa a ser atribuído aos participantes, com **canibalização** (os vizinhos de categoria perderam venda?) e **efeito pós-janela** (houve antecipação de compra / pantry loading?) — duas medidas que a auditoria registrou como inexistentes |
| ~~Importar XML de entrada~~ | ❌ Descartado | **Fora do foco** (decisão do dono, 11/08/2026): o produto analisa as VENDAS para orientar a compra. Custo segue como cadastro opcional |
| Camada de cliente (CPF hasheado) | ✅ Feito | `customer_profiles` + `product_repurchase_stats` (V45). O `cpf_cnpj_destinatario` é gravado desde a V1 e **nunca havia sido lido por serviço analítico nenhum**. LGPD: HMAC-SHA256 com **salt por tenant** (o mesmo CPF gera hashes diferentes em lojas diferentes, impedindo cruzamento), hash calculado **dentro do banco** via pgcrypto (o documento não trafega até a aplicação) e k-anonimato de 5 clientes para publicar estatística de produto. 6 testes cobrindo essas garantias |
| Anomalias de venda (EWMA) | ✅ Feito | `SalesAnomalyDetector`: a loja como série temporal, não produto a produto. EWMA em vez de média simples porque num varejo que cresce a média sempre fica para trás e geraria alarme falso todo dia. Cada dia é julgado contra o padrão formado pelos dias **anteriores** a ele |
| Preço vs mercado estadual | ✅ Feito | `MarketPriceComparisonDetector` fecha o `PRICE_ABOVE_MARKET`, declarado no enum desde sempre e **nunca gerado**, embora a V21 já coletasse os preços. Usa **mediana** (uma loja com promoção agressiva distorceria a média) e apresenta o resultado como sinal para conferência, não veredito |

**Validação da Fase 2:** backend compila em Java 17 e passa **49 testes** (36 + 7 de demanda esperada + 6 de LGPD do hash de cliente); frontend inalterado, mesmos 124 erros pré-existentes. Grafo de dependências verificado como acíclico.

**A migration V45 foi aplicada num PostgreSQL 16 real** (container descartável, as 45 migrations em ordem), confirmando: as 4 tabelas criadas com RLS ativa, o `pgcrypto` instalado e o `hmac()` funcionando. Os 6 SQLs analíticos novos — perfis de cliente, recompra, lead time, estoque em trânsito, sazonalidade, canibalização e preço vs mercado — foram validados com `EXPLAIN` contra o schema real, porque erro de SQL passa pelo compilador Java e só apareceria em produção.

### Estado em produção (11/08/2026)

As Fases 0, 1 e 2 estão **implantadas em produção** via GitHub Actions (commits
`9b629e9`, `f44c716`, `a2b5e2e` e o fix `bbb763d`). Verificado na VPS:

- migration **V45 aplicada** (`flyway_schema_history`), com as 4 tabelas novas e RLS ativa;
- `pgcrypto` instalado e `hmac()` operando;
- backend `{"status":"UP"}`, site público HTTP 200, zero erros no log;
- container `mercadoflow-cron` ativo com `SPRING_PROFILES_ACTIVE=jobs`, então o
  `ProductIntelligenceJob` das 03:00 roda automaticamente.

**Um defeito foi encontrado pela verificação em produção e corrigido** (`bbb763d`):
o campo `cpf_cnpj_destinatario` aceita CPF e CNPJ, e havia um CNPJ com 991 notas
emitidas. O filtro era `length >= 11`, então compra de empresa entrava como
consumidor final — um único CNPJ ativo viraria "o cliente mais recorrente da
loja". Passou a exigir exatamente 11 dígitos.

> **Atenção sobre os dados atuais:** o mercado de maior volume tem 3.653 notas,
> mas 3.031 delas concentradas em 3 CPFs sintéticos (`12345678901`,
> `98765432100`) — são dados de teste. A camada de cliente classificou
> corretamente (3 recorrentes, 621 únicos), mas os números não representam
> comportamento real de consumidor. A validação de negócio dessas métricas só
> será possível com um cliente real operando.

### RLS: resolvida (verificado em 11/08/2026)

A pendência que a auditoria classificava como P0 **já estava fechada** — a
verificação em produção mostrou `DATABASE_USER=mercadoflow_app` no backend, com
`rolbypassrls=f`, `rolsuper=f` e sem posse das tabelas (dono é `pdv2cloud`).

Isolamento provado com o próprio role da aplicação:

| Sessão | Notas visíveis |
|---|---|
| `app.current_market` = tenant A | 3.653 |
| `app.current_market` = tenant B | 1.000 |
| **sem tenant** | **0** (fail-closed) |

O total no banco é 4.653 e nenhum tenant o enxerga. 48 das 61 tabelas têm RLS;
**nenhuma das 13 restantes tem coluna `market_id`** (catálogo, preços estaduais,
planos, crawler). As 6 tabelas de inteligência (V31 + V45) têm policy
`tenant_isolation` e o `mercadoflow_app` tem SELECT/INSERT/UPDATE/DELETE nelas —
confirmado por escrita real de teste, depois revertida.

Dois pontos que parecem furo e não são: o container de jobs usa o role dono de
propósito (varre todos os mercados, com `runAsSystem` no código), e
`markets`/`users` ficam sem RLS porque protegê-las quebraria o login, que
resolve o mercado antes de existir tenant na sessão — ali a proteção é o
`MarketAccessService`.

### Insumos reais disponíveis para a Fase 2 (11/08/2026)

| Insumo | Estado em produção |
|---|---|
| Forecast | **6.362 previsões, 283 produtos**, até 10/09. **100 produtos** passam no critério de cobertura de 70% do horizonte e terão a compra calculada por previsão em vez de média — exatamente o top-100 que o `MLPredictionJob` cobre |
| Sazonalidade | **3.378 linhas** seriam geradas no mercado de maior volume |
| Recompra | **565 produtos** atingem o k-anonimato de 5 clientes |
| Lead time real | **0 produtos** — nenhum pedido a fornecedor foi entregue e registrado, então o fallback de 7 dias é usado. Comportamento correto; a melhoria só rende quando houver operação real de compras |

> **Nota de operação:** o `ProductIntelligenceJob` só roda com `jobs.enabled=true`. Enquanto ele não rodar em produção, todos os caminhos continuam servindo o cálculo on-line — o ganho de latência só aparece depois da primeira execução (ou de um POST em `/intelligence/rebuild`).

---

## 32. Roadmap

**FASE 0 — Fundação (1–2 semanas de esforço)**
RLS efetiva (troca de role); deletar telas órfãs; corrigir/remover parâmetros mortos da cesta; unificar as duas listas de janelas sazonais (e datas móveis de Páscoa/Carnaval); renomear "filial"→"caixa" na visão por PDV; documentar fórmulas atuais.

**FASE 1 — Organização**
Metric Layer (fórmulas canônicas); decompor `AdvancedAnalyticsService`; aposentar dashboard antigo (`AnalyticsService`); um único sinal de compra; Central de Inteligência v0 (agregando alertas+candidatos existentes, sem motor novo).

**FASE 2 — Inteligência determinística**
Materializar V31 via jobs (capital, halo, sazonalidade, estoque); histórico de scores; forecast→compra + lead time real + estoque em trânsito; campanhas com produtos + canibalização + pós-janela; camada de cliente (hash); anomalias EWMA; detector de preço vs mercado estadual.

**FASE 3 — Opportunity Engine**
Tabela + detectores plugáveis migrando os 8 alertas e candidatos; ciclo de vida; feed na Central; alerts legados como notificação.

**FASE 4 — Recommendation Engine**
Recomendações estruturadas (evidência/cálculo/confiança/impacto); ações executáveis (compra→lista/pedido, promoção→campanha); registro de decisão.

**FASE 5 — IA Generativa (função adicional, custo zero)**
AI Orchestrator v1 sobre a **cadeia free** (§24: Cerebras → Groq → NVIDIA NIM → OpenRouter :free → texto determinístico); Context Builder com allowlist; interpretação de oportunidades (batch) + resumo semanal; contabilidade de cota free por provedor e por tenant. Nada do que foi entregue nas Fases 0–4 passa a depender disto.

**FASE 6 — Orquestração**
Provedores pagos opcionais por plano (Camadas 1/2); roteamento por tarefa; BYOK com endpoint customizado; OpenRouter provisioning keys opcional; observabilidade completa de IA.

**FASE 7 — Agente do Supermercadista**
"Pergunte aos dados" (tool calling); notificações proativas (resumo diário/semanal push); Branch Intelligence completa com transferências.

**FASE 8 — Aprendizado**
OutcomeEvaluationJob; tela de resultados; calibração de scores; acurácia de forecast; contexto de histórico para o LLM.

## 33. Priorização

| Melhoria | Prio | Impacto | Complexidade | Depende de | Risco | Valor p/ supermercadista | IA? | Banco? | API nova? |
|---|---|---|---|---|---|---|---|---|---|
| RLS efetiva | P0 | Muito alto (risco) | Baixa | — | Deploy | Indireto | Não | Não (role) | Não |
| Metric Layer / desduplicação | P0 | Alto | Média | — | Regressão numérica | Confiança nos números | Não | Não | Não |
| Materializar V31 + jobs | P0 | Muito alto | Média | Metric Layer | Baixo | Velocidade + histórico | Não | Não (tabelas existem) | Não |
| Forecast→compra + lead time real | P1 | Muito alto | Média | F2 | Médio | Compra melhor | Não | Não | Não |
| Campanha com produtos + canibalização | P1 | Alto | Média | — | Baixo | Promoção mensurável | Não | Sim | Sim |
| Central de Inteligência v0 | P1 | Alto | Média | — | Baixo | UX de decisão | Não | Não | Sim |
| Opportunity Engine | P1 | Muito alto | Alta | F2 | Médio | Núcleo do agente | Não | Sim | Sim |
| Recommendation + decisões | P1 | Muito alto | Alta | Opp. Engine | Médio | Ação | Não | Sim | Sim |
| ~~Importar XML de entrada (custo)~~ | ❌ | — | — | — | — | **Descartado: fora do foco** | — | — | — |
| Rede / comparação de filiais | P2 | Alto | Média | V31 mat. | Baixo | Redes | Não | Não | Sim |
| IA: interpretação + resumo (cadeia free, opcional) | P2 | Alto | Média | Opp./Rec. | Alucinação (mitigada por contexto fechado); custo ~zero (free tiers) | Diferencial | **Sim** | Sim (ai_usage) | Sim |
| Camada de cliente (hash) | P2 | Médio | Média | LGPD ok | LGPD | Recorrência | Não | Sim | Sim |
| BYOK/multi-provedor | P2 | Médio | Média | Fase 5 | Segurança de chave | Enterprise | Sim | Sim | Sim |
| Chat "pergunte aos dados" | P3 | Alto | Alta | Fase 5/6 | Injeção/custo | Diferencial | Sim | Não | Sim |
| Feedback loop / calibração | P3 | Alto | Alta | Fase 4 | Volume de dados | Aprendizado | Opcional | Sim | Sim |
| Itemsets 3+/FP-Growth | P3 | Baixo–médio | Alta | — | Ruído | Marginal | Não | Sim | Não |

## 34. Dependências

Metric Layer → materialização → (Opportunity, Branch) → Recommendation → (IA, Feedback). RLS antecede qualquer envio de dados a terceiros. Campanha-com-produtos antecede a inteligência de promoção completa.

## 35. Riscos

1. **Regressão numérica na consolidação** — mitigar com testes de paridade (mesmo dataset, número antigo vs novo) antes de trocar a fonte das telas.
2. **Qualidade do estoque/custo** dependente de cadastro — mitigar expondo a confiança (já existe) em toda recomendação e degradando com honestidade quando falta custo (GMROI nulo em vez de inventado). Import de NF de entrada foi descartado por estar fora do foco.
3. **Alucinação/extrapolação do LLM** — mitigar com contexto fechado (só números), instrução de citar métricas, fallback determinístico e revisão humana (nada é executado automaticamente).
4. **Custo de IA descontrolado** — teto por tenant + cache + batch.
5. **Dependência de terceiro (gateway)** — manter provedor direto como caminho principal.
6. **Volume pequeno em lojas novas** — todos os detectores respeitam mínimos de observação (já é padrão no código: `MIN_PROMO_DAYS`, `MIN_CO_OCCURRENCE` etc.); a UI deve mostrar "dados insuficientes" (padrão que o PromoEffectiveness já tem).

## 36. Critérios de sucesso

- Técnica: p95 das telas de inteligência < 1s (hoje: segundos+, recalculando); zero divergência entre telas para a mesma métrica; jobs noturnos < 15 min para 100 tenants.
- Produto: ≥ 60% dos usuários semanais visitam a Central; ≥ 30% das recomendações recebem decisão (aceita/rejeitada); NPS da "utilidade das recomendações".
- Negócio (medível pelo próprio feedback loop): capital congelado ↓ nos tenants que seguem recomendações; MAPE do forecast < 35% nos produtos classe A; margem incremental positiva nas promoções recomendadas vs não recomendadas.
- IA: custo médio por tenant/mês dentro do orçado por plano; taxa de fallback < 5%; zero incidentes de vazamento de dados no contexto.

## 37. Plano de implementação (primeiros passos concretos)

1. **Semana 1–2 (Fase 0):** trocar `DATABASE_USER`; deletar `MarketBasket.tsx`, `Alerts.tsx`, `DemandForecast.tsx`, `Campaigns.tsx`, `PromoEffectiveness.tsx`; corrigir `MarketBasketService` (aplicar ou remover `minSupport/minConfidence`); unificar `SEASONAL_WINDOWS`/`resolveSeasonalWindows` com cálculo de Páscoa móvel; renomear branch→caixa no DTO/tela.
2. **Fase 1:** criar `MetricDefinitions`; migrar `WorkingCapitalService` e `AdvancedAnalyticsService` para ela com testes de paridade; remover `buildPurchaseSignal` em favor do capital; Central v0 (rota nova agregando `/alerts` + `/promo-intelligence/recommendations` + `/capital/portfolio` já existentes).
3. **Fase 2:** `ProductIntelligenceJob` (03:00) gravando `product_capital_metrics` + `product_halo_effects` + `product_seasonality` + `product_inventory_estimates`; trocar leituras; migration `campaign_products`; leitura de forecast no `buildMetric`; job de lead time por fornecedor.
4. Daí em diante, seguir o roadmap §32 com as prioridades §33.

> **Regra de ouro do plano:** nenhuma fase joga fora cálculo existente — `WorkingCapitalService`, `PromoIntelligenceService`, `PromoEffectivenessService`, `MarketBasketService` e `MLPredictionJob` são os motores; o trabalho é dar a eles persistência, integração, um modelo de oportunidade, uma voz (IA) e memória (feedback).
