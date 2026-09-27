# 09 — Roadmap priorizado

Data: 2026-09-27 · Fase: Prompt 5 · Requisitos: `08-PRODUCT-REQUIREMENTS.md`

Cada fatia é vertical (servidor + tela + teste), entrega algo observável, fica atrás de flag quando muda
comportamento visível e tem rollback. Ordem = prioridade (P0 antes de P1), depois dependência, depois risco.
Nenhuma fatia começa sem o Gate próprio (Prompt 6 → Gate 5).

## 1. Sequência

| # | Fatia | Requisitos | Valor observável | Depende de | Esforço | Risco | Rollback |
|---|---|---|---|---|---|---|---|
| F0 | Borda segura (hotfix 4) | R-01 | login barra força bruta; IA não alcança a rede interna | — | P | baixo | revert do commit `66c6869` |
| **F1** | **Ativação guiada + testes no CI** | R-03, R-05 (eventos de ativação), R-02 (etapa `mvn test`), R-09 (tela tocada) | loja nova sabe o próximo passo até a 1ª nota; nenhum deploy com teste falhando | F0 | P–M | baixo | flag `activation-checklist`; etapa de CI é aditiva |
| F2 | Integração com PostgreSQL + RLS no CI | R-02, R-27j | bugs da classe de 26/09 barrados antes do deploy | F1 | M | baixo | job separado, removível |
| F3 | Painel com números verdadeiros | R-04, R-19 (Painel), R-09 | KPIs do dia corretos, pt-BR, sem corte a 360 px | F1 | P | baixo | flag |
| V1 | Protótipo e teste com compradores | R-10 | evidência sobre confiança na quantidade | F1 (paralelo a F2/F3) | P (Claude) + recrutamento (owner) | médio | não altera produção |
| F4 | Reposição pelo vendido (leitura) | R-06, R-13 (ciclo), R-09 | Comprar responde "o que, quanto, de quem" com o mesmo número da Central | F2, V1 | M | médio | flag; migração aditiva (ciclo) |
| F5 | Sinais de venda | R-07, R-26 (estoque) | nenhuma oportunidade de estoque teórico | F4 | M | médio | flag no detector; oportunidades antigas encerradas, não apagadas |
| F6 | Aceitar → rascunho com desfazer | R-11 | decisão vira item de pedido | F4 | P–M | médio | flag |
| F7 | Enviar: WhatsApp + PDF | R-12 (parte), R-21 (canais) | pedido sai da loja pelo celular | F6 | M | baixo | flag |
| F8 | Hoje: feed único | R-08, R-09 | 5–10 decisões por impacto em vez de 147 cards; fim de Alertas | F5, F6 | M | médio | flag; `AlertGenerationJob` religável |
| F9 | 5 destinos + barra inferior | R-14, R-19 | tarefa principal a um toque | F8 | M | médio | flag de navegação; redirecionamentos |
| F10 | PWA + push "hora de pedir" | R-15 | usuário volta sem abrir o app | F7 | M | médio | desligar envio; SW com versão de desregistro |
| F11 | Leitura barata | R-16 | telas prioritárias ≤ 2,5 s no celular | F2 | M–G | médio | leitura antiga preservada atrás de flag |
| F12 | Detecção assíncrona + ingestão rápida | R-17, R-18 | sem 504; histórico em minutos | F11 | M | médio | flag |
| F13 | Fornecedores: Sheet, vínculo em lote, representante e CSV | R-13, R-12 (resto), R-20 (UX-19/20) | cadastro sem fricção; todos os canais | F7 | M | baixo | flag |
| F14 | Escada de planos aplicada | R-21 | subir de plano faz sentido; aviso de análise incompleta | F7, F10 | M | médio | limites por configuração |
| F15 | Segurança e operação | R-22 | cabeçalhos, CPF só em hash, backup externo ensaiado, correlação | F2 | M | médio (CPF: migração de dados) | etapas reversíveis; backup antes |
| F16 | Estúdio de volta | R-23 | encarte gerado no celular | F9 | M | médio (CPU) | flag existente |
| F17 | Mapa "montar a loja andando" | R-24 | loja cadastrada andando; calor útil | pesquisa com donos | G | alto (conceito novo) | tela antiga até o aceite |
| F18 | Filtro de rede | R-25 | lojas lado a lado | F8, F9 | M | médio | flag |
| F19 | Design system contínuo | R-20 | contagens do 05 caindo | cada fatia | contínuo | baixo | por tela |
| F20 | Higiene P2 | R-27 | ruído e ferramental | — | P cada | baixo | por item |

