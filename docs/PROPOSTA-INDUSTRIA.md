# MercadoFlow Indústria — dados de sell-out anônimos para fabricantes: diagnóstico e projeto

Versão 1 · 05/10/2026

---

## 1. Resumo

O MercadoFlow recebe, nota a nota, tudo o que os supermercados vendem: o código de barras (GTIN), a
quantidade, o preço, o desconto, a hora, o caixa e, quando o cliente informa, o CPF. Esse é o dado
que a indústria mais quer e menos tem: **o giro real do produto na gôndola, por região, quase em tempo
real** (o *sell-out*). Hoje a indústria compra isso de painéis de varejo amostrais, com semanas de
atraso.

A proposta é um **segundo produto do ecossistema**, o *MercadoFlow Indústria*:

- **Para o fabricante.** Ele vê como **os produtos dele** vendem por região, cidade e bairro:
  - unidades, faturamento e preço praticado;
  - quantas lojas vendem (distribuição);
  - onde parou de vender (possível ruptura);
  - efeito das promoções.
- **O que ele nunca vê.**
  - **Qual mercado** vendeu.
  - Os **produtos dos concorrentes**.
  - Nenhum dado de consumidor.
- **Para o MercadoFlow.** O superadmin controla tudo:
  - quem entra;
  - quais GTINs cada indústria pode ver, com prova de que são dela;
  - em que nível geográfico;
  - por quanto tempo e a que preço.
  - Toda consulta fica registrada.
- **Para o supermercadista.** O dado dele vira receita para a plataforma sem expor a loja. Pode virar
  desconto no plano (ver 6.4).

A cobrança é por **produto analisado por mês** (GTIN-mês), com faixas por abrangência geográfica e
pacotes de recursos, num contrato anual faturado pelo Asaas, que já está integrado.

O código já tem duas peças prontas para reaproveitar: a localização das lojas e um agregador anônimo de
entradas do Confere com regras de privacidade. Ele também tem **um vazamento que precisa ser fechado
antes de tudo** (seção 3.1).

---

## 2. Como está hoje

### 2.1 Do caixa ao banco

```
NFC-e no caixa ──► agente (parser.py) ──► API /ingest ──► invoices + invoice_items ──► análises por loja
                    lê chave, emitente,      deduplica        (RLS: cada loja só
                    data, itens, totais       por chave         vê o que é dela)
```

- **O agente** (`pdv2cloud-agent/service/parser.py`) extrai:
  - da nota: chave, CNPJ do emitente, data/hora, série, número e total;
  - de cada item: GTIN (`cEAN`), código interno, descrição, NCM, CFOP, quantidade, valor unitário,
    total, desconto e impostos.
  - Ele **não envia o endereço do emitente** (bairro e município).
- **O servidor** (`InvoiceProcessingService`) recusa nota repetida e nota acima da cota. Grava
  `invoices` (com `market_id` e `pdv_id`) e `invoice_items` (sem `market_id`: a loja vem pela nota).
- **O produto do item** é ligado ao catálogo global (`products`, 168 mil itens, 150 mil com GTIN)
  pelo GTIN.
- **O isolamento entre lojas** é feito por RLS, ativa e verificada em produção. O CPF do cliente vira
  hash com um *salt* por loja (`market_customer_salts`). A camada de clientes já usa k-anonimato 5.

### 2.2 O que já existe para a indústria

| Peça | Estado |
|---|---|
| Papel `INDUSTRY_USER` e coluna `users.industry_id` | Existem, sem uso real |
| `IndustryController` (`/api/v1/industries/markets`) | **Lista o nome de todos os mercados ativos** (ver 3.1) |
| `market_locations` (rua, bairro, cidade, código IBGE, UF) | Preenchida só pelo Confere, a partir das notas de entrada |
| `mf_sellin_weekly` + `SellInAggregator` | Agregado anônimo de **entradas** (sell-in) por GTIN, semana e bairro/cidade/UF. Mínimo de lojas por célula configurável (padrão 3) e regra de dominância de 70%. **Sem coluna de mercado.** |
| `confere_accounts.manufacturer_visibility` | Opt-in do mercado para aparecer com nome ao fabricante (Confere) |
| Decisões do dono (memória do projeto) | Opt-out só em plano pago; mínimo de lojas: "nenhum" para o sell-out, revisto para 3 no sell-in |

