# MercadoFlow Vendas — indústrias e distribuidores vendendo ao supermercado dentro da plataforma

Versão 1 · 11/10/2026

---

## 1. Resumo

O MercadoFlow já sabe o que cada supermercado vende (NFC-e do caixa), o que compra e de quem
(NF-e de entrada no Confere), e já tem um portal para a indústria ver o giro dos seus produtos
(docs/PROPOSTA-INDUSTRIA.md). O passo seguinte, inevitável com indústrias e distribuidores na base,
é o **comércio B2B dentro da plataforma**:

- **Quem vende:** indústrias e distribuidores/atacadistas, cada um com o seu portal, catálogo,
  tabelas de preço, campanhas e pedidos.
- **Quem compra:** o supermercado, sem sair do painel. Ele compra a partir do que o MercadoFlow já
  sugere em "Comprar" e "Decidir", e compara as condições de quem pode atendê-lo.
- **Quem garante as regras:** o MercadoFlow. Um **motor de canal** respeita os contratos entre a
  indústria e os distribuidores, como exclusividade de território, contas atendidas direto e mix
  autorizado. O motor também não deixa ninguém ver dado de uma loja sem o consentimento dela.

A indústria pequena, que vende direto, entra no mesmo sistema com a chave "vendo direto". A
indústria grande, que vende por distribuidor, publica campanhas e verbas que chegam ao supermercado
**pelo distribuidor da área**.

---

## 2. Princípios

1. **Anonimato dos dados não se negocia.** Os números agregados do portal da indústria continuam
   com a regra mínima de lojas por recorte. O que muda é a forma de chegar a uma loja. Ela vem
   sempre do **consentimento da loja**:
   - **Proposta para um público.** Por exemplo: "lojas em Campinas com possível ruptura do meu
     produto". A plataforma entrega, mas o vendedor não sabe quais lojas receberam. A loja só se
     identifica se comprar.
   - **Proposta nominal.** Só para a loja ou rede que autorizou aquele vendedor a vê-la pelo nome.
   - **Pedido.** Ao comprar, a loja se identifica para quem vai atender, como em qualquer compra.
2. **Contrato de distribuição é respeitado por construção.** O motor de canal roda antes de
   qualquer preço, campanha ou pedido chegar à loja, e não depende da boa vontade de quem vende.
3. **Quem declara responde, e o dado confere.** A indústria declara os seus distribuidores e
   assina um termo. As notas de entrada (NF-e) mostram quem de fato abastece cada loja.
   Divergências viram alerta para o superadmin.
4. **Um vendedor, um modelo.** Indústria e distribuidor são o mesmo tipo de entidade (vendedor),
   com papéis diferentes nas regras. Nada de duas versões de catálogo, pedido ou campanha.
5. **O MercadoFlow não vira banco.** Na fase inicial, pagamento e prazo são combinados entre
   vendedor e loja, e a cobrança sai do vendedor. A plataforma cobra do vendedor pelo uso
   (seção 9).
6. **Tudo auditado.** Cada consulta, publicação de preço, entrega de campanha, decisão do motor e
   mudança de pedido fica registrada.

---

## 3. Atores e acessos

| Ator | Entra por | Vê | Nunca vê |
|---|---|---|---|
| Supermercado (dono, comprador) | painel do mercado, área **Comprar** | catálogos e preços que valem para a loja dele, campanhas recebidas, os próprios pedidos | condições dadas a outras lojas |
| Indústria | portal da indústria (dados) + **portal de vendas** | os seus produtos, distribuidores, campanhas; pedidos diretos; resultado das campanhas (contagens) | loja que não comprou nem autorizou; dado de concorrente |
| Distribuidor/atacadista | **portal de vendas** | o seu catálogo, preços, pedidos recebidos, campanhas da indústria que ele executa | dado agregado da indústria; loja que não comprou nem autorizou |
| Superadmin | painel do super admin | tudo, com auditoria; alertas de canal | — |

- **Vendedor** (`commerce_sellers`): tipo `INDUSTRIA` ou `DISTRIBUIDOR` (atacadista entra como
  distribuidor).
  - Uma indústria do portal de dados tem um vendedor ligado a ela (`industry_id`). Quem só vende
    entra sem contrato de dados.