Esforço: P ≈ até 2 dias · M ≈ 3–7 dias · G > 7 dias (ordem de grandeza, não compromisso).

Marcos: **Fundação** = F0–F3 · **Núcleo A usável** = F4–F8 · **Produto no bolso** = F9–F10 · **Escala** = F11–F15 ·
**Direções B e C** = F16–F18.

## 2. Primeira fatia recomendada — F1 "Ativação guiada + testes no CI"

Por que ela: é o gargalo que o owner pôs em primeiro (D-021), resolve o achado crítico aberto de UX (UX-C04), não
depende de decisão de modelo (R-06 ainda sem validação), mexe pouco em dados (lê estados que já existem) e já
instala o mínimo de proteção (testes no pipeline) e de medição (eventos de ativação) que todas as fatias seguintes usam.

Escopo proposto (a detalhar no Prompt 6):
- servidor: endpoint de estado de ativação do mercado (pareamento, 1ª nota, 1ª análise, dias/notas coletados);
  tabela `product_events` (migração nova) só com os eventos de ativação;
- tela: checklist no Painel quando não há notas, e "coletando" até haver dados; nunca "Todos os produtos em dia" sem dados;
- CI: etapa `mvn test` antes do build no `deploy-pdv2cloud-web.yml`;
- testes: unitários do estado, teste do endpoint com a role de aplicação, Playwright a 360/1440 px, axe na tela;
- fora: telemetria além da ativação, push, redesign do Painel.

## 3. Matriz de rastreabilidade

ACHADO → REQUISITO → FATIA → ARQUIVOS PROVÁVEIS → TESTE → MÉTRICA → STATUS

