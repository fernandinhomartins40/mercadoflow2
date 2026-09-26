# 01 — O produto que existe hoje

Data: 2026-09-26 · Fase: Prompt 1 · Base: `00-REPOSITORY-INVENTORY.md`, decisões D-003…D-009

Método: leitura de código, schema, cópias da interface e planos anteriores. **Nenhum fluxo foi
executado em navegador**; comportamentos de tela são inspeção de código. Os planos anteriores
(`PLANO_V2.md`, `PLANO_EVOLUCAO_INTELIGENCIA_MERCADOFLOW.md`) foram usados como declaração de intenção
e só viraram `CONFIRMADO` quando o código comprova.

Legenda: `CONFIRMADO` · `INFERIDO` · `DESCONHECIDO` · `DECISÃO NECESSÁRIA`.

---

## 1. Resumo em uma frase

O MercadoFlow lê as **vendas reais do caixa** (XML de NFC-e capturado por um agente no PDV) de um
supermercado independente e as transforma em **oportunidades priorizadas com recomendação** (comprar,
promover, liquidar, ajustar preço). O ciclo foi construído até **registrar a decisão e medir o
resultado**, mas a decisão **não se converte em ação** dentro do produto. `CONFIRMADO`

## 2. Quem usa e em qual contexto

| Ator | Contexto | Evidência | Status |
|---|---|---|---|
| **Dono do mercado independente** (MARKET_OWNER), comprador principal | Loja única, com PDVs emitindo NFC-e; decide compra, preço e promoção | D-006; `AuthService.register` cria `Market` com `PlanType.FREE`; regra que bloqueia uma conta gratuita por CNPJ adicional | CONFIRMADO |
| Gerente da loja (MARKET_MANAGER) | Opera inteligência, pedidos e promoções; não mexe em billing, IA nem rede | `@PreAuthorize` em Billing/AiSettings/Network só OWNER/ADMIN | CONFIRMADO |
| Rede de lojas | 2+ lojas com o mesmo CNPJ raiz; plano REDE com contrato | `NetworkContract`, `NetworkIntelligenceController`, plano `REDE` | CONFIRMADO no código; é extensão, não núcleo (D-006) |
| Indústria/fabricante (INDUSTRY_USER) | Consumiria dados agregados | 1 endpoint, sem tela | CONFIRMADO: não implementado para uso (D-004) |
| Operador da plataforma (SUPER_ADMIN) | Vende e cobra assinaturas, CRM de clientes, cura o catálogo global e o crawler | 77 endpoints de super admin, 8 telas | CONFIRMADO |
| Agente PDV (máquina) | Envia notas do caixa | `/api/v1/ingest` com HMAC | CONFIRMADO |
| Cliente final do mercado | Não usa o produto; aparece só como CPF com hash e salt por tenant, sob k-anonimato ≥ 5 | `PLANO_EVOLUCAO…` §"Base de clientes"; `CustomerIntelligenceService` | CONFIRMADO (existência); política LGPD a auditar no Prompt 4 |

## 3. Problemas que cada perfil tenta resolver

| Perfil | Problema | Status |
|---|---|---|
| Dono | "O que eu preciso comprar, quanto, e o que está parado me custando capital?" — pergunta central declarada no código e nos planos | CONFIRMADO (`PLANO_EVOLUCAO` §régua; tipo `OPORTUNIDADE_DE_COMPRA` = 68% das oportunidades no mercado de teste) |
| Dono | "Que promoção fazer, e ela funcionou?" | CONFIRMADO (`PromoIntelligenceService`, `PromoEffectivenessService`, `CampaignImpactService`) |
| Dono | "Como foi minha semana?" | CONFIRMADO (`WeeklyDigestJob`, `/app/rede`) |
| Dono | Divulgar ofertas (encartes/posts) | CONFIRMADO no código (estúdio de ofertas); **desligado por flag**; volta ao produto (D-007) |
| Dono | Organizar a loja fisicamente | CONFIRMADO (`/app/mapa-loja`, `StoreLayout`); valor recorrente DESCONHECIDO |
| Super admin | Adquirir, cobrar e reter clientes | CONFIRMADO (assinaturas, dunning, CRM) |

