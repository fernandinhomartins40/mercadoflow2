# 03 — Usuários, jobs-to-be-done e jornadas

Data: 2026-09-26 · Fase: Prompt 1 · Base: `01-CURRENT-PRODUCT.md`

Legenda: `CONFIRMADO` · `INFERIDO` · `DESCONHECIDO` · `DECISÃO NECESSÁRIA`.
Não há usuário real (D-009): **nenhuma jornada foi observada**. As jornadas abaixo são reconstruídas do
código e marcadas como tal.

---

## 1. Atores e permissões

| Ator | Pode | Não pode | Evidência | Status |
|---|---|---|---|---|
| Dono (MARKET_OWNER) | tudo do mercado: inteligência, pedidos, promoções, IA/BYOK, billing, rede | outros mercados | `SecurityConfig`, `@PreAuthorize` | CONFIRMADO |
| Gerente (MARKET_MANAGER) | inteligência, pedidos, promoções, exportação, PDVs, chaves do agente | billing, IA, rede | idem | CONFIRMADO |
| Admin (ADMIN) | acesso administrativo, catálogo global, preços estaduais | área super admin | idem | CONFIRMADO |
| Super admin | plataforma inteira | — | idem | CONFIRMADO |
| Agente (AGENT) | enviar notas, heartbeat | qualquer leitura de negócio | `/agent/**`, `/ingest/**` | CONFIRMADO |
| Indústria | 1 endpoint | — | D-004 | CONFIRMADO (sem uso) |

## 2. Jobs-to-be-done do cliente principal (dono de mercado independente, D-006)

| # | Quando… | Quero… | Para… | Onde o produto atende | Status |
|---|---|---|---|---|---|
| J1 | vou fazer o pedido ao fornecedor/representante | saber **o que e quanto comprar** sem faltar nem sobrar | não perder venda nem empatar capital | Central (OPORTUNIDADE_DE_COMPRA) + Pedido inteligente (`PurchasePlanService`) | CONFIRMADO; **ruptura entre os dois** |
| J2 | olho o estoque/prateleira | saber **o que está parado** e como liberar o capital | ter caixa | CAPITAL_PARADO, EXCESSO_DE_ESTOQUE, LIQUIDAR | CONFIRMADO |
| J3 | quero movimentar a loja | escolher **o que promover** e divulgar | vender mais e atrair gente | Promoções + oportunidade de promoção + estúdio de encartes (desligado) | PARCIAL (D-007) |
| J4 | termino a promoção | saber **se funcionou** | não repetir erro | `PromoEffectivenessService`, `CampaignImpactService`, outcomes | CONFIRMADO |
| J5 | começo a semana | entender **como foi a semana** | ajustar o rumo | Resumo semanal | CONFIRMADO |
| J6 | tenho uma dúvida pontual | perguntar em português | não depender de relatório | Pergunte aos dados (BYOK/pago) | CONFIRMADO |
| J7 | acabei de assinar | ver valor **rápido** | justificar a instalação e o preço | — | **não atendido**: sem onboarding |

## 3. Jornada reconstruída (dono, plano FREE)

| Etapa | Passo | Tela/rota | Atrito identificado | Status |
|---|---|---|---|---|
| Descoberta | Landing | `/` | — | CONFIRMADO |
| Cadastro | nome, loja, CNPJ, plano | `/register` → `/app` | FREE cai direto no Painel | CONFIRMADO |
| Primeiro contato | Painel do dia **sem dados** | `/app` | mensagem "Todos os produtos em dia" com loja vazia; nada aponta para instalar o agente | CONFIRMADO |
| Instalação | achar "PDVs e agente" (seção Configuração, 10º item do menu), baixar, instalar no PDV, parear | `/app/pdvs`, `/app/download-agente`, `/parear-agente` | depende de acesso físico ao PDV; quem instala é DESCONHECIDO | CONFIRMADO / DESCONHECIDO |
| Espera | notas chegam; oportunidades só após jobs (5 min adaptativo ou 03:30) | — | usuário não sabe que precisa esperar nem quando volta | INFERIDO |
| Primeiro valor | Central lista oportunidades com impacto em R$ | `/app/inteligencia` | — | CONFIRMADO |
| Decisão | aceita a recomendação | `/app/inteligencia` | aceitar **não faz nada visível** além de mudar o status | CONFIRMADO |
| Ação | vai ao Pedido inteligente e remonta o pedido | `/app/lista-compras` | contexto perdido; "Enviar" só muda status | CONFIRMADO |
| Resultado | na semana seguinte, aba de resultados | Central / outcomes | depende de o usuário voltar | CONFIRMADO |
| Recorrência | abrir o app por iniciativa própria | — | sem notificação externa | CONFIRMADO |
| Upgrade | vê bloqueado contado; vai a Plano e consumo | `/app/planos` | cobrança Stripe desligada; upgrade manual | CONFIRMADO |