| Achado | Req. | Fatia | Arquivos prováveis | Teste | Métrica | Status |
|---|---|---|---|---|---|---|
| UX-C01 login 500 | R-02 | F2 | `AuthController` | integração RLS login | login 200 | FEITO (D-028); regressão em F2 |
| UX-C02 SQL no 500 | R-02 | F2 | `GlobalExceptionHandler` | unitário | 0 SQL em resposta | FEITO (D-028) |
| UX-C03 landing falsa | — | F0 | `Landing.tsx` | visual | — | FEITO (D-029) |
| UX-C04 painel vazio sem guia | R-03 | F1 | `Dashboard.tsx`, novo `ActivationService` | E2E 360 px | tempo cadastro → 1ª nota | PLANEJADO |
| UX-C05 calor 500 | R-24 | F17 | `StoreLayoutService` | integração | % sem categoria | SQL FEITO (D-029); categorias em F17 |
| UX-C06 "por mês" | R-21 | F14 | `PublicPlanController` | visual | — | FEITO (D-029) |
| UX-C07 1ª nota trava | R-02 | F2 | `PlanService` | integração RLS 1ª/2ª nota | tempo da 1ª nota | FEITO (D-028); regressão em F2 |
| UX-01 KPIs não são do dia | R-04 | F3 | `AnalyticsService`, `Dashboard.tsx` | unitário com notas conhecidas | — | PLANEJADO |
| UX-02 corte 360 px Painel | R-19 | F3 | `Dashboard.tsx` | `scrollWidth` | 0 rolagem horizontal | PLANEJADO |
| UX-03 atenção sem motivo | R-08 | F8 | `IntelligenceCenter.tsx`, `OpportunityEngine` | E2E | decisões por sessão | PLANEJADO |
| UX-04 LCP Painel | R-16 | F11 | `AdvancedAnalyticsService` | Playwright LCP | LCP ≤ 2,5 s | PLANEJADO |
| UX-05 147 cards | R-08 | F8 | `IntelligenceCenter.tsx`, `OpportunityController` | E2E altura | nós < 800 | PLANEJADO |
| UX-06 KPI duplicado | R-08 | F8 | idem | visual | — | PLANEJADO |
| UX-07 número americano | R-04 | F3 | textos do `OpportunityEngine`, formatador | unitário de formatação | 0 ocorrências | PLANEJADO |
| UX-08 detectar 504 | R-17 | F12 | `OpportunityController`, cron | integração | 0 504 | PLANEJADO |
| UX-09 Pedido × Central | R-06 | F4 | `PurchasePlanService`, `ShoppingList.tsx` | unitário + E2E | mesmo número nas duas telas | PLANEJADO |
| UX-10 capital R$ 0 | R-07 | F5 | `CapitalPlanTab.tsx`, `WorkingCapitalService` | E2E | — | PLANEJADO |
| UX-11 Promoções estoque/margem/abas | R-26, R-19 | F5, F3/F19 | `Promocoes.tsx` | visual + axe | — | PLANEJADO |
| UX-12 LCP Promoções | R-16 | F11 | `PromoIntelligenceService` | Playwright | LCP ≤ 2,5 s | PLANEJADO |
| UX-13 mapa Alt+clique | R-24 | F17 | `StoreMap.tsx` | E2E 360 px | cadastro sem teclado | PLANEJADO |
| UX-14 cartão não é link; LCP catálogo | R-20, R-16 | F19, F11 | `Products.tsx` | axe + teclado | LCP | PLANEJADO |
| UX-15 contraste detalhe | R-20, R-16 | F19, F11 | `ProductDetail.tsx` | axe | 0 `serious` | PLANEJADO |
| UX-16 alvos < 44 px, h1 | R-09, R-20 | F1…F19 | `Button.tsx`, `tailwind.css` | medição de alvos | % ≥ 44 px | PLANEJADO |
| UX-17 aba Alertas | R-08, R-14 | F8 | `AlertGenerationJob`, `Dashboard.tsx` | E2E | 0 chamadas de alerta | PLANEJADO |
| UX-18 super admin | R-27i | F20 | telas `SuperAdmin*` | axe | — | PLANEJADO (P2) |
| UX-19 fornecedor em 2 passos | R-13, R-20 | F13 | `SupplierModal.tsx` | teclado/Esc | tempo do cadastro | PLANEJADO |
| UX-20 placeholder como rótulo | R-20 | F13 | `Promocoes.tsx` | axe `label` | — | PLANEJADO |
| DS-01 cores fixas | R-20 | F19 | telas tocadas | script de contagem | literais por tela | PLANEJADO |
| DS-02 estilo inline | R-20 | F19 | idem | idem | `style={{` por tela | PLANEJADO |
| DS-03 texto pequeno | R-09 | F1…F9 | `tailwind.css` | medição | 0 texto < 12 px | PLANEJADO |
| DS-04 foco removido | R-09 | F1 | `tailwind.css` | teclado | foco visível | PLANEJADO |
| DS-05 modal ignorado | R-20 | F13, F19 | `Modal.tsx`, modais próprios | Esc/foco | — | PLANEJADO |
| DS-06 botão cru | R-20 | F19 | `Button.tsx` | contagem | — | PLANEJADO |
| DS-07 `common` × `ui` | R-27h | F20 | `components/ui`, `common` | contagem | 1 conjunto | PLANEJADO (P2) |
| DS-08 alvos públicos | R-09 | F1 | `Login.tsx`, `Register.tsx` | medição | 100% ≥ 44 px | PLANEJADO |
| DS-09 contraste | R-20, R-09 | F1, F19 | tokens | axe | 0 `serious` | PLANEJADO |
| DS-10 campos sem rótulo | R-09 | F1 | `Login.tsx`, `Register.tsx` | axe `label` | 0 | PLANEJADO |
| DS-11 `<main>`/h1 | R-27h | F20 | layout | axe | 0 | PLANEJADO (P2) |
| DS-12 raios | R-27h | F20 | `tailwind.css` | contagem | — | PLANEJADO (P2) |
| SEC-00 | R-02 | F2 | — | integração RLS | — | FEITO (D-028); regressão em F2 |
| SEC-01 SSRF | R-01 | F0 | `OutboundUrlGuard`, `LlmClient`, `AiCredentialService` | unitário | — | FEITO (D-032) |
| SEC-02 login sem limite | R-01 | F0 | `RateLimitFilter` | unitário + produção | 429 | FEITO (D-032) |
| SEC-03 X-Forwarded-For | R-01 | F0 | `RateLimitFilter`, `nginx.vps.conf` | unitário | — | FEITO (D-032) |
| SEC-04 CPF em claro | R-22 | F15 | `InvoiceProcessingService`, migração | integração | 0 CPF em claro | PLANEJADO |
| SEC-05 cabeçalhos | R-22 | F15 | `deploy-web.sh`, `nginx.vps.conf` | `curl -I` | — | PLANEJADO |
| SEC-06 Swagger | R-27c | F20 | `SecurityConfig` | integração | — | PLANEJADO (P2) |
| SEC-07 `/auth/me` 403 | R-27a | F20 | `AuthContext`, `SecurityConfig` | E2E | — | PLANEJADO (P2) |
| SEC-08 ingest 500 | R-27b | F20 | `IngestController` | integração | — | PLANEJADO (P2) |
| SEC-09 contas de teste | R-27d | F20 | secrets do Actions | manual | — | PLANEJADO (P2) |
| SEC-10 contas descartáveis | R-27e | F20 | dados de produção | manual | — | ABERTO (owner não autorizou no Gate 3B) |
| PERF-01 cálculo na leitura | R-16 | F11 | analytics, promo | tempo de endpoint | ≤ 300 ms | PLANEJADO |
| PERF-02 LCP | R-16 | F11 | idem | Playwright | ≤ 2,5 s | PLANEJADO |
| PERF-03 detect > 60 s | R-17 | F12 | `OpportunityEngine` | integração | 0 504 | PLANEJADO |
| PERF-04 ingestão lenta | R-18 | F12 | `InvoiceProcessingService` | tempo por nota | ≤ 0,1 s | PLANEJADO |
| PERF-05 147 cards | R-08 | F8 | `IntelligenceCenter.tsx` | nós DOM | < 800 | PLANEJADO |
| PERF-06 bundle | — | — | — | build | ≤ 120 KB | OK (manter no orçamento) |
| OPS-01 testes fora do CI | R-02 | F1 | `deploy-pdv2cloud-web.yml` | pipeline vermelho com teste quebrado | — | PLANEJADO |
| OPS-02 sem teste com RLS | R-02 | F2 | novo módulo de teste | idem | — | PLANEJADO |
| OPS-03 backup | R-22 | F15 | `deploy-web.sh` | ensaio de restauração | tempo de restauração | PLANEJADO |
| OPS-04 observabilidade | R-22 | F15 | filtro de correlação, logback | log | — | PLANEJADO |
| OPS-05 cron | — | — | — | — | — | OK |
| OPS-06 healthcheck | — | — | — | — | — | OK |
| OPS-07 DevSeeder | R-27f | F20 | `DevSeeder` | subir perfil dev | — | PLANEJADO (P2) |
| Risco 2 frontend sem lint/typecheck | R-27g | F20 | `package.json`, workflow | CI | — | PLANEJADO (P2) |
| Risco 3 módulos desligados | R-23 / NÃO FAZER | F16 | ofertas; preços estaduais fica | — | — | ofertas PLANEJADO; preços estaduais NÃO FAZER |
| Risco 4 telas órfãs | R-14 | F9 | `App.tsx`, `SupplierOrders.tsx` | navegação | 5 destinos | PLANEJADO |
| Risco 7 sem telemetria | R-05 | F1 (ativação), fatias seguintes | `product_events` | E2E de eventos | funil | PLANEJADO |
| Risco 8 decisão sem ação | R-11 | F6 | `RecommendationEngine` | integração RLS | aceite → item | PLANEJADO |
| Risco 11 pedido não enviado | R-12 | F7, F13 | `SupplierOrderService` | E2E | pedidos enviados/semana | PLANEJADO |
| Risco 12 estoque teórico | R-07 | F5 | `CapitalOpportunityDetector` | unitário por sinal | — | PLANEJADO |
| Risco 13 cota corta semana | R-21 | F14 | `PlanService` | integração | aviso exibido | PLANEJADO |
| Risco 14 sem PWA | R-15 | F10 | `vite.config`, SW, push | dispositivo real | push aberto | PLANEJADO |
| 06 §3 agregado só "ontem" | R-16 | F11 | `DailyAggregationJob` | integração | — | PLANEJADO |
| 06 §3 outros `REQUIRES_NEW` | R-27j | F2 | serviços com `REQUIRES_NEW` | integração RLS | — | PLANEJADO |
| 02 §3 validação da quantidade | R-10 | V1 | protótipo | teste com usuários | taxa de sucesso | PLANEJADO |
| D-013 estúdio | R-23 | F16 | ofertas | E2E | encartes gerados | PLANEJADO |
| D-017 rede | R-25 | F18 | `NetworkIntelligenceService` | integração RLS | — | PLANEJADO |
| D-022 mapa | R-24 | F17 | `StoreMap.tsx` | teste com donos | — | PLANEJADO |