O `SellInAggregator` é o molde certo para o sell-out: agrega por célula geográfica, descarta a loja
antes de gravar e suprime células pequenas.

### 2.3 O que falta

1. **Localização das lojas que só usam o caixa.** Sem o Confere, a loja não tem bairro nem município.
2. **Quem é dono de cada GTIN.** O catálogo tem marca (texto livre), não a indústria titular.
3. **Agregado de sell-out.** Não existe; as análises de venda são todas por loja.
4. **Cadastro de indústria, carteira, contrato, cobrança e auditoria.** Não existem.
5. **Política de participação das lojas.** As decisões existem, mas não estão no banco nem nos termos.

---

## 3. Problemas, por gravidade

### 3.1 Crítico: vazamento já em produção

`GET /api/v1/industries/markets` devolve **o nome de todos os mercados ativos** a qualquer usuário com
papel `INDUSTRY_USER`. É exatamente o que o produto promete não fazer. **Correção imediata:** remover a
rota, ou restringi-la a `SUPER_ADMIN`, antes de criar o primeiro usuário de indústria.

### 3.2 Riscos de reidentificação (o que a arquitetura precisa impedir)

| Risco | Exemplo | Defesa |
|---|---|---|
| Célula pequena | Bairro com uma só loja: o número **é** daquela loja | Mínimo de lojas por célula (k) |
| Loja dominante | 5 lojas, mas uma faz 90%: o total ≈ a loja | Regra de dominância (nenhuma loja > X% da célula) |
| **Diferença entre níveis** | Cidade mostrada, um bairro suprimido e os outros mostrados: cidade − bairros = o suprimido | **Supressão secundária**: se sobra uma célula "derivável", suprime outra junto |
| Diferença entre períodos | Hoje 6 lojas, ontem 5: a diferença é a loja nova | Janela mínima de agregação e mínimo também na variação |
| Horário fino | "10h03, bairro X, 1 unidade" casa com a câmera da loja | Granularidade mínima: hora só no nível cidade/UF; bairro só por dia ou semana |
| Preço exato | Preço único de uma loja revela a política dela | Mostrar faixa (mín/médio/máx) só com k lojas; nunca o preço de uma loja |
| Concorrente por subtração | Total da categoria − meu produto = o concorrente | Participação na categoria só em %, só com ≥ 5 marcas na célula e nenhuma > 60% |
| Consultas que triangulam | Muitos recortes sobrepostos para isolar uma loja | Auditoria com alerta de padrão e limite de recortes por dia |
| Dado de consumidor | CPF ou cesta individual | Nunca sai do tenant. Recompra só como taxa agregada por célula |

### 3.3 Produto e negócio

- Sem prova de titularidade, uma indústria poderia "reclamar" GTINs do concorrente e ver o giro dele.
- O "tempo real" literal é incompatível com o anonimato no bairro (ver horário fino). O produto precisa
  vender **frescor** (horas) no nível cidade, e não o segundo exato.

---

## 4. Princípios

1. **A indústria nunca toca dado bruto.** A API dela lê só tabelas agregadas, construídas por um job,
   que **não têm coluna de mercado**. Isso vale também para o banco: papel de banco próprio, só com
   SELECT nessas tabelas.
2. **Ela vê só o que é dela, e o que é dela é provado.** O acesso é por GTIN aprovado pelo superadmin,
   com evidência (prefixo GS1 da empresa, documento de titularidade ou contrato de licença).
3. **Privacidade como parâmetro, não como código.** Mínimo de lojas, dominância, granularidade e
   atraso ficam numa tabela de política, editável no superadmin, com auditoria. Nenhum valor fica fixo
   no código.
4. **Prévia antes de liberar.** O superadmin vê exatamente o que a indústria verá, inclusive o que
   será suprimido, antes de ativar o contrato.
5. **Tudo auditado.** Cada consulta registra quem, o quê, qual recorte e quantas células voltaram.
6. **Participação explícita das lojas.** Segue a decisão do dono: no plano Grátis a participação é
   obrigatória; nos pagos, a loja pode sair. Fica registrado nos termos e na conta.