## 4. Core loop atual × core loop que o código sugere

```text
ATUAL:    vendas ─► oportunidade ─► recomendação ─► decisão (registro) ─┐
                                                                         ├─► resultado
          (ação feita fora, sem vínculo) ────────────────────────────────┘

SUGERIDO: vendas ─► oportunidade ─► recomendação ─► decisão ─► AÇÃO no produto
          (rascunho de pedido / promoção + encarte) ─► resultado medido ─► próxima recomendação
```

O loop sugerido é **INFERIDO** do próprio código (`ActionType`, `EXECUTADA`, outcomes) e do plano
anterior (§10: "COMPRAR → adiciona à Lista de Compras"). Não é requisito até o Gate 2.

## 5. Hipótese "fluxo com direção" — primeira leitura (validação completa no Prompt 2)

| Parte da hipótese | Evidência | Leitura |
|---|---|---|
| "Não ser só cadastro e telas" | Oportunidades, recomendações e outcomes existem | **Já é mais que cadastro** — CONFIRMADO |
| "Mostrar o que acontece e o que exige atenção" | Painel + Central + alertas | Existe, mas **fragmentado em dois conceitos** (alerta × oportunidade) |
| "Próxima melhor ação, com explicação" | recomendação + evidência + texto | Existe |
| "Com controle e possibilidade de desfazer" | aceitar/rejeitar existe; a API aceita redecidir, mas proíbe voltar a PROPOSTA (`OpportunityController:217`) e a tela não oferece desfazer | PARCIAL — CONFIRMADO |
| Fechar em ação | decisão não gera ação | **Principal lacuna** |

Conclusão preliminar: a hipótese **combina com o domínio**. O gargalo não é inventar inteligência
nova, e sim **fechar o último metro**: decisão → ação → resultado. A ativação (J7) é a segunda lacuna.
`INFERIDO`: a decisão final é do owner no Gate 2.

---

## Correções do Gate 1 (owner, 2026-09-26 — D-015…D-023)

- **Personas:** (1) **Comprador/encarregado**, que opera a compra diariamente pelo celular; (2) **Dono**, que paga, acompanha resultado e decide promoção; (3) **Dono de rede pequena** (2–3 lojas), que compara lojas. D-016, D-017, D-018.
- **J1 reescrito:** "Quando vou fazer o pedido, quero saber o que e quanto comprar **com base em como cada produto está vendendo** (velocidade, tendência, sazonalidade, cesta), sem precisar controlar estoque." D-019.
- **J2 reescrito:** "o que está parado" passa a significar **produto com venda caindo ou sem giro na loja**, não "estoque parado". O conceito de capital parado sem estoque confiável é DECISÃO NECESSÁRIA no Prompt 2.
- **J7 é prioridade 1:** ativação autoexplicativa, feita pelo próprio dono (D-014, D-021).
- **Recorrência:** o valor chega por **push no celular** (D-020); pedido sai por WhatsApp/PDF/portal/lista para o representante (D-012).
- **Jornada:** a etapa "Primeiro contato" deixa de ser o Painel vazio e passa a ser um checklist de ativação até a primeira recomendação.
