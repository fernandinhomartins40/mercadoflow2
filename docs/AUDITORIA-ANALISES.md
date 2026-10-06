# Auditoria dos motores de análise

**Para quê:** antes de mudar telas ou fórmulas, saber com dados o que cada análise entrega hoje.
**Loja auditada:** Super Novo (`887ff86e…`), a única com notas reais.
**Data:** 06/10/2026, ~15h UTC.
**Fontes:**
- banco de produção, só leitura;
- fila do agente nesta máquina (`C:/ProgramData/PDV2Cloud/queue.db`), só leitura;
- código atual (`main`, commit e3f3ea1).

Cada achado traz a medida que o sustenta. O que não foi possível verificar está na seção 6.

---

## 1. Resumo

A premissa do produto é decidir onde aplicar o capital de giro: produtos que giram mais rápido, produtos que puxam outros, sazonalidade e desempenho por produto, em tempo real, para aumentar o faturamento líquido. Hoje **nenhum dos motores que sustentam essa premissa entrega um número confiável**, por quatro razões encadeadas:

1. **Faltam dados.** Cerca de 37 mil notas (out/2025 a jul/2026) ainda estão na fila do agente. Os meses de jan a jul/2026 têm 1/7 das notas e junho tem zero.
2. **Os jobs não terminam.** Os 25 jobs dividem uma única linha de execução. O de preço não completa desde 12/08, a previsão parou em 14/08 e a última atualização das análises do Super Novo foi às 02:15 UTC de hoje.
3. **Faltam custo e estoque.** O sistema não tem custo nem estoque de nenhum produto, mas trata "estoque desconhecido" como "estoque zero". Por isso sugere comprar quase tudo: 896 sugestões de compra abertas.
4. **As fórmulas de tração e de tendência não resistem a dados com buracos.** O tracionamento e a cesta não gravam nada (0 linhas). A tendência compara um período cheio com um vazio e mostra +361% na loja inteira.

**O que funciona:**
- a leitura das notas (100% dos itens com produto e GTIN);
- a detecção de preço e promoção (102 mil dias de preço e 1.528 janelas de promoção);
- os perfis de cliente (1.608);
- os números do Início, que leem as notas diretamente e estão certos para o que já chegou.

---

## 2. Os dados de entrada

### 2.1 O histórico está incompleto, e o resto está na fila do agente

Notas no servidor e na fila do agente (`queue.db`), por mês:

| Mês | No servidor | Na fila (PENDING) |
|---|---|---|
| 2025-10 | 3.604 | 512 |
| 2025-11 | 4.081 | 923 |
| 2025-12 | 2.012 | 4.725 |
| 2026-01 | 646 | 4.462 |
| 2026-02 | 616 | 3.790 |
| 2026-03 | 653 | 4.512 |
| 2026-04 | 686 | 4.384 |
| 2026-05 | 447 | 4.911 |
| 2026-06 | **0** | 4.537 |
| 2026-07 | 544 | 4.353 |
| 2026-08 | 4.686 | 0 |
| 2026-09 | 4.604 | 0 |
| 2026-10 | 299 | 0 |

- Fila total: 37.102 pendentes e 23.397 enviadas.
- Ritmo de envio: ~750 notas/h na média de 12 h e **~250/h na última hora**. Isso dá 2 a 6 dias até completar.
- O agente envia do mais novo para o mais antigo.
- De jan/2024 a set/2025 há só 18 a 62 notas por mês, no servidor e na fila. Esse período não tem movimento real de loja.

### 2.2 Qualidade dos itens: boa

- 140.892 itens, **0 sem produto, 0 sem GTIN** e 0 com valor zero.
- 3.276 itens (2,3%) sem categoria.
- 7.210 produtos distintos vendidos.

### 2.3 Custo e estoque: inexistentes

| Fonte | Registros no Super Novo |
|---|---|
| Histórico de compra (`purchase_price_history`) | **0** |
| Pedidos a fornecedor (`supplier_orders`) | **0** |
| NF-e de entrada do Confere (`nfe_documents` / itens) | 6 / 39 |
| Entradas de estoque do Confere (`confere_stock_entries`) | 8 |

O cálculo de capital (`WorkingCapitalService.loadCosts`) só lê histórico de compra e pedido a fornecedor. **As NF-e de entrada do Confere não alimentam custo nem estoque.** Hoje elas servem apenas ao agregado da Indústria (`SellInAggregator`).

---

## 3. Execução: os jobs não completam