## 4. Núcleo: entidades, estados e ações

| Objeto | Estados | Quem muda | Evidência | Status |
|---|---|---|---|---|
| Invoice (NFC-e) | aceita / rejeitada (`InvoiceRejection`) | agente → ingest | `InvoiceProcessingService` | CONFIRMADO |
| Opportunity | `NOVA → VISTA → EM_ACAO → CONCLUIDA`, `DESCARTADA`, `EXPIRADA` | job 03:30, refresh adaptativo (5 min), usuário (ver, descartar), decisão da recomendação | `Opportunity.Status`, `OpportunityEngine` | CONFIRMADO |
| Recommendation | `PROPOSTA → ACEITA / REJEITADA / EXECUTADA`; ações `COMPRAR, PROMOVER, LIQUIDAR, AJUSTAR_PRECO, REPOSICIONAR, INVESTIGAR` | usuário na Central de Inteligência | `RecommendationEngine.decide` | CONFIRMADO |
| RecommendationOutcome | pendente → medido (semanal) | `OutcomeEvaluationJob` (segunda 04:00) | `OutcomeEvaluationService.createPending` | CONFIRMADO |
| Alert | tipos × prioridades; gerado de hora em hora | job | `AlertGenerationJob` | CONFIRMADO; convive com Opportunity (dois conceitos para "atenção") |
| SupplierOrder | `RASCUNHO → ENVIADO → ENTREGUE`, `CANCELADO` | usuário no Pedido inteligente | `SupplierOrder.Status`, `SupplierOrderService:173` | CONFIRMADO |
| Campaign / PromotionWindow | janela `SUSPECTED → CONFIRMED → CLOSED` (detectada nas vendas) | job e usuário | `PromotionWindowStatus` | CONFIRMADO |
| OfferGenerationJob / RenderOutput | fila de render | usuário (estúdio) | entidades de oferta | CONFIRMADO; UI desligada |
| Market (assinatura) | `PENDING, ACTIVE, TRIAL, PAST_DUE, SUSPENDED, CANCELLED` | Stripe/super admin/dunning | `MarketBillingStatus` | CONFIRMADO |

## 5. Fluxo principal atual (core loop)

```text
PDV emite NFC-e ─► agente lê XML ─► /ingest ─► notas e itens
   ─► jobs: agregação 02:00 · cesta 02:30 · produto 03:00 · oportunidades 03:30
            + refresh adaptativo a cada 5 min (lojas com venda nova)
   ─► Painel do dia (alertas + CTAs)  ·  Central de Inteligência (oportunidade + recomendação)
   ─► usuário ACEITA / REJEITA ─► oportunidade EM_ACAO + medição agendada
   ─► [ruptura] a ação acontece FORA do sistema, ou o usuário vai manualmente
       ao Pedido inteligente / Promoções e refaz a escolha do produto
   ─► OutcomeEvaluationJob mede o resultado ─► aba "Resultados"
```

| Etapa | Status | Evidência |
|---|---|---|
| Captura de vendas | CONFIRMADO (código); em campo DESCONHECIDO (D-009) | agente + ingest |
| Detecção e priorização | CONFIRMADO | 3 detectores + engine; `priority_score` |
| Explicação | CONFIRMADO: evidência numérica + texto determinístico; IA opcional (BYOK) | D-005, `OpportunityInterpreter` |
| **Decisão → ação** | **Ruptura confirmada**: `decide()` só grava status, move para EM_ACAO e cria outcome pendente. Nada vai para o pedido nem vira promoção | `RecommendationEngine.java:257-291`; `IntelligenceCenter.tsx:395-405` |
| CTAs do Painel | levam à tela genérica **sem o produto/contexto** (`navigate('/app/lista-compras')`) | `Dashboard.tsx:154-252, 386` |
| Execução da compra | Pedido a fornecedor montado à mão; "ENVIADO" é só um status — **não há envio** (e-mail, WhatsApp, PDF) | `SupplierOrderService:173`; nenhuma ocorrência de envio |
| Execução da promoção | Promoções não conversa com o estúdio de encartes (0 referências) e o estúdio está desligado | `Promocoes.tsx`, `features.ts` |
| Aprendizado | CONFIRMADO: outcomes + acurácia de previsão | `/outcomes`, `/outcomes/forecast-accuracy` |