- **Novo papel `SELLER_USER`.** Os usuários de vendedor usam o mesmo login (`/login`) e caem no
  portal de vendas.
  - O usuário de indústria (`INDUSTRY_USER`) que tem vendedor ligado vê as duas áreas no mesmo
    portal: Dados e Vendas.

---

## 4. Modelo de dados

### 4.1 Vendedores e acordos de distribuição

```
commerce_sellers            id, kind (INDUSTRIA|DISTRIBUIDOR), cnpj, legal_name, trade_name, status,
                            industry_id?, sales_mode (DIRETO|DISTRIBUIDOR|MISTO, só indústria),
                            service_ufs[], service_cities[] (onde entrega), min_order_cents,
                            payment_terms (texto), attested_at/by (termo de distribuição)
users.seller_id             usuário do portal de vendas (role SELLER_USER)

commerce_distribution_agreements
                            industry_seller_id, distributor_seller_id? (se já é vendedor na plataforma),
                            distributor_cnpj, distributor_name,
                            exclusivity (EXCLUSIVO|NAO_EXCLUSIVO),
                            scope_ufs[], scope_cities[], scope_brands[], scope_gtins[] (vazio = tudo),
                            block_other_sellers (na área, só este distribuidor vende os produtos da indústria
                            na plataforma), starts_on, ends_on, status, confirmed_by_distributor_at?

commerce_direct_accounts    industry_seller_id, cnpj (key account atendida direto mesmo em área exclusiva)
```

### 4.2 Catálogo e preço

```
commerce_seller_products    seller_id, gtin, name, brand, pack (unidade, caixa c/ N), min_qty, multiple_qty,
                            status (ATIVO|PAUSADO), stock_status (DISPONIVEL|SEM_ESTOQUE)
                            - indústria: só GTIN aprovado na carteira (prova de titularidade, V78)
                            - distribuidor: qualquer GTIN; se houver acordo com block_other_sellers na área,
                              o motor o esconde onde não pode vender

commerce_price_lists        seller_id, name, priority, valid_from/until,
                            scope: ufs[], cities[], audience (TODAS|NOMINAL), market_ids[] (só lojas que autorizaram)
commerce_price_list_items   price_list_id, gtin, unit_price, tiers jsonb ([{min_qty, unit_price}]) 
```

O preço de um produto para uma loja é o da **tabela válida de maior prioridade que alcança aquela
loja**. Alcançar a loja quer dizer duas coisas: a loja está no território da tabela e, se a tabela
for nominal, autorizou aquele vendedor.

### 4.3 Campanhas (propostas)

Uma campanha é uma condição especial, com prazo, entregue a um público:

```
commerce_campaigns          seller_id, number, title, message, kind (PRECO|VERBA|BONIFICACAO),
                            target_type (PUBLICO|NOMINAL), target jsonb ({ufs, cities, audience:
                            TODAS|VENDEM|NAO_VENDEM|RUPTURA}), valid_from/until, min_order_cents,
                            status (RASCUNHO|ENVIADA|ENCERRADA|CANCELADA), stats jsonb
commerce_campaign_items     campaign_id, gtin, unit_price | verba_pct | bonus (compre N leve M), min_qty
commerce_campaign_targets   campaign_id, market_id (nominal)
commerce_campaign_deliveries
                            campaign_id, market_id, channel (DIRETO|DISTRIBUIDOR), fulfilling_seller_id?,
                            distributor_cnpj, channel_reason, status (ENTREGUE|VISTA|PEDIDO|RECUSADA|EXPIRADA)
```

**Campanha da indústria em área de distribuidor exclusivo.** A loja recebe a campanha como
"condição da indústria X, atendida pelo distribuidor Y". O pedido vai para o distribuidor, e a
indústria vê no portal quantas lojas compraram por qual distribuidor. Quem paga a diferença de
preço (verba) é a indústria, ao distribuidor, por fora da plataforma. A plataforma registra o
direito: o pedido carrega a campanha.