| Evidência | Medida |
|---|---|
| Linhas de execução do agendador | **1**: não há `TaskScheduler` configurado; é o padrão do Spring Boot. Os 25 `@Scheduled` rodam em fila. |
| Checkpoint do histórico de preço | `updated_at` = **2026-08-12**. O `PriceIntelligenceJob` recalcula desde então todo produto com venda nova, refazendo o histórico inteiro de cada um, e não chega ao fim. Às 15h UTC havia uma transação desse job aberta havia 11 min. |
| Previsão de demanda | Últimas previsões para **14/08**. Não existe previsão para nenhuma data futura. |
| Atualização das análises (`market_refresh_state`) | Último ciclo concluído do Super Novo: **02:15 UTC de hoje**. Capital, sazonalidade e clientes têm o mesmo horário. |
| Ciclo adaptativo | O comentário diz que não roda halo nem sazonalidade, mas o código chama a **materialização completa** (capital, sazonalidade de 365 dias, halo de 180 dias, clientes) mais a detecção, **numa única transação**, a cada ciclo com nota nova. Com a fila do agente chegando, todo ciclo tem nota nova. |
| Resumo semanal | **0 gerados** (job de segunda às 05:00). |
| Alertas | **0** (job de hora em hora). |
| Resultado das decisões | 4 medidas, a última em 28/09. |

Conclusão: o que o lojista vê como "análise em tempo real" é, na melhor hipótese, de hoje às 02:15 UTC. Previsão e linha do tempo de preço estão paradas desde meados de agosto.

---

## 4. Motor por motor

### 4.1 Capital de giro (`product_capital_metrics`)

- 586 produtos avaliados, de 7.210 vendidos. A janela de 90 dias e o corte de relevância deixam o resto de fora.
- **0 com custo, 0 com estoque, 0 com GMROI.** Todos têm `cost_source = MARGIN_ESTIMATE` e a margem fixa de reserva.
- **586 com "cobertura" calculada.** O estoque desconhecido é gravado como `0` (`SEM_COMPRA_REGISTRADA`), não como nulo. A cobertura vira 0 dia. A proteção do detector de compra ("sem estoque estimado não sugere") checa nulo e por isso não age (`CapitalOpportunityDetector`, linhas 66–73).
- **GMROI nulo é tratado como retorno forte** (`decideStatus`: `strongReturn = gmroi == null || gmroi >= 2`). Sem custo, todo produto A ou B com momento ≥ 1 vira INVESTIR.
- Distribuição: INVESTIR 221, MANTER 214, REDUZIR 151, LIQUIDAR 0.
- **Resultado visível:** 896 recomendações "Comprar" abertas (3 aceitas). A quantidade sugerida supõe prateleira vazia.

### 4.2 Tendência e momento

- A tendência de cada produto compara os 90 dias atuais com os 90 anteriores. Na loja inteira:
  - atual: R$ 997.899 em 9.688 notas;
  - anterior: R$ 216.328 em 1.597 notas;
  - ou seja, **+361%**, que é só falta de notas.
- Todo "Em alta", "Acelerando", "Vendendo menos" e o momento que decide INVESTIR ou REDUZIR estão contaminados até o histórico completar.
- O momento (EMA7/SMA28) é calculado sobre a série **dos dias com venda** do produto, não dos dias do calendário. Para quem vende pouco, os "últimos 7 pontos" podem cobrir meses. Não é tempo real.
- O detector de janela (`SalesWindowResolver`) só olha a primeira e a última data. **Não detecta buraco no meio.**

### 4.3 Tracionamento: quem puxa a venda de quem

**a) Halo** (promoção de um produto aumenta a venda de outro)
- `product_halo_effects`: **0 linhas**.
- Há candidatos: 6.709 produtos com venda em 180 dias, 1.046 com ≥ 12 dias de venda e **137 com ≥ 4 dias abaixo de 95% do preço mediano**. O cálculo usa os 40 maiores.
- Rodei o cálculo do maior candidato (Chocolate Hershey's 82 g):
  - 342 produtos saem no mesmo cupom;
  - 5 dias de promoção contra 76 normais;
  - **lift médio −94,8%**; só 8 positivos.
- O método compara a venda dos outros produtos nos dias de promoção com os dias normais, **sem ajustar pelo movimento da loja no dia** (cupons do dia). Dias de promoção que caem nos meses com 1/7 das notas parecem dias fracos, e o sinal se inverte.
- Mesmo com 342 efeitos calculados, inclusive negativos (o filtro "> 0" só existe na leitura), a tabela está vazia. **Os resultados não estão sendo gravados.** Ver 6.1.

**b) Cesta** (produtos que saem juntos, sem depender de promoção)
- `market_basket_rules`: **0 linhas**.
- O job noturno grava só pares com suporte ≥ 1% dos cupons **e** confiança ≥ 50%.
- Medido nos 90 dias mais recentes (9.589 cupons):