---

## 5. O projeto

### 5.1 Arquitetura

```
                    ┌─────────────── domínio do supermercado (RLS por loja) ───────────────┐
 agente ─► /ingest ─► invoices / invoice_items / market_locations / participação da loja
                    └──────────────────────────────┬──────────────────────────────────────┘
                                                   │  job de agregação (a cada hora)
                                                   │  • filtra lojas participantes
                                                   │  • agrega por célula (GTIN × tempo × lugar)
                                                   │  • aplica k, dominância e supressão secundária
                                                   │  • DESCARTA o market_id antes de gravar
                                                   ▼
                    ┌──────────────── domínio da indústria (sem market_id) ────────────────┐
                    │ mf_sellout_hourly · mf_sellout_daily · mf_sellout_weekly             │
                    │ mf_sellin_weekly (já existe) · mf_category_share_weekly              │
                    └──────────────────────────────┬──────────────────────────────────────┘
                                                   │ RLS por indústria: só GTINs da carteira
                                                   │ ativa, no nível geográfico do contrato
                                                   ▼
            API /api/v1/industry/** (papel INDUSTRY_USER) ──► portal industria.mercadoflow.com
                                                   ▲
            Superadmin: indústrias · carteira · contratos · política · prévia · auditoria
```

- **Portal separado** (`industria.mercadoflow.com`), com o mesmo visual Flow. É outra porta de
  entrada, com outro login: um usuário de indústria nunca abre telas de mercado.
- **API separada** (`/api/v1/industry/**`), só leitura, que **só** consulta as tabelas `mf_*`.
- **Papel de banco próprio** para a API da indústria, com `SELECT` apenas nas `mf_*`. Mesmo um bug no
  código não alcança `invoices`.
- **RLS nas tabelas agregadas**: a sessão grava `app.industry_id`, e a política só deixa passar linhas
  cujo GTIN está na carteira ativa daquela indústria, no nível geográfico contratado.

### 5.2 Peças de dados novas

**Localização da loja (pré-requisito).** O agente passa a enviar `enderEmit` da NFC-e (bairro, código
IBGE do município, UF e CEP), que toda nota de caixa já traz. O servidor grava em `market_locations`
quando estiver vazia. Como reserva, entra a consulta do CNPJ, que já existe para fornecedores
(`cnpj-lookup`). Sem localização, a loja simplesmente não entra nos agregados.

**Participação da loja.**

```
market_data_participation
  market_id, status (PARTICIPA | SAIU), reason, terms_version, changed_at, changed_by
```

A regra efetiva segue a decisão do dono: **Grátis participa sempre; plano pago participa por padrão e
pode sair** (em "Minha assinatura → Privacidade dos dados").

**Agregados de sell-out** (molde do `SellInAggregator`):

| Tabela | Grão | Nível geográfico | Métricas |
|---|---|---|---|
| `mf_sellout_hourly` | GTIN × hora | só CIDADE e UF | unidades, faturamento, lojas, preço mín/médio/máx |
| `mf_sellout_daily` | GTIN × dia | BAIRRO, CIDADE, UF e REGIÃO | as anteriores + distribuição numérica (lojas que venderam ÷ lojas participantes na célula) + desconto médio |
| `mf_sellout_weekly` | GTIN × semana | todos | as anteriores + **lojas que pararam de vender** (vendiam nas 4 semanas anteriores e não venderam nesta), base para alerta de ruptura |
| `mf_promo_effect` | GTIN × janela de promoção | CIDADE e UF | aumento de vendas na promoção contra a base, com mesmo k |
| `mf_category_share_weekly` | categoria × semana | CIDADE e UF | **só a % do total da categoria** de cada GTIN da carteira, sem nome nem número de outro produto |
| `mf_repurchase_weekly` | GTIN × mês | CIDADE e UF | taxa de recompra, calculada **dentro de cada loja** com o hash local e somada depois |

Nenhuma dessas tabelas tem `market_id`, CPF, hash de cliente, número de nota ou PDV.

**Política de privacidade** (uma linha, editável no superadmin, auditada):

