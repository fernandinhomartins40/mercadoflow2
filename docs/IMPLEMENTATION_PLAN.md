# Plano de Implementação

Data: 2026-09-27 · Protocolo: `PROTOCOLO_UNIVERSAL_PRODUTO_V2.md` · Base de evidência: código atual +
`docs/mercadoflow-product/00…11` (análise de produto já feita, 63 achados, decisões D-001…D-035).

## Resumo da aplicação

MercadoFlow: SaaS multi-tenant para supermercado independente e rede pequena. Um agente no PDV envia as NFC-e
de venda; o backend (Spring Boot 4 / Java 17, JPA + Flyway, PostgreSQL com RLS) agrega as vendas em jobs
noturnos e gera oportunidades → recomendações (comprar, promover, liquidar…). Frontend React 18 + Vite +
Tailwind 4, celular primeiro (D-018). Deploy só por GitHub Actions para uma VPS (Docker Compose + Nginx).
Quem opera é o comprador/encarregado, pelo celular (D-016). Não há cliente real ainda (D-009).

Estado encontrado no repositório:
- Fatia **F1 (ativação guiada + testes no CI)** implementada mas **não validada nem commitada**.
- 21 arquivos de frontend com trabalho local do owner (modais, botões, tabelas, `tailwind.css`): **preservados**.

## Principais problemas encontrados

| # | Prioridade | Problema | Evidência |
|---|---|---|---|
| 1 | P0 | Painel "do dia" mostra somas de 90 dias rotuladas como "Faturamento"/"Transações", com crescimento contra os 90 dias anteriores sem dizer o período (UX-01) | `AdvancedAnalyticsService.getCockpit` (janela 90 d); `Dashboard.tsx` `KPICard label="Faturamento"` |
| 2 | P1 | Aceitar "Comprar 24 un. de X" só grava status; o comprador precisa ir a Pedidos, achar o fornecedor e redigitar o produto e a quantidade (ruptura decisão → ação; D-011 manda gerar o item com desfazer) | `RecommendationEngine.decide`; `IntelligenceCenter.handleDecide` |
| 3 | P1 | "Enviar pedido" só muda o status para ENVIADO; nada chega ao fornecedor. O comprador redigita o pedido no WhatsApp (D-012: WhatsApp, e-mail/PDF, lista para o representante) | `SupplierOrderService.sendOrder`; `Supplier.telefone/email` existem e não são usados |
| 4 | P1 | F1 não validada: testes, build e tela nunca executados | `git status` |
| 5 | P2 | "Como chegamos nesse número" mostra `0.41666666 un./dia`, `12.5%` (formato americano, casas sem fim) ao lado de valores pt-BR (UX-07) | `RecommendationEngine.*Recommendation` com `String.format("%s")` sobre `Double` |
| 6 | P3 | Swagger/OpenAPI ativo no perfil de produção (hoje mitigado pelo proxy, SEC-06) | `SecurityConfig:63`; `application-production.yml` |

## Oportunidades de melhoria