## 6. Jornada entrada → ativação → valor → recorrência → retenção

| Etapa | O que existe | Lacuna | Status |
|---|---|---|---|
| Entrada | Landing, cadastro com CNPJ, escolha de plano (FREE vai direto a `/app`) | — | CONFIRMADO |
| Instalação | Download do agente, pareamento por código, chaves de API em "PDVs e agente" | Nenhum guia leva do cadastro à instalação | CONFIRMADO |
| **Ativação** (1ª nota → 1ª oportunidade) | Carga histórica livre e cota semanal (planos anteriores) | **Sem onboarding.** O Painel não verifica se há agente ou nota: loja sem dado nenhum lê "Todos os produtos em dia. Nenhum alerta pendente." — falso positivo de saúde | CONFIRMADO (`Dashboard.tsx:472, 629`; busca por onboarding/checklist sem resultado no app do mercado) |
| Valor | Oportunidade com recomendação, impacto em R$, confiança | Valor percebido depende de fechar a ação (ver ruptura) | CONFIRMADO / INFERIDO |
| Recorrência | Refresh a cada 5 min, alertas por hora, resumo semanal | Não há canal fora do app (e-mail/WhatsApp/push); o usuário precisa lembrar de abrir | CONFIRMADO (nenhum envio de notificação encontrado) · INFERIDO para o impacto |
| Retenção/monetização | Escada FREE → ESSENCIAL (R$ 197) → PROFISSIONAL (R$ 397) → REDE; "passado grátis, futuro pago"; bloqueado aparece contado | Stripe desligado por padrão; upgrade manual | CONFIRMADO |

## 7. Valor recorrente × cadastro

| Área | Classificação | Motivo |
|---|---|---|
| Central de Inteligência, Painel do dia, Resumo semanal, Pedido inteligente | **Valor recorrente** | mudam com as vendas; respondem "o que fazer" |
| Catálogo (desempenho, combos, previsão), Clientes, Promoções (efetividade) | Valor analítico | consulta; recorrência DESCONHECIDA |
| Pergunte aos dados | Valor sob demanda; pago/BYOK | — |
| Mapa da loja | Majoritariamente cadastro (layout) com sugestões | recorrência DESCONHECIDA |
| PDVs e agente, Conta, Plano | Cadastro/configuração | necessário, não é valor |
| Estúdio de ofertas | Ferramenta de execução (produz o encarte) | desligado; D-007 |

## 8. Completo, parcial, órfão, duplicado

| Funcionalidade | Situação | Evidência |
|---|---|---|
| Oportunidade → recomendação → decisão → resultado | **Parcial**: falta decisão → ação | §5 |
| Alertas × Oportunidades | **Duplicado conceitual**: dois modelos de "atenção"; Painel usa alertas, Central usa oportunidades. O plano previa alerta como notificação da oportunidade (FK) | `AlertGenerationJob` vs `OpportunityEngine`; `PLANO_EVOLUCAO` §9 |
| Painel do dia × Central de Inteligência | **Sobreposição**: ambos respondem "o que precisa de atenção" | hints do menu |
| Tela `SupplierOrders` | **Órfã e duplicada** (já existe em Pedido inteligente) | inventário §5 |
| `OfferJobs`, `OfferTemplates`, `OffersCampaigns`, `OffersDashboard` | **Órfãs** (substituídas pelo `features/offers-studio`) | inventário §5 |
| Estúdio de ofertas | **Completo no código, sem entrada** (flag) | `features.ts` |
| Preços estaduais | **Construído, desligado**; detector `PREÇO_ACIMA_DO_MERCADO` planejado | `features.ts`, plano §9 |
| Indústria | **Esqueleto** | 1 endpoint |
| `RISCO_DE_RUPTURA` | **Existe só no vocabulário da UI**; nenhum detector o gera | `PLANO_EVOLUCAO` §régua (dado do mercado de teste) |
| Manual do usuário | **Desatualizado** (fala de telas que viraram redirect) | `docs/user-manual.md` |
| README | Nome antigo "PDV2Cloud" | `README.md` |