```
mf_privacy_policy
  min_stores_per_cell        3   (Confere já usa 3; o dono pode subir)
  max_store_share            0.70
  secondary_suppression      true
  hourly_min_level           CIDADE
  neighborhood_min_grain     DIA
  publish_delay_minutes      120 (frescor: até 2h)
  category_share_min_brands  5
  category_share_max_brand   0.60
  max_queries_per_day        2000
```

> Decisão do dono a revisar: a memória registra "mínimo de lojas: nenhum" para o sell-out. O projeto
> recomenda **3**, igual ao sell-in, pelos riscos de 3.2. Com mínimo zero, um bairro com uma loja
> entrega o giro daquela loja ao fornecedor dela.

### 5.3 Titularidade: quem pode ver qual produto

```
industries            id, cnpj, razao_social, nome_fantasia, status (EM_ANALISE | ATIVA | SUSPENSA),
                      gs1_prefixes text[], contato, created_at
industry_users        user_id, industry_id, role (ADMIN_INDUSTRIA | ANALISTA)
industry_portfolio    industry_id, gtin, brand, status (PEDIDO | APROVADO | NEGADO | REVOGADO),
                      evidence_type (PREFIXO_GS1 | DOCUMENTO | LICENCA), evidence_ref,
                      approved_by, approved_at, valid_until
```

**Fluxo de aprovação:**

1. A indústria se cadastra pelo CNPJ e o superadmin aprova a empresa: CNPJ ativo, e-mail do domínio,
   contrato assinado.
2. Ela pede os produtos dela: cola GTINs, envia planilha ou escolhe uma marca.
3. O sistema **pré-classifica cada GTIN**:
   - **verde:** o GTIN começa com um prefixo GS1 da própria indústria;
   - **amarelo:** a marca do catálogo bate com a da indústria, mas o prefixo não;
   - **vermelho:** prefixo de outra empresa já cadastrada, ou GTIN de marca concorrente.
4. O superadmin aprova em lote (verdes) ou um a um com documento (amarelos). **Vermelho nunca é
   aprovado** sem documento de licença.
5. Um GTIN só pode estar ativo em **uma** indústria por vez, salvo licença registrada. É uma
   restrição no banco.

### 5.4 Contrato e cobrança

```
industry_contracts    id, industry_id, plan (ESSENCIAL | REGIONAL | NACIONAL), geo_scope (lista de UFs
                      ou cidades), features (SELLOUT, PRECO, PROMO, SELLIN, CATEGORIA, RECOMPRA, API),
                      gtin_limit, price_per_gtin_cents, base_fee_cents, starts_at, ends_at,
                      status (RASCUNHO | ATIVO | SUSPENSO | ENCERRADO), signed_document
industry_contract_gtins  contract_id, gtin, added_at, removed_at   (o que é cobrado no mês)
industry_invoices     contract_id, month, gtins_billed, amount_cents, asaas_payment_id, status
industry_access_log   industry_id, user_id, endpoint, filters, cells_returned, cells_suppressed, at
```

**Modelo de cobrança: por GTIN analisado por mês.**

- **Cobra-se** cada GTIN que esteve ativo no contrato em algum dia do mês (pró-rata opcional).
- **Taxa base mensal**, que cobre o acesso, os usuários e o suporte.
- **Preço por GTIN**, que cai por faixa de volume e sobe por abrangência e recursos.

| Pacote | Inclui | Abrangência | Taxa base / mês* | Por GTIN / mês* |
|---|---|---|---|---|
| Essencial | Sell-out (unidades, faturamento, lojas), preço, ruptura | Até 3 cidades | R$ 1.500 | R$ 60 |
| Regional | + promoções, sell-in, recompra, alertas | Até 3 UFs | R$ 4.000 | R$ 45 |
| Nacional | + participação na categoria, API, exportação | Brasil | R$ 9.000 | R$ 35 |

Faixas de volume no preço por GTIN: -15% acima de 100 GTINs e -30% acima de 500.

\* **Valores de partida para validar com 3 a 5 indústrias-piloto**, não preços de mercado
pesquisados. O preço justo depende da cobertura real (quantas lojas e cidades a base tem). Por isso o
portal mostra a **cobertura** antes da venda (ver 5.6).