| ID | TIPO | SITUAÇÃO ATUAL | OPORTUNIDADE | ESFORÇO ELIMINADO | BENEFÍCIO | SOLUÇÃO | PRIORIDADE | RISCO | TESTE | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| OP-01 | JUNTAR + AUTOMATIZAR | Aceitar compra → sair da Central → Pedidos → novo pedido → escolher fornecedor → buscar produto → digitar quantidade e custo (≈8 ações) | O sistema já sabe o produto, a quantidade sugerida, o custo e, pelo histórico de pedidos, de quem a loja compra esse produto | escolher fornecedor, buscar produto, redigitar quantidade e custo | aceitar vira item de pedido em 1 toque, com desfazer; a quantidade é a mesma da recomendação | ao aceitar COMPRAR: fornecedor = último fornecedor do produto; rascunho aberto desse fornecedor (ou novo); custo = último custo pago, senão o da própria recomendação; produto já no rascunho → quantidade sobe até a sugerida. Sem histórico → a tela pergunta o fornecedor ali mesmo. "Desfazer" reverte decisão, item e medição pendente | P1 | médio (escreve em pedido) | unitários do serviço (inferência, rascunho existente, item existente, desfazer, pedido já enviado) + build | DONE |
| OP-02 | ELIMINAR + CRIAR | Pedido "enviado" não sai do app; comprador copia item a item para o WhatsApp | O pedido já tem itens, quantidades, unidade e o telefone/e-mail do fornecedor | redigitar o pedido fora do app | pedido chega ao fornecedor em 2 toques pelo celular | ao enviar, escolher canal: WhatsApp (abre a conversa com o texto pronto e o número do fornecedor), e-mail (mailto), copiar texto, imprimir/PDF (lista de conferência para o representante). O envio marca ENVIADO; pedido já enviado pode ser reenviado sem mudar status | P1 | baixo (sem integração externa, sem credencial) | unitários da formatação (script TS) + build | DONE |
| OP-03 | ANTECIPAR | KPIs sem período; "+100%" contra janela invisível | `salesTrend` diário já vem no cockpit | calcular de cabeça qual período é aquele | o Painel responde "como está hoje e nesta semana" | KPIs "Vendas hoje" (vs mesmo dia da semana anterior) e "Últimos 7 dias" (vs 7 anteriores) calculados do `salesTrend`; ticket e produtos com "(90 dias)" no rótulo | P0 | baixo (só leitura/rotulagem) | unitário do cálculo + build | DONE |
| OP-04 | ELIMINAR | trace da recomendação com números crus | — | decifrar `0.4166666` | confiança no número | formatação pt-BR (até 2 casas, vírgula decimal) nos textos gerados | P2 | baixo | unitário | DONE |
| OP-05 | ANTECIPAR | após aceitar, o link "Ver pedido" não existe | a tela de Pedidos só abre na aba padrão | procurar o pedido na lista | abrir direto no pedido criado | `/app/lista-compras?pedido=<id>` abre o pedido | P2 | baixo | build + navegação | DONE |

Oportunidades registradas e **não** implementadas agora (decisão de negócio pendente ou fatia própria no roadmap):
push "hora de pedir" (F10, exige PWA), reposição pelo vendido sem estoque teórico (F4/F5, depende de validação V1),
feed único Hoje/fim de Alertas (F8), mapa da loja (F17, pesquisa com donos).

## Plano de execução

| ID | PRIORIDADE | PROBLEMA | SOLUÇÃO | ARQUIVOS/ÁREAS | RISCO | TESTE | STATUS |
|---|---|---|---|---|---|---|---|
| P-01 | P1 | F1 sem validação | validação e publicação da F1 ficaram com a sessão paralela que a construiu (coordenado); aqui: suíte completa com a F1 incluída e V54 aplicada no PostgreSQL local com RLS | F1 (backend, `components/activation`, `Dashboard.tsx`, workflow) | baixo | `mvn test` (Java 17) | DONE |
| P-02 | P0 | KPIs sem período (OP-03) | `utils/salesPeriods.ts` + rótulos | `Dashboard.tsx` | baixo | unitário TS + build | DONE |
| P-03 | P1 | decisão → ação (OP-01) | `RecommendationOrderService`, migração V55 (vínculo recomendação → item), endpoints `order` e `undo`, retorno com `orderLink` | backend `service/opportunity`, `OpportunityController`, `SupplierOrderItemRepository`; `IntelligenceCenter.tsx` | médio | `RecommendationOrderServiceTest` + suíte + build | DONE |
| P-04 | P1 | envio real do pedido (OP-02) | `utils/orderMessage.ts`, `components/orders/OrderSendOptions.tsx`; `supplierPhone/Email` no DTO | `SupplierOrderDTO`, `ShoppingList.tsx` (inserção pontual), tipos | baixo | unitário TS + build | DONE |
| P-05 | P2 | link direto ao pedido (OP-05) | ler `?pedido=` na tela de Pedidos | `ShoppingList.tsx` | baixo | build | DONE |
| P-06 | P2 | números americanos (OP-04) | helper de formatação pt-BR no `RecommendationEngine` | `RecommendationEngine.java` | baixo | unitário | DONE |
| P-07 | P3 | Swagger em produção | `springdoc.*.enabled=false` no perfil `production` | `application-production.yml` | baixo | suíte (perfil não afeta testes) | DONE |
| P-08 | P2 | achado no E2E: "não encontrado" e rota inexistente respondiam 500 ("Ocorreu um erro no servidor") | `NoSuchElementException` e `NoResourceFoundException` → 404 no `GlobalExceptionHandler` | `GlobalExceptionHandler.java` (+ teste) | baixo | unitário + E2E | DONE |