| Critério | Pares |
|---|---|
| saem juntos em ≥ 5 cupons | 3.299 |
| suporte ≥ 1% | 6 |
| confiança ≥ 50% (lado menor) | 51 |
| **lift ≥ 2 (o dobro do acaso)** | **1.896** |

- O dado de tração existe. O corte é que está calibrado para outro tipo de varejo (cesta pequena, poucos itens).
- A ficha do produto ("Vende junto") calcula na hora, com outro corte, e por isso mostra pares. O que é gravado para as outras telas e para o Copiloto fica vazio.

### 4.4 Sazonalidade (`product_seasonality`)

- Dia da semana: 7.173 índices em 1.975 produtos. Mês: 7.147 em 3.020 produtos.
- **Média de 5 a 6 observações por índice.**
- A janela é de 365 dias, mas os meses de jan a jul/2026 têm 1/7 das notas e junho tem zero. Hoje o índice mensal diz que esses meses "vendem menos", o que é artefato.
- O índice por dia da semana é menos afetado, porque cada dia tem amostras de vários meses.

### 4.5 Previsão de demanda (`demand_forecasts`)

- Parada desde 14/08: nenhuma previsão para datas futuras. A aferição tem 100 linhas sem erro calculado.

### 4.6 Preço e promoção (`product_price_*`)

- 102.542 dias de preço, 5.124 eventos e 1.528 janelas de promoção em 686 produtos. É a base certa para medir efeito de promoção.
- Problema: o checkpoint está parado em 12/08 (seção 3).

### 4.7 Clientes (CPF)

- 11.542 notas com CPF e 1.608 perfis, calculados às 02:15 UTC.
- Dado útil para recompra. Também sofre com os buracos de histórico.

### 4.8 Números do Início (`/analytics/operation`, criado em 06/10)

- Lê as notas direto e não depende de job. Está correto para o que chegou ao servidor.
- **Não avisa que o histórico está incompleto.** As comparações de "Mês" (4 semanas contra as 4 anteriores) só valem porque agosto e setembro estão completos.
- É a parte mais "ERP" do painel. Faz sentido como contexto, não como centro (ver 7).

---

## 5. O que cada tela mostra hoje e se dá para confiar

| Tela | Fonte | Confiável hoje? |
|---|---|---|
| Início: vendas, clientes, ticket, por hora, departamentos | Notas direto | **Sim**, para o período que chegou |
| Início e Decidir: "Comprar X un." | Capital (4.1) | **Não**: supõe estoque zero |
| Decidir: "Liquidar", "Dinheiro parado", "Onde investir" | Capital (4.1) | **Não**: sem custo nem estoque |
| Decidir → Promover: "O que vale promover" / tracionadores | Halo (4.3a) | **Vazio** |
| Produtos: Acabando, Vendendo menos, Em alta, Parados | Tendência e capital (4.1, 4.2) | **Não**: tendência +361% de artefato |
| Ficha do produto: Vendas, Preço | Notas e preço | Sim, com os buracos visíveis no gráfico |
| Ficha do produto: Vende junto | Cesta calculada na hora | **Parcial**: corte diferente do gravado |
| Ficha do produto: sazonalidade por época | 4.4 | **Não**, para os meses com buraco |
| Copiloto e resumo do dia | Recomendações e números | Herdam os problemas de 4.1 e 4.2 |

---

## 6. O que não foi possível verificar

1. **Por que o halo não grava.** O cálculo roda e devolve resultados (4.3a), mas a tabela está vazia. Hipóteses não confirmadas:
   - a transação única do ciclo adaptativo falha ou é abortada e tudo volta atrás;
   - o job noturno não chega a rodar por causa da fila de execução única.

   Os logs dos jobs se perdem a cada deploy, porque o contêiner é recriado. Para confirmar: ligar log das falhas da materialização e observar uma madrugada.
2. **O ritmo de envio do agente.** Caiu de ~750/h para ~250/h. Pode ser o servidor (deploys de hoje, carga) ou o próprio agente. Não medi o tempo de resposta da ingestão no servidor.
3. **Lojas de teste** ("MercadoFlow Admin", 3.653 notas de teste) não foram auditadas.

---

## 7. Ordem recomendada de correção

Proposta para decisão. **Nada disto foi implementado.**

**Fase A: dados e execução** (sem isso, qualquer fórmula erra)
1. **Detectar e mostrar a completude do histórico.** Calcular notas por dia contra a mediana e marcar os dias com buraco. Comparações (tendência, momento, sazonalidade, halo) só usam períodos completos. Enquanto o agente envia o atraso, as telas dizem "histórico chegando: X%".
2. **Execução dos jobs:**
   - mais de uma linha de execução no agendador;
   - o ciclo adaptativo refaz só o capital (como o comentário promete), em transações separadas;
   - halo, cesta e sazonalidade ficam no noturno;
   - o job de preço passa a recalcular só os dias afetados, e não o histórico inteiro de cada produto;
   - registrar e guardar as falhas de cada materialização.