**Exemplo:** uma indústria regional de bebidas com 80 GTINs no pacote Regional paga
R$ 4.000 + 80 × R$ 45 = **R$ 7.600 por mês**, ou R$ 91.200 por ano.

**Faturamento:** fatura mensal no Asaas, por boleto ou Pix, com nota fiscal de serviço automática, que
o sistema de assinaturas já faz. A inadimplência suspende o acesso aos dados sem apagar nada, como no
plano dos mercados.

**Por que por GTIN:** é o que a indústria entende (o portfólio dela), cresce com o uso, é fácil de
auditar ("estes 80 produtos, neste mês") e o custo para o MercadoFlow também cresce por GTIN
(processamento e células).

### 5.5 Superadmin: o controle

Uma área nova, **Indústria**, no painel, com as telas:

1. **Indústrias.** Fila de cadastros, aprovação da empresa, usuários e suspensão (botão de
   emergência que corta o acesso na hora).
2. **Carteira.** Os pedidos de GTIN com a pré-classificação verde/amarelo/vermelho, a evidência,
   aprovação em lote, revogação e conflitos ("este GTIN já pertence a X").
3. **Contratos.** Criar a partir de um pacote, escolher abrangência e recursos, anexar o contrato
   assinado, ativar, renovar e encerrar. Mostra a fatura do mês calculada.
4. **Prévia do que a indústria verá.** Escolhe a indústria e o recorte e vê a tela dela, com as
   células suprimidas destacadas e o motivo de cada uma (poucas lojas, dominância, supressão
   secundária). **Nenhum contrato ativa sem uma prévia aprovada.**
5. **Política de privacidade.** Os parâmetros de 5.2, com histórico de quem mudou e quando. Mudanças
   que **afrouxam** a política pedem confirmação dupla.
6. **Auditoria.** Consultas por indústria, células devolvidas e suprimidas, e alertas de padrão
   suspeito: muitos recortes sobrepostos, insistência em células suprimidas, horário anômalo.
7. **Receita.** Receita por indústria, GTINs cobrados no mês, contratos a renovar e inadimplência. Os
   números entram no painel de receita que já existe.

### 5.6 O portal da indústria

Mesmo visual dos painéis, com o molde de "uma pergunta por tela":

- **Hoje:** "Seus produtos venderam **12.430 unidades** nas últimas 24h".
  - Onde subiu e onde caiu, em células liberadas.
  - Alertas: "O GTIN 789… deixou de vender em 14 lojas em Curitiba esta semana".
- **Mapa:** UF → cidade → bairro, com unidades, faturamento e distribuição numérica. As células
  suprimidas aparecem como "dados insuficientes para preservar o anonimato", sem número.
- **Produto:** a série no tempo, o preço praticado (faixa), o efeito das promoções e a recompra.
- **Categoria** (pacote Nacional): "Sua participação em biscoitos recheados em Curitiba: **18%**",
  sem lista de concorrentes.
- **Cobertura:** quantas lojas e cidades a base tem, e onde. É o argumento de venda para ampliar a
  abrangência.
- **Exportação e API** (pacote Nacional): os mesmos agregados, com as mesmas regras.

### 5.7 O que muda para o supermercadista

- **Termos e "Minha assinatura":** uma seção "Seus dados e a indústria" explica, em linguagem simples,
  que os dados entram **somados com os de outras lojas**, sem o nome da loja e sem dados de clientes.
- **Plano pago:** botão para sair.
- **Valor de volta (sugestão):** um percentual da receita da indústria vira desconto no plano das
  lojas participantes, ou créditos de IA. Isso transforma "meu dado está sendo vendido" em "meu dado
  paga parte da minha assinatura" e reduz a saída.

---

## 6. Plano de implantação

| Fase | Entrega | Depende de |
|---|---|---|
| **0. Correção urgente** | Fechar `/industries/markets`. Agente envia `enderEmit` e servidor preenche `market_locations`. Tabela de participação e termos. | — |
| **1. Motor de agregação** | `mf_sellout_daily/weekly/hourly` + política + supressão secundária + testes de reidentificação (célula pequena, dominância, diferença entre níveis e períodos) | Fase 0 |
| **2. Superadmin** | Indústrias, carteira com pré-classificação GS1, política, prévia, auditoria | Fase 1 |
| **3. Portal MVP** | Login de indústria, Hoje, Mapa, Produto; RLS por carteira; papel de banco só leitura | Fase 2 |
| **4. Contratos e cobrança** | Contratos, cálculo por GTIN-mês, fatura no Asaas, suspensão por atraso | Fase 3 |
| **5. Recursos premium** | Promoções, categoria, recompra, alertas, API e exportação | Fase 4 |