## Ordem de implementação

P-01 (base estável) → P-02 (P0, isolado) → P-03 (backend + tela) → P-04 → P-05 (depende de P-03 para o link) →
P-06 → P-07 → validação final (suíte completa, `tsc`, build, revisão do diff).

## Itens que não serão alterados

- 21 arquivos de frontend com trabalho local do owner: editados só onde a fatia exige (`ShoppingList.tsx`, inserções
  pontuais), sem reverter nada deles.
- Migrações V1–V54: nunca editadas (checksum do Flyway); o vínculo novo vai em V55.
- Oportunidades por estoque teórico (D-019/D-026): continuam gerando as recomendações atuais; a troca por sinais de
  venda é a F4/F5, que depende da validação V1.
- Estúdio de ofertas, preços estaduais, mapa da loja, rede: fora deste ciclo.
- Deploy: não há push nem alteração na VPS sem autorização (deploy só via GitHub Actions).

## Ciclo 2 — integração e acabamento (2026-09-27)

Pedido do owner: integrar o trabalho das outras sessões (UX responsiva local, auditoria de VPS) e deixar o
repositório sem diff pendente, com a aplicação coerente como produto.

| ID | PRIORIDADE | PROBLEMA | SOLUÇÃO | ARQUIVOS/ÁREAS | RISCO | TESTE | STATUS |
|---|---|---|---|---|---|---|---|
| C-01 | P1 | 21 arquivos de UX responsiva (modais em folha no celular, grades de 1 coluna, design system consolidado) sem commit | revisados; `Button` com `type="button"` como padrão conferido: nenhum botão de formulário dependia do envio implícito | `components/common`, `components/ui`, telas | médio | varredura 19 telas × 4 larguras | DONE |
| C-02 | P1 | vários diálogos montados à mão não fechavam com Esc e o overlay continuava bloqueando a tela; Esc em diálogo empilhado fecharia os dois | `useModalBehavior` com pilha (Esc fecha só o de cima; scroll volta no último) usado também pelo `Modal` padrão e aplicado a fornecedor, contratos de rede, catálogo de planos, assinaturas, ficha do cliente | `hooks/useModalBehavior.ts` + 6 componentes | baixo | varredura com Esc + scroll | DONE |
| C-03 | P1 | barras de abas cortadas a 360 px ("Efe…", "Pre…", 4ª aba fora da tela) em 4 telas, com markup copiado | `SegmentedTabs` no design system: grade no celular, barra em linha a partir de 640 px, alvo de 44 px, `aria-pressed` | Pedido inteligente, Promoções, Produtos, PDVs | baixo | varredura + capturas | DONE |
| C-04 | P2 | ~85 números em formato americano (`toFixed`: "8.0/dia", "+100.0%", "1.00×"), inclusive no formatador compartilhado que prometia pt-BR | `formatDecimal`/`formatQuantityTrim` em `utils/formatters` e troca mecânica revisada nos usos de exibição | 16 telas/componentes | baixo | typecheck + testes de tela | DONE |
| C-05 | P2 | 132 linhas de erro de tipo; o build não rodava `tsc` (R-27g) | causa raiz no estúdio (`context: any`) tipada pelo retorno do controlador; 6 tipos ajustados ao que o código passa; `npm run build` passa a rodar `tsc`, então erro de tipo barra o deploy | estúdio de ofertas, serviços, `package.json` | baixo | `tsc` = 0 erro | DONE |
| C-06 | P2 | requisição malformada (JSON inválido, cabeçalho ausente) respondia 500 (SEC-08) | 400 com mensagem genérica no `GlobalExceptionHandler` | backend | baixo | unitário + curl | DONE |
| C-07 | P3 | código morto: 5 telas órfãs (pedidos duplicado, 4 telas antigas de ofertas), 7 componentes/utilitários e 3 arquivos de tipo sem nenhuma referência | removidos depois de confirmar ausência de import, barrel e rota | `screens`, `components`, `types`, `utils` | baixo | typecheck + build + varredura | DONE |
| C-08 | P3 | documentos de auditoria de VPS com acentuação corrompida e prompts soltos na raiz | codificação reparada; prompts em `docs/prompts/`; pasta vazia `backend;C` removida | `docs/` | baixo | inspeção | DONE |
| C-09 | — | `VPS-OPT-MASTER-PLAN` (otimização da VPS) | não executável daqui: tarefas dependem de acesso ao host e a regra do projeto é não alterar a VPS fora do GitHub Actions | — | — | — | BLOCKED |

