# Painel do supermercadista: menos telas, fluxos de 3 passos

Proposta de 06/10/2026. O design não muda: continuam a doca escura, o título grande com a palavra marcada, a órbita de ações ao lado do título, os painéis verde-escuros e o Tino. O que muda é **o que existe**, **onde fica** e **quanto texto aparece**.

---

## 1. Diagnóstico

### 1.1 O tamanho do painel hoje

| Área | Páginas | Abas dentro das páginas |
|---|---|---|
| Hoje | Hoje, Copiloto, Todas as decisões, Semana e rede | Copiloto: Para decidir / Histórico / Como funciona. Todas as decisões: O que fazer / O que está acontecendo / Decisões tomadas / No que deu |
| Comprar | Pedido inteligente | Decidir agora / Pedidos / Onde investir / Lista de compras / Fornecedores. Dentro da lista: Na lista / Pendentes / Comprados / Sugestões |
| Produtos | Catálogo, Clientes | Pedem atenção / Todos os produtos / Combos / Previsão |
| Vender | Promoções, Encartes, Mapa da loja | Promoções: O que promover / Campanhas / Efetividade. Mapa: Montar / Calor / Sugestões × Planta / 3D / Corredor |
| Loja | Caixas e agente, Minha assinatura, Equipe, Planos, Conta | Caixas: Caixas / Chaves / Instalar |

São **15 páginas e cerca de 30 abas**. Isso dá uns 45 lugares para o dono procurar alguma coisa.

### 1.2 A mesma pergunta respondida em 8 lugares

A pergunta "**o que eu faço agora?**" tem resposta em:

1. Hoje → Resumo do dia ("Merecem atenção hoje")
2. Hoje → "Agora importa"
3. Copiloto → Para decidir
4. Todas as decisões → O que fazer
5. Comprar → Decidir agora
6. Produtos → Pedem atenção
7. Promoções → O que promover
8. Encartes → O que promover

A pergunta "**no que deu o que eu decidi?**" tem resposta em 3 lugares: Hoje → Acompanhando, Todas as decisões → Decisões tomadas e No que deu, e Copiloto → Histórico.

O atalho "**Perguntar aos dados**" aparece até 4 vezes na mesma tela: no botão do topo, na barra da doca, na órbita do título e nos chips do resumo.

Cada lista usa um recorte e uma ordem diferente. O dono não sabe qual é a "verdadeira", nem se aceitar algo numa tela resolve a mesma coisa na outra.

### 1.3 O que falta: os números da operação

Hoje o dono não encontra, numa olhada, o básico que todo supermercadista confere todo dia:

- quanto vendeu hoje e se foi melhor ou pior que o mesmo dia da semana passada;
- quantos clientes passaram (cupons) e o ticket médio;
- em que hora vendeu, e se o movimento está atrasado em relação ao normal;
- qual departamento puxou e qual caiu;
- o que vendeu mais.

**A API já calcula quase tudo isso.** O endpoint `/analytics/cockpit`, que o Início já chama, devolve:

- `totalRevenue`, `averageTicket`, `totalTransactions` e `growthPercentage`;
- `hourlySeasonality` e `weekdaySeasonality`;
- `salesTrend`, `topProducts` e `slowMovers`.

A tela usa só "R$ X vendidos hoje", numa linha de subtítulo, e o gráfico por dia da semana. A falta é de apresentação, não de dado.

### 1.4 Texto demais

Cada página repete a mesma estrutura:

- título de duas linhas;
- subtítulo explicativo;
- órbita com 2 ou 3 ações (uma delas quase sempre "Perguntar aos dados");
- um painel escuro explicando o que a tela fará "quando houver dados".

O Início tem **9 blocos**: resumo, agora importa, por trás da decisão, como está vendendo, pedidos para enviar, acompanhando, produtos que pedem atenção e o rodapé "Tino lê cada venda / Você decide / O pedido sai pronto". O rodapé é texto de apresentação do produto, não da operação.

---

## 2. O que a comunidade faz