**Para testar com dados realistas:** as notas simuladas desta semana são de **uma** loja. Com mínimo
de 3 lojas, tudo seria suprimido. O gerador precisa simular de 5 a 10 lojas em 3 cidades e alguns
bairros, para exercitar supressão, dominância e níveis.

---

## 7. Como medir

- **Privacidade:**
  - zero célula publicada abaixo do mínimo, verificada por teste automático a cada execução do job;
  - zero acesso da API de indústria fora das `mf_*`, verificado pelo papel de banco e pelo log.
- **Cobertura:** lojas participantes, cidades com ao menos uma célula publicável e % de GTINs da
  carteira com dado publicável.
- **Negócio:** indústrias ativas, GTINs cobrados por mês, receita mensal recorrente da indústria,
  renovação dos contratos e taxa de saída das lojas pagas.

---

## 8. O que foi implementado (05/10/2026)

As fases 0 a 4 e parte da 5 estão no código:

- **Vazamento fechado.** `/api/v1/industries/markets` saiu. O portal usa `/api/v1/industry/**`, só para `INDUSTRY_USER`.
- **Localização das lojas.** O agente envia o `enderEmit` da NFC-e; o servidor grava em `market_locations` (origem
  `NFCE_EMIT`). No superadmin dá para buscar pelo CNPJ ou digitar (`MANUAL`, que nenhuma outra origem sobrescreve).
- **Motor de agregação** (`SellOutAggregator`): semana, dia e hora por UF, cidade e bairro.
  - Regras: mínimo de lojas, dominância, supressão secundária no espaço e no tempo, pai oculto oculta os filhos.
  - Só agrega GTINs pedidos ou aprovados em alguma carteira (minimização).
  - O job roda a cada hora, de madrugada e para o histórico dos produtos novos.
- **Três barreiras no banco** (V78):
  - os agregados não têm coluna de loja;
  - a RLS só deixa passar célula publicada de GTIN aprovado dentro da área do contrato;
  - a API da indústria lê sob `SET LOCAL ROLE mf_industry_reader`, que não alcança `invoices`.
- **Superadmin, em Indústria:**
  - **Indústrias:** cadastro, acessos, carteira verde/amarelo/vermelho, contratos, prévia obrigatória e auditoria.
  - **Privacidade e dados:** regras com histórico e confirmação para afrouxar, lojas e recálculo.
  - **Cobrança:** GTIN-mês com faixas, fatura no Asaas, baixa pelo aviso e suspensão após 7 dias de atraso.
- **Portal** (`/industria`): Hoje, Mapa, Produtos (com pedido de liberação), Categoria e Contrato/cobertura.
- **Lado da loja:** cartão "Seus dados e a indústria" em Minha assinatura. Grátis participa; pago pode sair.
- **Decisão 1 aplicada como padrão:** mínimo de 3 lojas e dominância de 70%, ajustáveis no superadmin.
- **Ficou para depois:** recompra agregada, efeito de promoção por janela, API para a indústria e domínio próprio
  `industria.mercadoflow.com`. Hoje o portal está em `/industria`.

## 9. Decisões que ficam com o dono

1. **Mínimo de lojas no sell-out:** manter "nenhum", como registrado, ou adotar **3**, como no
   sell-in (recomendado).
2. **Participação:** confirmar "Grátis obrigatório, pago pode sair" e se haverá **valor de volta**
   para as lojas.
3. **Preços dos pacotes:** validar os valores de partida com indústrias-piloto.
4. **Frescor:** atraso de publicação de 2h (recomendado) ou menor, só no nível cidade.
5. **Participação na categoria:** oferecer ou não, e com quais limites (5 marcas, 60%).
6. **Domínio e marca do portal:** `industria.mercadoflow.com` e o nome do produto.