## Ciclo 3 — organização do produto: Hoje e 5 destinos (2026-09-27)

Pedido do owner: melhoria visível de organização nos painéis. Base: decisões já tomadas por ele (D-021 Painel +
Central numa tela e fim de Alertas; D-018 celular primeiro) e requisitos R-08 e R-14.

| ID | PRIORIDADE | PROBLEMA | SOLUÇÃO | ARQUIVOS/ÁREAS | RISCO | TESTE | STATUS |
|---|---|---|---|---|---|---|---|
| N-01 | P1 | menu com 14 itens em 4 seções; no celular escondido atrás de um botão | 5 destinos (Hoje · Comprar · Produtos · Vender · Loja) de uma fonte única (`config/navigation.ts`): barra inferior no celular, lateral com páginas aninhadas no desktop, sub-navegação do destino abaixo do topo; rotas mantidas | `components/layout/*`, `config/navigation.ts` | médio | teste de navegação 360/1440 px | DONE |
| N-02 | P1 | "Pergunte aos dados" era um destino entre 14 | ação global no topo de todas as telas | `Navbar.tsx` | baixo | idem | DONE |
| N-03 | P1 | Painel do dia e Central competiam; Painel abria com 4 KPIs coloridos, gráfico e aba Alertas; as decisões ficavam em outra tela | tela **Hoje**: números do dia (vendas hoje, 7 dias, para decidir, pedidos para enviar), as 5 decisões de maior impacto aceitáveis ali, pedidos em rascunho a um toque do envio, acompanhamento e resultados, e as vendas como apoio | `screens/Dashboard.tsx` | médio | teste da Hoje + Painel | DONE |
| N-04 | P1 | Alertas duplicavam oportunidades (UX-17) | aba Alertas removida; `AlertGenerationJob` desligado por padrão (`APP_ALERTS_GENERATION_ENABLED`), tabela preservada | `Dashboard.tsx`, `AlertGenerationJob.java` | baixo | suíte + varredura | DONE |
| N-05 | P2 | cartão de recomendação e lógica de decidir só existiam na Central | `RecommendationCard` e `useRecommendationDecision` compartilhados; botões de 44 px, empilhados no celular | `components/intelligence`, `hooks` | baixo | testes de tela | DONE |
| N-06 | P3 | acabamentos: "27 De Setembro", dicas cortadas, título cortado a 360 px, "PDVs" × "Caixas", dois `h1` por tela, destino ativo não anunciado ao leitor de tela | corrigidos | layout, Hoje, PDVs | baixo | varredura | DONE |

## Coordenação

Uma segunda sessão trabalhava ao mesmo tempo na F1 no mesmo working tree. Divisão combinada: a F1 (inclusive
`Dashboard.tsx`) foi validada e publicada por ela (`25d80af`); a OP-03 só entrou no `Dashboard.tsx` depois do push.

## Bloqueios reais

Nenhum para os itens acima. Publicação (commit/push → deploy em produção) depende de autorização do owner, porque
o working tree mistura o trabalho local dele com o desta fatia.