**Público mínimo.** Uma campanha para um público só sai se alcançar ao menos o mínimo de lojas da
regra de anonimato (hoje 3). Assim, a contagem de entregas não revela uma loja.

### 4.4 Consentimento da loja

```
market_commerce_preferences  market_id, receive_campaigns (sim/não), visible_to_sellers (não por padrão)
market_seller_consents       market_id, seller_id, status (AUTORIZADA|BLOQUEADA), share_sales (a indústria
                             vê a venda dos produtos DELA nesta loja), changed_at/by
```

- A rede decide pelas lojas dela: o dono da matriz (`parent_market_id`) aplica a mesma escolha a
  todas as filiais.
- A loja pode bloquear qualquer vendedor e sair de todas as campanhas quando quiser.

### 4.5 Pedido

```
commerce_orders             number, market_id, seller_id, campaign_id?, channel, status, totals,
                            payment_terms, delivery_window, notes, nfe_key? (a nota da venda)
commerce_order_items        order_id, gtin, product_id, qty, unit_price, applied (TABELA|CAMPANHA|ESCALONADO),
                            qty_confirmed, qty_delivered
commerce_order_events       order_id, actor, from_status, to_status, note, at
```

```
RASCUNHO ─► ENVIADO ─► CONFIRMADO ─► FATURADO ─► ENTREGUE
               │            │                       ▲
               └─► RECUSADO └─► CANCELADO            └─ automático quando a NF-e do vendedor
                                                       chega pelo Confere com a mesma chave/itens
```

- Ao ser enviado, o pedido também aparece em **Comprar → Pedidos** da loja (o `supplier_orders` de
  hoje, ligado pelo vendedor como fornecedor). Por isso o recebimento, o histórico de custo e a
  margem continuam funcionando como hoje.
- **Conferência automática.** Quando a NF-e do vendedor entra pelo Confere, o sistema casa os itens
  com o pedido:
  - quantidade entregue;
  - divergência de preço;
  - item faltante.

  Nenhum marketplace B2B comum tem essa conferência, porque nenhum tem a nota de entrada da loja.

---

## 5. Motor de canal

Ele roda **por loja e por produto**, toda vez que algo vai chegar a uma loja: preço no catálogo,
campanha ou pedido. Ele responde a duas perguntas: quem pode vender este produto a esta loja, e
como.

```
entrada: loja L (localização, CNPJ, rede), produto G (marca, indústria dona), vendedor V

1. Loja bloqueou V ou saiu das campanhas ................................. ► não chega
2. Campanha nominal e L não autorizou V .................................. ► não chega
3. L fora da área de entrega de V ......................................... ► não chega
4. G é de uma indústria I com acordo EXCLUSIVO que cobre L e G:
     a. V é a própria I e L é conta direta de I .......................... ► DIRETO
     b. V é a própria I .................................................... ► VIA DISTRIBUIDOR (o exclusivo)
     c. V é o distribuidor exclusivo ....................................... ► DIRETO (ele vende)
     d. V é outro distribuidor e o acordo tem block_other_sellers .......... ► não chega
5. V é a indústria I com sales_mode = DISTRIBUIDOR:
     distribuidor não exclusivo de I que atende L (preferência: o que já abastece L pela NF-e)
                                                                           ► VIA DISTRIBUIDOR
     nenhum ............................................................... ► não chega
6. Caso geral ............................................................. ► DIRETO
```

- **Sem localização da loja.** Se a loja não tem localização e existe algum acordo exclusivo da
  indústria, o produto não chega à loja (falha fechada) e o superadmin é avisado.
- **Explicação.** Cada decisão grava o motivo em linguagem simples, por exemplo "Campinas é área
  exclusiva do Distribuidor Y". A loja e o superadmin leem esse motivo. A indústria vê só
  contagens por motivo, até a loja comprar.
- **Conferência pela NF-e:**
  - a loja compra G de um CNPJ que não é a indústria nem um distribuidor declarado: alerta
    "possível distribuidor não declarado";
  - um distribuidor declarado como exclusivo numa área não aparece em nenhuma nota de lojas dessa
    área: alerta "exclusividade sem evidência".