Riscos do `PROJECT_STATE` sem linha própria: 1 (stack ≠ protocolo: informativo, adaptado nos documentos), 5 (crawler:
fechado por D-008), 6 (= SEC-06), 9 (= UX-C04), 10 (= UX-17/R-08), 15 (FEITO), 16 (= SEC-01/02), 17 (= SEC-09),
18 (= OPS-07), 19 (= SEC-10), 20 (= OPS-01/02), 21 (= SEC-04/OPS-03).

## 4. Verificação de cobertura

| Conjunto | Total | Com fatia | FEITO | OK (sem ação) | NÃO FAZER / aberto por decisão | Sem destino |
|---|---|---|---|---|---|---|
| UX críticos (C01–C07) | 7 | 7 | 5 (+C05 parcial) | 0 | 0 | **0** |
| UX (01–20) | 20 | 20 | 0 | 0 | 0 | **0** |
| DS (01–12) | 12 | 12 | 0 | 0 | 0 | **0** |
| SEC (00–10) | 11 | 10 | 4 | 0 | 1 (SEC-10, aguardando owner) | **0** |
| PERF (01–06) | 6 | 5 | 0 | 1 (PERF-06) | 0 | **0** |
| OPS (01–07) | 7 | 5 | 0 | 2 (OPS-05/06) | 0 | **0** |
| Riscos do PROJECT_STATE (1–21) | 21 | 12 diretos + 9 equivalentes/fechados | — | — | 1 parcial (preços estaduais NÃO FAZER) | **0** |
| **Achados auditados** | **63** | **59** | **9** | **3** | **1** | **0** |

Conta: 7 + 20 + 12 + 11 + 6 + 7 = 63 achados; 59 com fatia + 3 OK + 1 aguardando decisão = 63. Nenhum achado
aceito fica sem destino.