**Sistemas de caixa para pequeno varejo**
- **Square** e **Shopify** abrem com as vendas do período, comparadas com um período anterior, logo no topo da primeira tela. No Shopify, o padrão é hoje contra ontem. Relatórios e recomendações ficam um nível abaixo. ([Shopify, painel de visão geral](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard); [Square, relatórios](https://squareup.com/help/us/en/article/5381-in-app-summaries-and-reports))
- **Toast Now**, o app do dono de restaurante, mostra no topo duas barras de vendas e equipe, hora a hora. Ele compara com o mesmo dia da semana passada e do ano anterior. Mais de 35% dos usuários abrem o app 10 ou mais vezes por semana: é um app de **olhar rápido**, não de explorar. ([Toast Now](https://pos.toasttab.com/blog/on-the-line/toast-now-guide))

**Guias de painel de varejo**
- Recomendam **6 a 8 indicadores por tela**. A primeira tela diz se o negócio está no rumo e onde olhar; o segundo nível explica o porquê; o terceiro desce ao produto. ([Umbrex, painel de varejo](https://umbrex.com/resources/retail-industry-playbooks/retail-kpi-dashboard-weekly-business-review-playbook/designing-the-retail-kpi-dashboard/); [UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/))
- "Todo número precisa ter um uso de gestão claro." ([UXPilot](https://uxpilot.ai/blogs/dashboard-design-principles))

**Indicadores do supermercadista brasileiro**
- **Todo dia:** faturamento, número de clientes, ticket médio, vendas por departamento e rupturas importantes.
- **Toda semana:** margens, perdas, estoque, campanhas e resultado de promoções.
- **Todo mês:** DRE e comparação entre lojas.
- Fonte: ([Expo Supermercados](https://www.exposupermercados.com.br/post/os-principais-indicadores-que-todo-supermercadista-deve-acompanhar-diariamente))

**Por que reduzir telas e por que "3 passos"**
- **Consolidar** telas que respondem à mesma pergunta é a correção mais comum de produto inchado. Num caso documentado, 7 itens de menu viraram 4 centrais por tarefa, e as tarefas ficaram 62% mais rápidas. ([Sigma7](https://sigma7.org/case-studies/b2b-saas-dashboard-ux/))
- **"3 passos" é regra de projeto, não lei.** A Nielsen Norman Group mostrou que a contagem de cliques, sozinha, não muda sucesso nem satisfação. O que muda é a **pista**: cada passo deixa claro que o próximo leva aonde se quer chegar. ([NN/g](https://www.nngroup.com/articles/3-click-rule/))
- Por isso a regra aqui é: **ver → entender → agir**. Cada passo tem um nome óbvio e nenhum é um beco.

---

## 3. A proposta

### 3.1 Princípio: uma pergunta por área

A doca continua com 5 botões, mas cada um responde **uma** pergunta:

| Doca | Pergunta do dono | O que tem dentro |
|---|---|---|
| **Início** | Como está a loja hoje? | Os números da operação mais as 3 decisões que mais valem |
| **Decidir** (era Hoje → Copiloto / Todas as decisões) | O que eu faço agora? | **Uma fila única** com todas as sugestões, e "No que deu" |
| **Comprar** | O que eu peço e para quem? | Pedidos (rascunho → enviado → recebido) e fornecedores |
| **Produtos** | Como vai este produto? | Uma lista com busca e filtros, e a ficha do produto |
| **Vender** | Como eu vendo mais? | Campanha (sugestão → encarte → resultado) e mapa da loja |

"Loja" sai da doca e vai para o menu do avatar: caixas, assinatura e planos, equipe, conta. São coisas de configurar uma vez, não de olhar todo dia. O estado do agente vira um selo no topo, no lugar de "Tino acompanhando a loja": "Caixas enviando · última nota há 2 min". Um alerta vermelho aparece só quando o agente para.

**Resultado:** de 15 páginas e cerca de 30 abas para **8 páginas e no máximo 2 abas por página**.

### 3.2 Para onde vai cada tela de hoje

| Hoje | Vai para | Como |
|---|---|---|
| Hoje (9 blocos) | **Início** | 4 blocos: números do dia, vendas por hora, departamentos, 3 decisões |
| Copiloto / Para decidir | **Decidir** | Vira a própria fila |
| Todas as decisões / O que fazer | **Decidir** | Mesma fila (eram duas listas da mesma coisa) |
| Todas as decisões / O que está acontecendo | **Início** | Sinais viram números e setas no painel |
| Decisões tomadas + No que deu + Copiloto / Histórico + Acompanhando | **Decidir → No que deu** | Uma aba só |
| Copiloto / Como funciona | Avatar → Conta → Tino | Ajuste feito uma vez |
| Semana e rede | **Início** | Seletor Hoje / Semana / Mês; a comparação de filiais aparece só com mais de uma loja |
| Comprar / Decidir agora | **Decidir** (filtro "Comprar") | |
| Comprar / Onde investir | **Decidir** (filtro "Dinheiro parado") | |
| Comprar / Lista de compras | **Comprar** | A lista é o rascunho do pedido, não uma tela à parte |
| Comprar / Pedidos + Fornecedores | **Comprar** | Duas abas |
| Produtos / Pedem atenção | **Produtos** (filtro) | "Acabando", "Caindo", "Em alta", "Parado" viram filtros da lista |
| Produtos / Combos e Previsão | **Ficha do produto** | "Vende junto com" e "Previsão das próximas semanas" |
| Clientes | **Início** (1 número) + **Vender** (o que traz de volta) | Sem página própria enquanto não há CPF suficiente |
| Promoções / O que promover | **Decidir** (filtro "Promover") | |
| Promoções / Campanhas + Efetividade + Encartes | **Vender → Campanhas** | Um fluxo só, e o resultado aparece na mesma campanha |
| Mapa da loja | **Vender → Mapa da loja** | Fica como está (é ferramenta, não relatório) |
| Caixas, Assinatura, Planos, Equipe, Conta | **Menu do avatar** | Planos dentro de Assinatura |
| Exportar para planilha (hoje em Clientes) | **Início** e **Produtos**, botão "Baixar planilha" | Junto do dado que exporta |

### 3.3 O Início: o painel que falta

```
┌────────────────────────────────────────────────────────────────────┐
│ Boa tarde, Dono. Hoje a loja vendeu  R$ 18.420.       ( órbita )   │
│ 6% a mais que terça passada até esta hora.            · Decidir (3)│
│                                                       · Comprar    │
│ [ Hoje ]  Semana   Mês                                · Produtos   │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│ Vendas       │ Clientes     │ Ticket médio │ Itens por compra      │
│ R$ 18.420    │ 412          │ R$ 44,70     │ 7,1                   │
│ ▲ 6%         │ ▲ 2%         │ ▲ 4%         │ ▼ 1%                  │
├──────────────┴──────────────┴──────────────┴───────────────────────┤
│ Vendas por hora   ▁▂▅▇▆▄▃▅▇█▆  (barra = hoje, linha = terça normal) │
├──────────────────────────────────┬─────────────────────────────────┤
│ Departamentos                    │ Decida agora (o que mais vale)  │
│ Açougue        ▲ 18%  R$ 3.210   │ 1 Comprar Café 500g   R$ 800    │
│ Bebidas        ▲ 9%   R$ 2.880   │ 2 Liquidar Óleo 900ml R$ 1.200  │
│ Hortifruti     ▼ 12%  R$ 1.140   │ 3 Avisar Atacado Bom Preço      │
│ ...                              │        Ver as 11 decisões       │
└──────────────────────────────────┴─────────────────────────────────┘
```

**Regras do Início**
- Os 4 números comparam **com o mesmo dia da semana passada, até a mesma hora**, como no Toast. Em mercado, terça se compara com terça.
- Tocar num número abre o porquê numa gaveta lateral. "Vendas ▲ 6%" mostra os departamentos e produtos que mais mudaram.
- O seletor Hoje / Semana / Mês substitui a página "Semana e rede". O resumo semanal do Tino aparece aqui às segundas, como **um cartão**, não uma página.
- A margem estimada só entra quando houver custo de compra para a maior parte do que se vendeu. O custo vem do histórico de preço de compra (V23) e das notas de entrada. Sem custo, o número não aparece: melhor faltar do que mostrar margem errada.
- O "Resumo do dia" do Tino continua, mas como **uma frase** acima dos números, com o botão "Ouvir". A lista "merecem atenção" sai: ela repete o bloco "Decida agora".
- Saem do Início: "Por trás da decisão" (abre ao tocar na decisão), "Acompanhando" (vai para Decidir → No que deu), "Produtos que pedem atenção" (filtro em Produtos) e o rodapé de apresentação.

### 3.4 Decidir: uma fila só

A fila junta tudo que hoje está em 8 lugares:

- **Ordem:** pelo valor em reais, como já faz o "Agora importa".
- **Filtros:** Comprar, Promover, Liquidar, Preço e Dinheiro parado.
- **Cada cartão segue 3 passos:**
  1. **ver** o que é, quanto vale e por quê, em uma linha;
  2. **entender**, ao tocar: abre o cálculo e o histórico do produto;
  3. **agir**: Aceitar, Ajustar ou Não faz sentido.
- **O efeito do aceite fica dito no botão:** "Aceitar e pôr no pedido do Atacado Bom Preço", "Aceitar e criar campanha".
- **A aba "No que deu"** reúne o histórico, o "acompanhando" e a medição de 30 dias.
- **O Copiloto** (aprovar o que o Tino preparou) deixa de ser uma página. É a mesma fila, com um selo "Tino preparou" e o botão "Aprovar".

### 3.5 Os fluxos principais em 3 passos

| Tarefa do dono | Passo 1 (ver) | Passo 2 (entender) | Passo 3 (agir) |
|---|---|---|---|
| Ver como a loja está | Abre o app: 4 números do dia | Toca no número que mudou | Toca no produto ou departamento e decide (comprar ou promover) |
| Repor o que vai faltar | Decidir → filtro Comprar | Toca no cartão: venda diária, dias até acabar, quantidade sugerida | "Aceitar e pôr no pedido" |
| Enviar o pedido | Comprar: pedidos em rascunho por fornecedor | Confere itens e total | "Enviar ao fornecedor" (WhatsApp ou e-mail) |
| Entender um produto | Produtos: busca ou filtro | Ficha: vendas, tendência, preço, vende junto, previsão | Comprar, promover ou mudar preço |
| Fazer uma promoção | Decidir → Promover, ou Vender → Nova campanha | Escolhe produtos e preço (com a simulação do impacto) | "Gerar encarte" → publicar. O resultado aparece na campanha e em "No que deu" |
| Perguntar algo | Escreve ou fala na doca | Lê a resposta com o número e a fonte | Botão de ação na própria resposta |
| Receber mercadoria | Comprar → pedido enviado | Confere com a nota (Confere) | "Recebido" |

### 3.6 Regras de texto (valem para todas as telas)

- **Título:** uma linha, com a palavra marcada, dizendo o **estado**, não a promessa. "Hoje a loja vendeu R$ 18.420", e não "Entenda cada produto. Decida o próximo passo."
- **Subtítulo:** no máximo uma frase, e só se trouxer um número ou um fato.
- **Órbita:** até 3 ações, nunca "Perguntar aos dados", que já está na doca. Sai também o botão do topo, que repete a doca.
- **Estado vazio:** uma linha do que falta mais um botão do que fazer. Exemplo: "Ainda sem vendas de hoje. Ver os caixas". Os painéis explicativos com passos ("Notas chegando → Preços variando → O que vale descontar") saem e passam a ficar só em Ajuda.
- **Cada bloco** responde a uma pergunta; se duas respondem à mesma, uma sai.
- **Nomes:** os termos do dono, sempre os mesmos em todo lugar. Exemplos: "Decidir" em vez de "Copiloto / Todas as decisões / Agora importa"; "Dinheiro parado" em vez de "Capital de giro / Onde investir".

---

## 4. Ordem de implantação

| Fase | O que entrega | Muda o backend? |
|---|---|---|
| **F1. Início com os números** | Painel de 4 números, vendas por hora e departamentos (com dados do `cockpit`), seletor Hoje/Semana/Mês, comparação com o mesmo dia da semana passada até a mesma hora. Tira 5 blocos do Início. | Pouco: uma comparação "até esta hora" e a soma por departamento, se o cockpit ainda não tiver |
| **F2. Fila única Decidir** | Junta Copiloto, Todas as decisões, Comprar/Decidir agora, Pedem atenção e O que promover numa tela com filtros e a aba "No que deu". As rotas antigas redirecionam para o filtro certo. | Não: as fontes já existem (`intelligence/feed`, `opportunities`, copiloto) |
| **F3. Comprar e Vender enxutos** | Comprar com 2 abas (lista = rascunho do pedido); Vender com Campanhas (promoção + encarte + resultado) e Mapa da loja | Não |
| **F4. Loja no avatar e limpeza de texto** | Menu do avatar, selo do agente no topo, títulos de estado, órbitas sem "Perguntar" e estados vazios curtos em todas as telas | Não |

Cada fase vai sozinha para produção e não quebra links: as rotas antigas redirecionam.

### Como saber se funcionou

- **Teste com 5 donos de mercado** (um dos clientes atuais e conhecidos), com 4 tarefas cronometradas: "quanto vendeu hoje comparado à semana passada", "o que vai faltar", "mande o pedido" e "faça uma promoção do que está parado". Hoje e depois de cada fase.
- **Pelos dados de uso:** tempo do login até a primeira decisão aceita; quantos donos abrem o Início todos os dias; quantas decisões são aceitas ou recusadas versus ignoradas.

---

## 5. O que esta proposta não muda

- O visual Flow: cores, tipografia, doca, órbita, painéis escuros e a marca do título.
- O Tino, a pergunta por voz e por texto, e o Copiloto como motor (só deixa de ser uma página à parte).
- O Mapa da loja e o estúdio de encartes como ferramentas.
- Nenhuma regra de plano: o que cada plano libera continua igual, só muda o lugar onde aparece.

---

## 6. O que foi implementado (06/10/2026)

**Navegação**
- A doca tem Início, Decidir, Comprar, Produtos e Vender.
- "Loja" foi para o menu do avatar: Caixas e agente, Assinatura e planos, Equipe, Conta e "Como o Tino trabalha".
- O topo mostra o selo dos caixas ("Caixas enviando · há 2 min", ou em vermelho quando o agente para) no lugar de "Tino acompanhando a loja" e do botão "Perguntar aos dados", que já está na doca.

**Início**
- Novo endpoint `GET /api/v1/markets/{id}/analytics/operation?period=dia|semana|mes` (`OperationPanelService`).
- Vendas, clientes, ticket médio e itens por compra, comparados com o mesmo dia da semana anterior até a mesma hora.
- Vendas por hora contra a média das 4 últimas semanas no mesmo dia, e vendas por dia na semana e no mês.
- Departamentos, mais vendidos e quem puxou para cima ou para baixo.
- Margem estimada só quando o custo cobre 60% ou mais do vendido.
- Sem venda hoje, o painel mostra o último dia com venda e diz isso, em vez de zero.
- Os itens das notas são lidos uma vez só: o mês caiu de 7 s para 0,4 s com RLS.
- O resumo do Tino virou uma faixa de uma frase, com Ouvir, Falar e Aprovar.
- Resumo semanal, comparação de lojas, clientes que voltam e planilhas viraram linhas no Início.

**Decidir** (`/app/decidir`)
- Uma fila única com as recomendações, o que o Tino preparou e os sinais sem ação.
- Ordem: urgente primeiro, depois o que vale mais.
- Filtros: Comprar, Promover, Dinheiro parado, Preço, Entregas e Atenção.
- Em Comprar, a primeira linha põe todas as compras no pedido de uma vez.
- Em Dinheiro parado aparece "Onde investir"; em Promover, "O que vale promover".
- A aba "No que deu" junta o acompanhamento, o resultado medido, as recomendações decididas e a memória do Tino.
- `/app/copiloto` e `/app/inteligencia` redirecionam para cá.

**Comprar**
- Abas: Pedidos (a mesa de enviar e receber, mais os concluídos) e Fornecedores.
- A lista de compras abre pela órbita e volta para Pedidos.

**Produtos**
- Uma lista com filtros: Acabando, Vendendo menos, Em alta e Parados.
- A ficha tem 3 abas (Vendas, Preço, Vende junto), com a decisão de compra no topo.

**Vender**
- Campanhas tem 2 abas: Campanhas e Resultado das promoções. Encartes e o Mapa da loja continuam.

**Texto**
- Órbitas sem "Perguntar aos dados", faixas de explicação removidas e subtítulos que só repetiam o título removidos.

**Pendente:** o cockpit de 90 dias (6 s) e a lista de produtos (4 s) continuam lentos com RLS, porque cada item confere a nota dona. Já era assim antes. O Início não usa mais o cockpit, e Comprar não espera mais por ele.