---

## 6. Telas

### Supermercado (painel do mercado, visual Flow)
- **Comprar → Fornecedores digitais:**
  - catálogo por vendedor e por produto;
  - comparação "quem me atende e por quanto" para cada item da lista de compras sugerida;
  - carrinho por vendedor.
- **Comprar → Campanhas recebidas:** ver a campanha, pedir, recusar ou bloquear o vendedor.
- **Comprar → Pedidos:** o que já existe, mais o status do pedido digital (linha do tempo,
  conferência com a NF-e).
- **Loja → Vendedores e privacidade:**
  - receber campanhas ou não;
  - autorizar ou bloquear cada vendedor;
  - participação nos dados (a tela de hoje).

### Portal de vendas (indústria e distribuidor, mesma casca Flow do portal da indústria)
- **Hoje:** pedidos novos, a confirmar, faturar e entregar; campanhas ativas.
- **Pedidos:** fila com status, confirmação parcial, número da NF-e.
- **Catálogo:** produtos, embalagens, estoque e pausa.
- **Preços:** tabelas por território e escalonamento.
- **Campanhas:** criar com público ou nominal, prévia do alcance (contagens) e resultado.
- **Clientes:** lojas que compraram ou autorizaram, com nome e cidade.
- **Distribuição** (só indústria):
  - forma de venda;
  - distribuidores e territórios;
  - contas diretas;
  - termo de responsabilidade.
- **Dados** (só indústria com contrato de dados): o portal de hoje.

### Superadmin
- **Vendedores:** cadastro, aprovação, usuários, plano de uso.
- **Canais:**
  - acordos de todas as indústrias;
  - alertas de divergência pela NF-e;
  - simulador "por que esta loja não vê este produto".
- **Pedidos e campanhas:** volume, pedidos parados, auditoria.

---

## 7. Segurança

- **RLS nas tabelas de loja:** `market_*`, entregas e pedidos pelo `market_id`.
- **Portal de vendas:** consulta sob o vendedor da sessão, sempre filtrado no serviço. Entre
  vendedores nunca há leitura cruzada, nem de preço, nem de pedido, nem de campanha.
- **Identidade da loja chega ao vendedor só em três casos:** pedido, consentimento nominal ou
  cliente que já comprou dele.
- **Limites:**
  - campanhas por vendedor por semana;
  - lojas por campanha;
  - consultas de alcance por dia, para impedir que contagens sucessivas sejam usadas para
    descobrir uma loja.
- **Termo de responsabilidade versionado:**
  - aceito pela indústria, sobre os acordos de distribuição;
  - aceito pelo vendedor, sobre preço e entrega;
  - aceito pela loja, sobre o consentimento.
- **Concorrência (CADE):** o vendedor define o **preço de venda a ele (sell-in)**, nunca o preço de
  revenda da loja. A plataforma não mostra a um vendedor o preço que outro vendedor dá.

---

## 8. O que já existe e é reaproveitado

| Peça | Onde | Uso |
|---|---|---|
| Venda por loja e produto | `invoices`, `invoice_items` | público "vendem / não vendem / ruptura" e sugestão de compra |
| Quem abastece cada loja | `nfe_document_items.supplier_cnpj` | preferência de distribuidor, alertas, conferência do pedido |
| Fornecedor e pedido da loja | `suppliers`, `supplier_orders` | o pedido digital aparece no fluxo de compra de hoje |
| Localização da loja | `market_locations` | território |
| Rede | `markets.parent_market_id` | consentimento e pedido pela rede |
| Titularidade de GTIN | `industry_portfolio` | indústria só vende o que é dela |
| Cobrança | Asaas (`AsaasService`) | plano de uso do vendedor |
| Casca Flow | `fx-app`, doca, mapa | portal de vendas |

---

## 9. Como o MercadoFlow ganha

- **Plano do vendedor:** mensalidade por faixa de lojas atendidas e campanhas.
- **Taxa por pedido entregue:** percentual pequeno sobre o pedido conferido pela NF-e. A NF-e é a
  prova de que a venda aconteceu.