**Fase B: corrigir os motores da premissa**
3. **Capital:**
   - estoque desconhecido passa a ser nulo, não zero;
   - GMROI nulo deixa de valer "retorno forte";
   - sem estoque não há sugestão de quantidade, só sinal de giro;
   - ligar as NF-e de entrada do Confere como fonte de custo e de entrada de estoque.
4. **Tração:**
   - cesta com corte por lift e contagem mínima (os 1.896 pares medidos), ordenada pela receita que o produto arrasta;
   - halo ajustado pelo movimento do dia (venda por 100 cupons, e não quantidade bruta), calculado só sobre dias completos;
   - um índice de tração por produto.
5. **Tendência e momento:** série por dia do calendário, com dias sem venda contando zero, e só em períodos completos.

**Fase C: telas** (depois que A e B estiverem medidos)
6. Re-ancorar o painel na premissa: capital e tração no centro, vendas como contexto. Cada número de capital marcado como real ou estimado.

**Decisões que dependem de você:**
- **Custo:** sem histórico de compra, aceita custo estimado, sempre marcado, até chegar o real pela NF-e de entrada? Ou prefere mostrar só giro e unidades até haver custo real?
- **Envio do atraso:** espera o agente terminar (2 a 6 dias) antes de recalibrar tração e sazonalidade, ou corrige as fórmulas já, com a marcação de completude?

---

## 8. O que foi implementado (06/10/2026, commit b33666c)

Decisões tomadas com as opções recomendadas: custo estimado sempre marcado, e as fórmulas corrigidas já, comparando só dias completos.

| Item | Feito | Validado em produção (só leitura) antes de subir |
|---|---|---|
| Completude do histórico | `DataCompletenessService`: dia completo quando tem ≥ 25% do p75 do mesmo dia da semana. Endpoint `/analytics/data-completeness` e aviso em todas as telas. | Ago e set: 31/31 e 30/30 completos. Jan a mai: 0–1 por mês. |
| Tendência | Receita por dia completo; sem base (< 50% de dias completos antes), fica nula. | Antes, +361% na loja inteira. |
| Momento e venda por dia | Série do calendário só com dias completos (zero onde não vendeu). Com menos de 28 dias completos, o momento fica neutro. | — |
| Sazonalidade | Média por dia completo do calendário; mês com menos de 10 dias completos não ganha índice. | — |
| Tração (nova, V81) | Resto do cupom contra cupons do mesmo tamanho, com z-score e parceiros (lift ≥ 1,5, ≥ 5 cupons). | 395 produtos avaliados; efeito médio −R$ 0,59, ou seja, o controle funciona. **4 produtos com efeito firme** (aveia Nestlé +R$ 30,60/cupom, Raffaello +R$ 4,90, sabonete Palmolive +R$ 21,38, mamão formosa +R$ 13,63). 8.586 pares de parceiros. |
| Halo de promoção | Venda por 100 cupons do dia, só dias completos. | O maior candidato (Hershey's) tem **0 dias de promoção em dias completos**. O −94,8% era artefato. Hoje não há promoção suficiente em dados completos para medir halo. |
| Cesta gravada | Corte por lift ≥ 1,5 e ≥ 5 cupons. A cesta deixou de ser recalculada a cada nota. | 1.896 pares com lift ≥ 2. |
| Estoque desconhecido | Nulo, e não zero (sem compra ou saldo negativo). Sem quantidade sugerida e sem "liquidar". V82 encerra o que nasceu do erro. | **870** compras abertas e **21** liquidações, todas com confiança de estoque 0. |
| Custo | NF-e de entrada do Confere entra como custo e como entrada de estoque só quando custo/preço fica entre 0,30 e 1,05. A tela mostra a fonte, com "ESTIMADA" quando for o caso. | Coca 2L (0,82) aceita; "CC LT6" (lata contra pack) e caixas descartadas. |
| Jobs | 3 linhas no agendador. Materialização em etapas, cada uma com transação e log próprios. O ciclo de 5 min refaz só o capital. Preço em lotes de 100 com cursor (V81). | — |
| Telas | Início abre em "Quem puxa a venda", "Giro" e "Decida agora"; as vendas vêm depois, como contexto. Produtos abre em "Puxam venda". A ficha do produto tem a aba "Tração e giro". | — |

**Continua dependendo de dados:**
- o agente terminar de enviar as ~37 mil notas;
- haver registro de compras (Confere ou pedidos) para o capital em reais e o estoque.

Até lá, o giro aparece em unidades por dia, e o dinheiro parado não aparece.