## 9. Regras de negócio implementadas (amostra verificada)

| Regra | Evidência | Status |
|---|---|---|
| Conta gratuita única por CNPJ raiz; 2ª loja pede plano de rede | `AuthService.register:73-89` | CONFIRMADO |
| Novo mercado nasce FREE e ACTIVE | `AuthService.register:103-104` | CONFIRMADO |
| Plano: janela de análise 90/365/730 dias; previsão 7/30/90 dias; teto de orçamento R$ 5.000 no FREE; tipos de oportunidade reservados (tracionador, combo) | `PlanService.clampWindow`, `PlanGatingTest` | CONFIRMADO (testes existem; não executados) |
| Bloqueado aparece contado, nunca oculto | `bloqueadasPorTipo` | INFERIDO (plano + DTO; tela não observada) |
| Aceitar congela a baseline e agenda a medição; rejeitar descarta com motivo | `RecommendationEngine.decide` | CONFIRMADO |
| Pedido ENVIADO não pode mais ser editado | `ShoppingList.tsx:713` | CONFIRMADO |
| IA só redige números já calculados; fallback determinístico | D-005 | CONFIRMADO |
| Isolamento por mercado (RLS + asserts) | inventário §6 | CONFIRMADO |

## 10. Eventos importantes (existentes)

`InvoiceIngested/Rejected` (tabelas), `Opportunity.statusChangedAt/By`, `Recommendation.decidedAt/By/Note`,
`RecommendationOutcome`, `AuditLog` (assíncrono), `SubscriptionEvent`, `StripeProcessedEvent`,
`DunningLog`, `AiUsageLog`, `CustomerActivity` (CRM interno). **Não há eventos de uso de produto**
(tela vista, CTA clicado, tempo até a 1ª oportunidade). `CONFIRMADO`

## 11. Métricas de produto possíveis (sem inventar valores)

| Métrica | Fonte já existente | Status |
|---|---|---|
| Tempo cadastro → 1ª nota → 1ª oportunidade | `Market.createdAt`, `Invoice`, `Opportunity.createdAt` | calculável; valor DESCONHECIDO |
| Taxa de decisão (decididas / exibidas) | `Recommendation.status` | calculável |
| Taxa de aceite e acerto (outcome positivo) | `RecommendationOutcome` | calculável |
| Acurácia de previsão | endpoint existente | calculável |
| Lojas com nota nos últimos 7 dias (saúde da ingestão) | `Invoice` | calculável |
| Uso de telas / CTAs | **sem telemetria** | DESCONHECIDO |

Nenhum valor real existe: não há piloto (D-009). Os números do mercado de teste citados nos planos não servem como evidência de uso.

## 12. Perguntas que o repositório não responde

1. `DECISÃO NECESSÁRIA` — Quando o dono aceita "comprar X unidades", o sistema deve **criar/atualizar o rascunho do pedido** automaticamente, ou só sugerir com um clique?
2. `DECISÃO NECESSÁRIA` — Como o pedido chega ao fornecedor na vida real (WhatsApp, e-mail, representante presencial, portal)? Isso define se "enviar" deve sair do app.
3. `DESCONHECIDO` — Com que frequência o dono de loja independente decide compra (diária, semanal, por visita do representante)? Define se o canal certo é o painel ou uma notificação.
4. `DECISÃO NECESSÁRIA` — Com D-007, o encarte deve nascer **da oportunidade de promoção** (fluxo guiado) ou ficar como ferramenta independente no menu?
5. `DESCONHECIDO` — Quem instala o agente na loja: o dono, o técnico do PDV ou o MercadoFlow? Isso muda o onboarding.