- **Campanha patrocinada:** destaque no "Comprar" da loja, sempre marcado como patrocinado.
- **Para o supermercado,** o comprar continua grátis. A economia nas compras é argumento de venda
  dos planos.

---

## 10. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **1. Base de vendas** | vendedores (indústria e distribuidor), `SELLER_USER`, portal de vendas, catálogo, tabela de preço por território, motor de canal (acordos, exclusividade, contas diretas), catálogo e pedido no painel da loja, fila de pedidos do vendedor, superadmin de vendedores e acordos | — |
| **2. Campanhas e consentimento** | campanhas por público e nominal, preferências e autorizações da loja, rede decidindo pelas filiais, resultado da campanha, alertas de canal pela NF-e | 1 |
| **3. Compra inteligente** | "quem me atende e por quanto" na lista de compras sugerida, escalonamento, bonificação e verba, conferência automática pedido × NF-e, recompra | 1, 2 |
| **4. Dinheiro** | cobrança do plano e da taxa (Asaas), campanha patrocinada, relatórios do vendedor, avaliação de entrega | 1 a 3 |

---

## 11. Decisões que ficam com o dono

1. **Nome do produto e do portal.** Sugestão: "MercadoFlow Vendas", em `/vendas`.
2. **Quem pode vender:**
   - só vendedor aprovado pelo superadmin (recomendado no início);
   - ou cadastro aberto com análise depois.
3. **O distribuidor confirma o acordo declarado pela indústria?** Na fase 1, a indústria declara e
   a NF-e confere. Quando o distribuidor também estiver na plataforma, ele passa a confirmar ou
   contestar (campo `confirmed_by_distributor_at`).
4. **Modelo de cobrança:** só mensalidade, só taxa por pedido, ou as duas.
5. **Pagamento:** fica fora da plataforma na fase 1. Pode virar boleto/Pix com split no Asaas na
   fase 4.

---

## 12. O que foi implementado (11/10/2026)

As fases 1 e 2 entraram juntas, como decidido: base de vendas, campanhas e consentimento.

- **Banco** (`V94__commerce.sql`): vendedores, acordos de distribuição, contas diretas, catálogo,
  tabelas de preço (com faixas por quantidade e tabela nominal), preferências e autorizações da loja,
  campanhas com entregas por loja, pedidos com itens e histórico, auditoria do vendedor. RLS por loja
  nas tabelas que a loja lê; o resto é filtrado pelo vendedor no serviço.
- **Motor de canal** (`CommerceChannelService`): a tabela da seção 5, com testes de unidade para
  cada linha (`CommerceChannelServiceTest`).
- **Portal de vendas** (`/vendas`, papel `SELLER_USER`; o `INDUSTRY_USER` entra também): Hoje,
  Pedidos (confirmar com quantidade parcial, nota fiscal, entrega), Campanhas (rascunho, alcance só
  em contagens, envio, resultado), Clientes, Catálogo, Preços, Distribuição (só indústria) e Conta.
- **Loja**: Comprar → Indústrias e distribuidores (catálogo com o preço da loja, carrinho, campanhas
  recebidas, pedidos digitais) e Loja → Vendedores e campanhas (receber campanhas, autorizar,
  bloquear, decidir pela rede). Todo pedido é espelhado em Comprar → Pedidos.
- **Superadmin** (`/super-admin/vendas`): visão geral com taxas e mensalidades, vendedores (cadastro,
  liberação, cobrança, acessos), titularidade dos produtos, canais (simulador, alertas pela NF-e,
  acordos).
- **Cobrança**: mensalidade e taxa por pedido ficam no cadastro do vendedor; a taxa é fixada na
  entrega sobre o valor confirmado. A emissão da cobrança no Asaas fica para a fase 4.

Fica para depois: conferência automática pedido × NF-e de entrada, "quem me atende e por quanto"
dentro da lista de compras sugerida, bonificação e verba, avisos por e-mail/WhatsApp ao vendedor e
ao distribuidor fora da plataforma, e o distribuidor confirmando o acordo declarado pela indústria.
