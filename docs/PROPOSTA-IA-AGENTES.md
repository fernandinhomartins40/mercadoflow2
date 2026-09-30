# MercadoFlow Copiloto — proposta de IA, assistente por voz e agentes

Versão 7 · 30/09/2026 (texto pronto + Jev antes do DeepSeek em todo o fluxo; painel de APIs no superadmin) · proposta para decisão do dono do produto

---

## 1. Resumo

O MercadoFlow já tem muita inteligência, mas quase toda ela está **calculada e parada na tela**: o
lojista precisa abrir o sistema para ver. A proposta é transformar essa inteligência em um
**Copiloto** que trabalha sozinho e fala com o supermercadista, por texto e por voz, onde ele
estiver (celular, WhatsApp, caixa, doca).

Três peças novas, sobre o que já existe:

1. **Assistente pessoal (Copiloto):** responde perguntas, lê o resumo do dia em voz alta e executa
   ações com um "sim" do lojista (aceitar uma recomendação, gerar um pedido, montar um encarte).
2. **Agentes:** "funcionários digitais" especializados (compras, recebimento, preço, vendas,
   promoções) que vigiam a operação o tempo todo e só chamam o dono quando há algo que vale dinheiro.
   Quem vigia 24 horas é o **motor de cálculo** (sem token); o **Jev** filtra o que merece atenção por
   frações de centavo; o **DeepSeek** só escreve para o pouco que passa pelo filtro (seção 6.5).
3. **Créditos de IA:** a plataforma compra créditos no DeepSeek e revende pacotes aos mercados, com
   margem, igual já fazemos com as leituras do Meu Danfe no Confere.

A regra de ouro continua: **quem calcula é o sistema; a IA explica, conversa e opera**. Isso é o
que deixa o custo baixo (a maior parte da inteligência não gasta token) e o que impede a IA de
inventar número numa decisão de compra.

A economia de tokens vem do padrão que a comunidade de desenvolvedores está usando em 2026:
**Jev + modelo de linguagem**. O Jev (TypeSafe AI) toma as decisões fechadas — qual ferramenta,
qual agente, merece alerta, a ação é segura, precisa do modelo forte — a US$ 0,042 por milhão de
tokens e sem cobrar saída; o DeepSeek só entra para escrever e planejar. Detalhes na seção 8.

---

## 2. Onde estamos hoje

### 2.1 Inteligência calculada (não gasta IA)

Roda no servidor, com fórmulas e estatística. É o **motor** do produto e continua sendo.

| Rotina | Quando | O que faz |
|---|---|---|
| Agregação diária | 2h | consolida vendas do dia |
| Cesta de compras | 2h30 | o que é comprado junto (efeito "puxa venda") |
| Inteligência de produto | 3h | capital, estoque estimado, giro, cobertura, curva ABC/XYZ |
| Detecção de oportunidades | 3h30 | capital parado, reposição, promoção, queda de venda, preço acima do mercado |
| Previsão de demanda | 4h | Holt-Winters com sazonalidade por dia da semana e intervalo de confiança |
| Avaliação de resultado | segunda, 4h | mede o que aconteceu depois de cada decisão aceita (aprendizado; vira "lições" na seção 6.6) |
| Resumo semanal | segunda, 5h | números da semana |
| Atualização adaptativa | a cada 5 min | acompanha o dia da loja em tempo quase real |
| Preços de mercado | a cada 15 min | preço praticado × concorrência |
| Confere | 10/15 min | notas do fornecedor, itens, estoque recebido, agregado anônimo |

Serviços prontos: simulação de preço, demanda esperada, inteligência de cliente, ritmo da loja,
anomalia de vendas, efeito halo, comparação com mercado, rede de lojas, precisão da previsão.

### 2.2 IA generativa (gasta token)

| Função | Como funciona hoje |
|---|---|
| Leitura das oportunidades | a IA escreve 2 a 4 frases explicando cada oportunidade (até 40 por noite) |
| Resumo da semana | a IA escreve o retrospecto da segunda-feira |
| Pergunte aos dados | chat com 10 ferramentas de consulta; a IA escolhe, o sistema consulta, a IA responde |
| Criador de temas (superadmin) | DeepSeek com visão marca as áreas do fundo do encarte |

Base técnica que já serve para o que vem:

- **Orquestrador único** com cadeia de provedores, quarentena de provedor com defeito, cache por
  hash dos números e texto do sistema como piso (a IA nunca é peça obrigatória).
- **Ferramentas tipadas** (padrão "tool calling"): o mesmo mecanismo que um agente usa para agir.
- **Lista de permissão de dados**: só métricas prontas saem da loja, nunca CPF, CNPJ ou chave de nota.
- **Registro de uso** por chamada: provedor, modelo, tokens, tempo e resultado. É a base da cobrança.
- **Carteira de créditos do Confere**: extrato, pacotes, Pix com QR e confirmação, Stripe, painel do
  superadmin. É exatamente o que a revenda de IA precisa.

#### Onde a IA generativa de hoje desperdiça

Levantamento no código (30/09/2026). Hoje quem paga são os mercados, com a própria chave; na
revenda, passa a ser a plataforma.

| Função | Custo por mercado/mês | Com 1.000 mercados | Problema |
|---|---|---|---|
| Leitura das oportunidades | ~R$ 1,80 | ~R$ 1.800 | refeita toda noite e gerada mesmo sem ninguém ler |
| Resumo da semana | ~R$ 0,06 | ~R$ 60 | nenhum: um texto por semana, vale o custo |

Por que a leitura das oportunidades é refeita toda noite: o texto enviado à IA inclui "situação já
detectada N vezes" e a cobertura com casa decimal ("3,2 dias"). Esses valores mudam a cada
detecção, o hash muda e o cache nunca acerta para oportunidade que continua aberta. Além disso, a
rotina gera até 40 textos por mercado por noite, mesmo que o lojista não abra a Central de
Inteligência.

Cortes previstos na fase F0 (seção 11), com estimativa de ~R$ 1,80 → **~R$ 0,15 por mercado/mês**:

1. **Gerar só quando alguém lê:** o texto da IA nasce quando o lojista abre a oportunidade ou toca
   em "Por quê?"; até lá, o texto do sistema (que já existe) aparece.
2. **Cache estável por faixas:** sai a contagem exata de dias e entram faixas ("cobertura baixa",
   "há mais de uma semana"); o texto só é refeito quando a situação muda de verdade.
3. **Jev decide se vale:** "o texto do sistema já explica bem?" antes de chamar o DeepSeek; só o que
   tem impacto relevante ganha texto da IA.
4. **IA só no pacote pago:** plano grátis fica com o texto do sistema.
5. **Teto de créditos por mercado**, como no resto do Copiloto.

### 2.3 O que falta

- A IA só **responde**; não **age** e não **avisa sozinha**.
- Não existe voz, nem canal fora da tela (WhatsApp, notificação no celular).
- O modelo atual de cada mercado trazer a própria chave não gera receita e afasta o lojista comum.
- Não há escolha de modelo por tarefa nem cobrança por uso.

---

## 3. A visão: o Copiloto

> Às 6h40 o celular do dono vibra. Ele toca no fone e ouve: *"Bom dia. Ontem você vendeu R$ 18.420,
> 6% acima da terça passada. O leite condensado vai acabar amanhã: preparei o pedido de 3 caixas com
> o fornecedor mais barato das últimas notas. Aprovar?"* Ele responde "aprova". Às 10h, na doca, a
> nota da Spal chega com 2 fardos faltando; o agente de recebimento já montou a mensagem para o
> fornecedor. Às 15h: *"A banana está 18% acima dos mercados do seu bairro e parou de sair. Quer
> baixar para R$ 4,49 até sábado?"*

Isso é o Copiloto: o sistema **observa, calcula, decide o que merece atenção, prepara a ação e pede
um sim**. O lojista para de "olhar o sistema" e passa a "conversar com o gerente digital".

### Princípios

1. **Número vem do motor, nunca da IA.** A IA só cita número que veio de uma ferramenta.
2. **Ação com rastro e com dono.** Toda ação tem autor (qual agente), motivo, números e aprovação.
3. **Autonomia gradual e escolhida pelo lojista** (seção 6.3).
4. **Sem crédito, nada quebra.** O motor calculado e os textos do sistema continuam funcionando.
5. **Barato por construção:** primeiro regra e **texto pronto do motor**, depois o Jev, depois o
   modelo barato, e só no fim o modelo forte (seção 5). O DeepSeek escreve só o que não cabe num
   texto pronto: resposta a pergunta aberta, "por quê?" pedido pelo lojista e plano sob medida.
6. **Privacidade:** sai da loja só o necessário, e o lojista sabe o que sai e para onde.

---

## 4. Arquitetura

```
 Canais          App web · PWA · Voz · WhatsApp · Notificação
                                  │
 Copiloto        entende o pedido → escolhe agente/ferramenta → responde / pede aprovação
                                  │
 Agentes         Compras · Recebimento · Preço · Vendas · Promoções · Gerente (orquestra)
                                  │
 Roteador        regra ─► decisão local ─► modelo barato ─► modelo forte   (+ carteira de créditos)
 de IA                            │
 Ferramentas     consultas e ações tipadas, com permissão por agente e auditoria
                                  │
 Motor           tudo da seção 2.1 (já existe)
```

### 4.1 Componentes novos

| Componente | Função | Reaproveita |
|---|---|---|
| **Roteador de IA** | escolhe camada e modelo por tarefa; debita créditos; aplica teto | `AiOrchestrator`, `LlmClient`, `AiTaskProfile` |
| **Carteira de IA** | saldo, extrato, pacotes, Pix/Stripe, teto mensal por mercado | carteira do Confere |
| **Catálogo de ferramentas** | consultas (já são 10) + ações (novas) com nível de permissão | `DataTool` |
| **Executor de agentes** | roda agentes por horário ou evento, com orçamento e limite de passos | jobs existentes |
| **Caixa de decisões** | fila de ações preparadas esperando o sim do lojista | Central de Inteligência |
| **Memória da loja** | resumos prontos por dia/semana/mês, lições aprendidas, preferências, histórico de aceites e recusas | `OutcomeEvaluationJob`, resumo semanal |
| **Montador de contexto** | escolhe, com o Jev, só os pedaços de memória relevantes para cada chamada ao DeepSeek | novo (seção 6.6) |
| **Voz** | fala → texto, texto → fala, modo mãos livres | novo (seção 7) |
| **Canal WhatsApp** | resumo, alerta e aprovação por mensagem | novo |
| **Textos prontos** | modelos de frase com variações para avisos, resumos, lições e mensagens ao fornecedor | texto do sistema atual, texto do WhatsApp do Confere |
| **Painel de APIs** | chaves, modelos, roteamento, orçamentos e console de teste no superadmin | configuração da IA dos temas e do Meu Danfe (seção 4.3) |

### 4.2 Eventos que acordam os agentes

Além dos horários fixos, os agentes reagem a acontecimentos que o sistema já detecta:

- nota do fornecedor chegou (Confere, Sefaz);
- conferência encerrada com diferença;
- venda do dia desviando do esperado (atualização a cada 5 min);
- produto a X dias de acabar (cobertura);
- preço de concorrente mudou;
- oportunidade nova de alto impacto.

### 4.3 Painel de APIs no superadmin (primeira entrega, para começar os testes)

Uma página nova no superadmin, **IA e APIs**, onde o dono da plataforma cadastra as chaves e liga os
testes sem mexer em código nem no servidor. Hoje já existem duas telas parecidas: a chave do
DeepSeek dos temas de encarte e a chave do Meu Danfe no Confere. A página nova generaliza as duas.

**1. Chaves dos provedores**

| Provedor | Uso | Campos |
|---|---|---|
| DeepSeek | modelo de linguagem (Flash e Pro) | chave, modelo padrão, horário de desconto |
| OpenRouter | Jev e modelos de reserva (Qwen, MiniMax, Kimi) | chave, modelos habilitados |
| Deepgram (depois) | voz paga | chave |
| WhatsApp Business (depois) | canal de mensagens | token, número |

- A chave é **cifrada** com a mesma chave mestra do servidor, **nunca volta para a tela** (só os 4
  últimos dígitos) e nunca aparece em log.
- Endereços **fixos por provedor**: o formulário não aceita URL livre, o que fecha a porta para
  mandar a chave a um servidor falso.
- Botão **Testar** por provedor: chamada mínima, mostra se respondeu, o tempo e o saldo informado
  pelo provedor, quando ele informa.
- Liga e desliga por provedor, e ordem da cadeia de reserva.

**2. Roteamento por tarefa**

Tabela editável com as tarefas da seção 5.1: para cada uma, a camada (texto pronto, Jev, Flash,
Pro), o modelo, o teto de tokens de contexto e o limite de confiança do Jev. Mudar o roteamento
não exige deploy.

**3. Orçamento e segurança do gasto**

- teto de gasto diário global da plataforma (a IA para e o produto segue com texto pronto);
- alerta de saldo baixo no DeepSeek e na OpenRouter (e-mail e aviso no painel);
- teto mensal padrão por mercado e por pacote;
- valor do crédito e quantos créditos cada tarefa debita.

**4. Piloto controlado**

- lista de **mercados de teste**: só eles usam a chave da plataforma no começo;
- **modo sombra** por tarefa: o Jev decide em paralelo sem afetar o produto, e o painel compara
  a decisão dele com a do DeepSeek e com a do lojista (é assim que medimos o acerto em português);
- botão de desligar tudo (volta ao texto pronto em todos os mercados).

**5. Console de teste**

Campo para rodar uma tarefa de verdade contra um mercado de teste ("quanto vendi ontem?",
"explique esta oportunidade", "plano de compras de laticínios") e ver:

- qual camada respondeu (texto pronto, Jev, Flash, Pro) e por quê;
- os pedaços de contexto escolhidos pelo Jev;
- tokens de entrada e saída, custo em reais e tempo;
- a resposta final.

**6. Relatório de uso**

Gasto por dia, por provedor, por tarefa e por mercado; percentual resolvido por texto pronto, pelo
Jev e por modelo; aproveitamento do cache; receita de créditos × custo. A base já existe: o registro
de uso grava provedor, modelo, tokens, tempo e resultado de cada chamada.

Acesso: só perfil superadmin, e toda alteração (chave trocada, roteamento, teto) fica registrada com
quem fez e quando.

---

## 5. Roteador de IA: o modelo certo para cada tarefa

A economia vem de **não chamar modelo grande para o que uma regra resolve**. Quatro camadas:

| Camada | O que é | Custo | Exemplos no MercadoFlow |
|---|---|---|---|
| **0 · Regra e cálculo** | o motor atual | zero | "quanto vendi hoje", "o que acaba amanhã", alertas por limite |
| **1 · Decisão** | Jev (API de decisão) — e, no futuro, LAYA local | ~R$ 0,0007 por decisão (3 mil tokens de entrada) | qual ferramenta, qual agente, "merece alerta?", "a ação é segura?", "precisa do modelo forte?" |
| **2 · Modelo barato** | DeepSeek V4.1 Flash | centavos | conversa, resumo do dia, explicação de oportunidade, mensagem ao fornecedor |
| **3 · Modelo forte** | DeepSeek V4 Pro (depois Qwen, Kimi) | ~4× a camada 2 | plano de compras da semana, cenário "e se", negociação com vários fornecedores |

### 5.1 Tabela de roteamento inicial

| Tarefa | Camada | Modelo inicial | Observação |
|---|---|---|---|
| Resposta a pergunta com número direto | 0 + 1 | Jev escolhe a ferramenta | o motor consulta e responde com texto pronto, sem modelo de linguagem |
| Escolher ferramenta / agente para a pergunta | 1 | Jev | se a confiança for baixa, o Flash escolhe |
| Decidir se precisa do modelo forte | 1 | Jev (nota de dificuldade) | roteia entre Flash e Pro |
| Conversa com ferramentas | 2 | V4.1 Flash | recebe só a ferramenta já escolhida e o resultado; temperatura 0 |
| Resumo do dia e da semana | 0 + 1 | texto pronto; Jev escolhe os 3 assuntos | DeepSeek só se o lojista pedir "comenta mais" |
| Explicar oportunidade | 0 → 2 | texto pronto; Flash só no "Por quê?" | sob demanda, cache por faixas (seção 2.2) |
| Mensagem ao fornecedor (falta, avaria) | 0 | texto pronto | o Confere já monta essa mensagem sem IA; Flash só se pedirem outro tom |
| Plano de compras da semana | 0 + 1 → 3 | motor calcula; Jev pondera fornecedor | Pro só quando o lojista pede uma estratégia ou negociação |
| Cenário "e se" (feriado, aumento de preço) | 0 → 2 | formulário com campos | cenário por campos roda no motor; Flash só para pergunta livre, e ele só traduz a pergunta em campos |
| Visão (encarte, foto de etiqueta) | 2 | modelo com visão | já usado nos temas |
| Comando de voz curto ("aprova", "mais dois", "avaria") | 0 → 1 | lista fixa de comandos; Jev se não reconhecer | número falado ("baixa para 4,49") é lido pelo código, nunca pelo Jev |
| Guarda da ação preparada pelo agente | 1 | Jev | ação duvidosa vai para aprovação humana |
| Voz | — | serviço de fala (seção 7) | DeepSeek não processa áudio |

### 5.2 Vários modelos juntos (fase posterior)

O `LlmClient` já fala o padrão de API que DeepSeek, Qwen, Kimi, GLM e MiniMax usam, então somar
modelos é configuração, não reescrita. Critério de escolha por tarefa: **custo por tarefa bem
resolvida**, medido no registro de uso (tokens, tempo, aceite do lojista). Preços de referência
(set/2026, por milhão de tokens, entrada/saída):

| Modelo | Entrada | Saída | Bom para |
|---|---|---|---|
| DeepSeek V4.1 Flash (fora do pico) | US$ 0,15 | US$ 0,60 | quase tudo da camada 2 |
| DeepSeek V4 Pro (fora do pico) | US$ 0,66 | US$ 1,98 | camada 3 |
| Qwen 3.5 Flash | US$ 0,10 | US$ 0,40 | alternativa barata e reserva |
| MiniMax M3 | US$ 0,30 | US$ 1,20 | contexto muito longo |
| Kimi K2.6 | US$ 0,95 | US$ 4,00 | agentes com muitos passos |

O DeepSeek **dobra o preço no horário de pico** e cobra ~1/100 na entrada repetida (cache). Duas
regras de economia: rotinas em lote no horário de desconto e instrução fixa sempre igual no começo
da mensagem, para aproveitar o cache.

Cadeia de reserva: se o DeepSeek falhar, o roteador tenta o próximo modelo da lista; se todos
falharem, entra o texto do sistema, como hoje.

### 5.3 Varredura: onde a proposta queimaria token sem precisar

Revisão de cada uso de IA do documento, perguntando: "isto é decisão fechada (Jev), cálculo ou
texto previsível (motor e texto pronto), ou precisa mesmo de um modelo que escreve?".

| # | Onde | Antes | Agora | Economia |
|---|---|---|---|---|
| 1 | Resumo do dia | DeepSeek escreve todo dia | texto pronto com os números do motor; o Jev escolhe os 3 assuntos mais importantes; DeepSeek só se o lojista pedir mais | ~95% |
| 2 | Resumo da semana | DeepSeek escreve | mesmo tratamento do resumo do dia | ~90% |
| 3 | Mensagem ao fornecedor | DeepSeek redige | texto pronto (o Confere já monta a mensagem do WhatsApp sem IA) | ~100% |
| 4 | Avisos dos agentes | DeepSeek explica cada aviso | texto pronto com o número e a ação; explicação só no "Por quê?" | ~90% |
| 5 | Gerente: prioridade do dia | DeepSeek ordena | nota de prioridade do motor + Jev no desempate | ~95% |
| 6 | Vendas: causa provável da queda | DeepSeek analisa | o motor lista as causas possíveis (ruptura, preço, promoção do vizinho, dia atípico) e o Jev escolhe a mais provável | ~90% |
| 7 | Promoções: tema do encarte | DeepSeek escolhe | o Jev escolhe entre os temas cadastrados; os produtos vêm do motor | ~95% |
| 8 | Plano de compras | DeepSeek Pro toda semana | quantidades do motor, fornecedor pelo preço das notas e pelas lições (Jev); Pro só quando pedirem estratégia | ~90% |
| 9 | Cenário "e se" | DeepSeek Pro | formulário com campos no motor; modelo só para pergunta livre | ~80% |
| 10 | Memória (resumos e lições) | DeepSeek escreve um parágrafo por período | frases prontas a partir dos números e dos resultados medidos | ~100% |

Dois cuidados que também saíram da varredura, porque o Jev é fraco em tirar valores de texto
(acerta ~32%):

- **número falado** ("baixa para 4,49", "mais dois") é lido por código, com uma lista fixa de
  comandos e um leitor de números em português;
- **cenário escrito livre** ("e se o fornecedor subir 8%?") vai para o Flash, que só converte a
  frase em campos; quem calcula é o motor.

Textos prontos não precisam soar robóticos: cada aviso tem 3 a 5 variações de frase escolhidas por
regra, com o vocabulário da loja ("dinheiro parado na prateleira", "vai faltar amanhã").

O que continua no DeepSeek, porque precisa de um modelo que escreve ou raciocina:

- resposta a pergunta aberta no chat;
- o "Por quê?" pedido pelo lojista;
- plano ou estratégia sob medida pedido pelo lojista;
- tradução de pergunta livre em campos (cenário, filtro);
- leitura de imagem (tema de encarte, foto de etiqueta).

---

## 6. Agentes

### 6.1 Catálogo inicial

| Agente | Vigia | Prepara | Ferramentas |
|---|---|---|---|
| **Gerente** | tudo | resumo do dia, prioridade, "o que fazer agora" | todas as consultas |
| **Compras** | cobertura, previsão, lead time, preço das últimas notas | rascunho de pedido por fornecedor | reposição, previsão, preços do Confere |
| **Recebimento** | Confere: faltas, avarias, preço que subiu | mensagem ao fornecedor, histórico do fornecedor | conferências, notas |
| **Capital parado** | estoque sem giro | promoção ou liquidação com desconto calculado | capital, simulação de preço |
| **Preço** | preço × bairro e concorrência | ajuste de preço com margem | preço de mercado, margem |
| **Vendas** | desvio do dia, anomalia, ritmo | alerta com causa provável | anomalia, ritmo, cesta |
| **Promoções e encartes** | datas, capital parado, sazonalidade | encarte pronto no Estúdio | Estúdio de encartes, temas |
| **Cenários** | previsão | "e se": feriado, aumento do fornecedor, novo preço | previsão, simulação |

### 6.2 Como um agente trabalha

1. Acorda por horário ou evento (4.2). **Não existe agente "ligado" chamando IA em laço.**
2. Lê os números com ferramentas de consulta, sem inventar nada.
3. Decide se há algo que vale atenção. A **regra decide primeiro, depois o Jev**; o DeepSeek só
   entra quando há algo a explicar ou a planejar (funil da seção 6.5).
4. Prepara a ação (pedido, promoção, mensagem) e grava na **caixa de decisões** com o motivo, os
   números e o impacto em reais.
5. Avisa pelo canal que o lojista escolheu, com **texto pronto** e sem repetir o mesmo aviso; a
   explicação da IA só vem se ele tocar em "Por quê?".
6. Registra o custo da execução na carteira e o resultado para o aprendizado.

Limites de cada execução: número de passos, tokens, tempo e valor financeiro das ações.

### 6.3 Níveis de autonomia (o lojista escolhe por agente)

| Nível | O agente… | Exemplo |
|---|---|---|
| 0 · Informar | só avisa | "a banana parou de sair" |
| 1 · Sugerir | avisa e recomenda | "baixe para R$ 4,49" |
| 2 · Preparar | deixa a ação pronta para um toque ou um "sim" | pedido rascunho montado |
| 3 · Executar com aviso | executa dentro de limites e avisa | pedido de até R$ 500 com fornecedor habitual |

Começa em 0-2 para todos. O nível 3 só com aceite explícito, teto em reais, lista de fornecedores
permitidos e botão de desligar tudo. Toda ação executada fica no extrato de auditoria.

### 6.4 Ações que precisam ser criadas

Hoje as ferramentas só leem. Para os agentes agirem, entram ferramentas de ação, sempre passando pela
caixa de decisões:

- aceitar ou recusar uma recomendação (a Central já faz);
- criar rascunho de pedido de compra (já existe o fluxo "aceitar → pedido");
- criar promoção ou encarte a partir de produtos;
- gerar mensagem ao fornecedor (Confere);
- agendar lembrete e resumo.

Nenhuma ação altera preço no caixa ou envia pedido ao fornecedor sem aprovação, salvo nível 3.

### 6.5 Vigília 24 horas sem queimar tokens

O erro caro seria o jeito ingênuo de fazer agente: um modelo de linguagem acordando de tempos em
tempos, lendo tudo e perguntando a si mesmo "tem algo errado?". Com 8 agentes olhando a cada 5
minutos, são mais de 2.300 chamadas por dia por mercado, quase todas para concluir "nada a fazer".

No MercadoFlow o agente é um **funil em quatro andares**, e cada andar só passa adiante o que o
anterior não resolve:

```
 Andar 1 · Motor (sem token)          vigia 24h: vendas a cada 5 min, estoque, notas, preços
          │  regra e limite: "cobertura < lead time", "venda 30% abaixo do esperado",
          │  "nota com falta", "preço 15% acima do bairro"            → ~200 sinais/dia
          ▼
 Andar 2 · Memória (sem token)        já avisei disto? o lojista recusou algo igual? está no
          │  horário de silêncio? o valor é pequeno demais?          → ~60 candidatos/dia
          ▼
 Andar 3 · Jev (frações de centavo)   várias perguntas numa chamada só, por candidato:
          │  "merece acordar o lojista?", "é urgente?", "qual agente?", "precisa de texto
          │  ou basta o aviso pronto?"                                → ~8 casos/dia
          ▼
 Andar 4 · DeepSeek (centavos)        escreve a explicação, monta o pedido, planeja a promoção,
             redige a mensagem ao fornecedor                         → ~8 textos/dia
```

Regras de cada andar:

- **Andar 1 — motor:** detecta por regra e cálculo; é o que já roda hoje (atualização a cada 5
  min, detecção de oportunidades, Confere, preços). Nada aqui usa IA.
- **Andar 2 — memória:** não repete aviso já dado sobre os mesmos números (mesmo hash dos números
  que o cache de IA já usa), respeita o horário de silêncio e o valor mínimo que o lojista definiu,
  e aprende com o que ele recusou.
- **Andar 3 — Jev:** decisões fechadas em lote (uma chamada responde várias perguntas). O Jev não
  faz conta nem compara datas: recebe os números já calculados pelo motor e só julga. Com confiança
  baixa, o caso sobe para o DeepSeek, e o produto nunca fica pior do que sem o Jev.
- **Andar 4 — DeepSeek:** só para o que precisa de texto ou de plano. Aviso ("o leite acaba
  amanhã"), mensagem ao fornecedor e resumo usam texto pronto, sem IA (seção 5.3). Na prática, a
  maior parte dos ~8 casos por dia chega ao lojista com texto pronto, e o DeepSeek só escreve quando
  ele pede o "Por quê?".

Travas de custo por mercado:

- orçamento diário de créditos por agente, com parada automática ao atingir;
- no máximo N avisos por dia por agente (o resto vai para o resumo do dia seguinte);
- rotinas não urgentes (resumo, explicações em lote) no horário de desconto do DeepSeek;
- se acabar o crédito, os andares 1 e 2 continuam e o lojista recebe o aviso com texto pronto.

Custo estimado da vigília 24 horas, com os 8 agentes e as premissas da seção 9.2:

| Jeito de fazer | Chamadas de IA por dia | Custo por mercado/mês |
|---|---|---|
| Modelo de linguagem olhando tudo a cada 5 min | ~2.300 (DeepSeek) | ~R$ 2.400 |
| Motor + DeepSeek julgando cada sinal | ~200 (DeepSeek) | ~R$ 32 |
| **Funil: motor + memória + Jev + DeepSeek** | ~60 (Jev) + ~8 (DeepSeek) | **~R$ 4** |

A diferença entre o segundo e o terceiro jeito é o Jev: ele troca cerca de 200 julgamentos do
DeepSeek por dia por ~60 decisões baratas, e o DeepSeek escreve só os ~8 casos que chegam ao
lojista. É isso que permite oferecer agentes "sempre ligados" dentro de um pacote de R$ 199 com
margem alta. Os números de sinais e casos por dia são hipótese e serão medidos no piloto.

### 6.6 Memória e aprendizado: o Jev monta o contexto

Um agente que aprende acumula histórico: vendas de meses, notas, decisões aceitas e recusadas,
resultados medidos. Mandar tudo isso ao DeepSeek a cada chamada seria o segundo jeito de queimar
tokens (o primeiro é a vigília da seção 6.5), e piora a resposta, porque o modelo se perde no meio de
informação irrelevante. A regra é: **a IA recebe só o que importa para aquela decisão, e quem escolhe
o que importa é o código com o Jev, não o DeepSeek.**

#### Como a memória é guardada

| Camada | O que é | Quem produz | Custo |
|---|---|---|---|
| Fatos | números do motor: venda, giro, cobertura, preço, previsão | motor | zero |
| Resumos por período | dia, semana e mês já resumidos (números do motor + frase pronta) | motor | zero |
| Lições | aprendizados curtos com evidência: "promoção de 15% em laticínios não aumentou a venda (2 tentativas)", "fornecedor X faltou em 4 das últimas 6 entregas", "o dono recusa pedido acima de R$ 3 mil sem ver antes" | avaliação de resultado (segunda, 4h) + recusas do lojista, com frases prontas | zero |
| Preferências | limites, horários de silêncio, fornecedores preferidos, nível de autonomia | lojista | zero |

O histórico bruto continua no banco, mas não vai para a IA. O que vai são os resumos e as lições,
que cabem em poucas linhas.

#### Como o contexto é montado a cada chamada

```
 tarefa (ex.: "plano de compras de laticínios da semana")
    │
 1. Código (sem token)   filtra por chave exata: categoria, produtos, fornecedores, período
    │                     → ~150 pedaços candidatos (fatos, resumos, lições)
 2. Jev (frações de ¢)   dá nota de relevância a cada pedaço para ESTA tarefa, em lote
    │                     ("este pedaço ajuda a decidir o pedido de laticínios?")
 3. Orçamento            entra do mais relevante para o menos, até o teto de tokens da tarefa
    │                     → ~15 pedaços
 4. DeepSeek             recebe: instrução fixa (em cache) + pedaços escolhidos + números do motor
```

Cuidados:

- **Datas e contas ficam no código:** o Jev erra em datas e contagem, então o filtro de período e
  os números são do motor. O Jev só julga "é relevante para esta tarefa?".
- **Instrução fixa primeiro, variável depois:** o começo da mensagem (instrução e ferramentas) é
  sempre igual, e o DeepSeek cobra ~1/100 por essa parte repetida (cache). A parte que muda vai no fim.
- **Teto de contexto por tarefa:** pergunta simples ~2 mil tokens; resumo do dia ~5 mil; plano de
  compras ~10 mil.
- **Sem Jev, o produto não para:** se ele estiver fora do ar, entra uma regra simples (mais recente
  e mesmo produto ou categoria primeiro), com a mesma cota de tokens.
- **Rastro:** cada chamada guarda quais pedaços entraram, para auditar por que o agente decidiu
  daquele jeito e para medir se a seleção está boa.

#### Economia

Exemplo: plano de compras da semana no DeepSeek V4 Pro, no pico (US$ 1,32 por milhão de tokens de
entrada, US$ 1 = R$ 5,50):

| Montagem | Tokens de entrada | Custo por plano |
|---|---|---|
| Últimos 90 dias de vendas, notas e decisões | ~60.000 | ~R$ 0,44 |
| **Resumos + lições escolhidos pelo Jev** | ~8.000 (+ ~45.000 no Jev) | **~R$ 0,07** |

Cerca de **85% a menos**, e com resposta melhor, porque o modelo lê só o que importa. O mesmo vale
para a conversa com o lojista: "e aquele fornecedor que sempre falta?" puxa só as lições e notas
daquele fornecedor, não o histórico inteiro da loja.

#### O ciclo de aprendizado

1. O agente decide com base nos pedaços escolhidos (fica registrado quais foram).
2. O lojista aceita ou recusa; a recusa com motivo vira preferência ou lição.
3. Na segunda-feira, a avaliação de resultado mede o que aconteceu (vendeu? faltou? sobrou?).
4. O resultado vira lição com evidência, ou reforça ou enfraquece uma lição que já existe.
5. Na próxima decisão parecida, o Jev tende a escolher essa lição, e o agente erra menos sem que o
   contexto cresça.

Com o tempo, a loja acumula conhecimento sem aumentar o custo por decisão, porque a memória cresce
no banco mas o contexto enviado continua do mesmo tamanho.

---

## 7. Voz

### 7.1 Como funciona

```
fala ─► texto (reconhecimento) ─► Copiloto ─► texto ─► fala (síntese)
```

O DeepSeek entende e escreve texto; ele não ouve nem fala. A voz é uma camada à parte:

| Parte | Opção grátis | Opção paga (qualidade/ruído) |
|---|---|---|
| Fala → texto | reconhecimento do próprio navegador (Chrome/Android, Safari) | Deepgram (~US$ 0,0077/min em tempo real; ~US$ 0,0043/min em lote) ou Whisper (~US$ 0,006/min) |
| Texto → fala | voz do próprio celular (grátis, pt-BR) | vozes neurais premium |

Recomendação: **começar com o grátis do navegador** e usar o pago só onde o grátis não funciona bem
(doca barulhenta, navegador sem suporte). Custo da voz paga: cerca de R$ 0,04 por minuto.

### 7.2 Modos

- **Aperte para falar** no app e no Confere (botão grande, como walkie-talkie). É mais confiável que
  palavra de ativação no ambiente barulhento de loja.
- **Resumo falado** de manhã: o Copiloto lê o briefing; o lojista responde "aprova", "depois",
  "detalhe o leite".
- **Mãos livres na conferência:** "mais dois", "avaria", "próximo" durante a contagem.
- **Nota de voz no WhatsApp:** o lojista manda áudio e recebe resposta em texto ou áudio.

Privacidade: o áudio não é guardado, só o texto da pergunta, no mesmo registro das perguntas digitadas.

---

## 8. Jev + DeepSeek: a camada de decisão que economiza tokens

### 8.1 O que é o Jev e por que a comunidade está usando

O **Jev** (TypeSafe AI) é um modelo que **não escreve texto: ele decide**. Recebe a situação (texto ou
JSON) e perguntas fechadas, e devolve a resposta com a probabilidade de cada opção, tudo numa única
passada.

| Tipo de pergunta | Exemplo no MercadoFlow | Resposta |
|---|---|---|
| **Escolha** (até 255 opções) | "qual ferramenta responde esta pergunta?" | a opção + probabilidade de cada uma |
| **Nota** (escala) | "qual a dificuldade desta tarefa, de 1 a 5?" | a nota + confiança |
| **Sim/não** | "esta queda de venda merece alerta?" | probabilidade de 0 a 1 |

Por que ele economiza:

- **Preço:** US$ 0,042 por milhão de tokens de entrada e **saída grátis**, contra US$ 0,15 a
  US$ 1,32 de entrada e US$ 0,60 a US$ 3,96 de saída no DeepSeek.
- **Tempo:** 70 a 500 ms, contra segundos de um modelo de linguagem.
- **Várias perguntas de uma vez:** um pedido responde "qual ferramenta?", "é urgente?" e "precisa do
  modelo forte?" juntos.

O padrão que os desenvolvedores estão usando em agentes: **checagem exata primeiro (código), depois
uma pergunta fechada ao Jev sobre o que ficou ambíguo, e o modelo de linguagem só para o que precisa
de texto ou raciocínio longo**. Os usos mais citados:

- rotear para o modelo mais barato capaz (fácil → barato; difícil → forte);
- escolher ferramenta, habilidade ou subagente;
- "guarda" de ação: aprovar ou barrar uma ação do agente antes de executar (um projeto julgou 17 mil
  chamadas de ferramenta e segurou 42, com ~88% de acerto);
- barrar instrução maliciosa escondida em texto de terceiros;
- verificar se o agente terminou a tarefa;
- triagem de caixa de entrada e classificação em massa (500 páginas por menos de US$ 0,10).

### 8.2 Onde entra no MercadoFlow

| Decisão | Tipo | Antes (só modelo de linguagem) | Com Jev |
|---|---|---|---|
| Qual das 10+ ferramentas responde a pergunta | escolha | o DeepSeek lê a descrição de todas as ferramentas numa volta inteira | o Jev escolhe; o DeepSeek recebe só o resultado |
| A pergunta é de número direto (dá para responder por texto pronto)? | sim/não | sempre chamava o modelo | responde sem modelo de linguagem |
| Precisa do DeepSeek Pro ou o Flash resolve? | nota | não existia | roteia pela dificuldade |
| Qual agente trata este evento (nota chegou, venda caiu…) | escolha | — | o Jev distribui |
| "Isto merece acordar o lojista?" (antes de cada aviso) | sim/não | o modelo lia cada candidato | só os "sim" viram texto |
| "A ação preparada é segura?" (guarda da caixa de decisões) | sim/não | — | barra ou manda para aprovação humana |
| Texto de nota, observação ou nome de produto contém instrução maliciosa? | sim/não | — | filtro antes de mandar ao modelo |
| O agente terminou ou precisa de mais um passo? | sim/não | uma volta a mais do modelo | o Jev decide |
| Comando de voz: "aprova", "depois", "detalhe", "cancela" | escolha | o modelo interpretava | o Jev entende a intenção |

O Jev **não substitui o motor**: ele erra em conta, contagem, datas e raciocínio em vários passos. Nada
disso sai dele. Preço, giro, previsão, quantidade a comprar e diferença de nota continuam no motor, que
acerta 100%.

### 8.3 Economia estimada

Mesmas premissas da seção 9.2 (Flash no pico, US$ 1 = R$ 5,50).

| Tarefa | Só DeepSeek | Jev + DeepSeek | Economia |
|---|---|---|---|
| Pergunta de número direto | ~R$ 0,017 | ~R$ 0,0007 (sem modelo de linguagem) | ~96% |
| Pergunta que precisa de conversa | ~R$ 0,017 | ~R$ 0,007 (uma volta a menos, sem a lista de ferramentas) | ~60% |
| Execução diária de um agente (80% dos casos sem nada relevante) | ~R$ 0,035 | ~R$ 0,008 | ~75% |
| Comando de voz de aprovação | ~R$ 0,005 | ~R$ 0,0001 | ~98% |

Hipótese de trabalho: com ~40% das perguntas sendo de número direto, o custo de IA por mercado cai
de **~R$ 24 para ~R$ 9 por mês** no uso intenso. Isso sobe a margem dos pacotes ou permite baixar o
preço de entrada. A confirmar no piloto, com o registro de uso real.

### 8.4 Cuidados

- **Português:** a documentação do Jev não confirma suporte a português. Primeira tarefa do piloto é
  medir o acerto com perguntas reais de lojista.
- **Acesso:** o cadastro direto na TypeSafe está pausado desde 22/09/2026. O acesso segue pela
  **OpenRouter** (modelo `jev-latest`) e pelo **Vercel AI Gateway**. A OpenRouter já está no catálogo
  de provedores do MercadoFlow.
- **Confiança baixa cai para o DeepSeek:** toda decisão do Jev abaixo de um limite calibrado segue
  para o modelo de linguagem, e o produto nunca fica pior do que hoje.
- **LGPD:** o Jev roda nos EUA. Vale a mesma regra de mandar só métricas e texto necessário.
- **Dependência:** fornecedor novo e com cadastro pausado. Por isso o LAYA fica mapeado como plano B
  local (8.5).

### 8.5 LAYA: a alternativa local ao Jev

O **LAYA** é a versão aberta do mesmo tipo de modelo (licença Apache 2.0, 322-421 milhões de
parâmetros, menos de 1 GB), que roda no nosso servidor sem custo por chamada. Os testes de terceiros
mostram por que a comunidade prefere o Jev pela API:

| Situação | Jev | LAYA |
|---|---|---|
| Tempo por decisão | ~70-700 ms (pela rede) | ~9-21 ms com placa de vídeo; ~0,8-1,7 s só com processador |
| Casos comuns | 99% | 73% |
| Casos difíceis | 74% | 34% |
| Escolher entre 117 opções | 89% | 5,5% |
| Extrair valor de um texto | 100% | 32% |
| Confiança declarada × acerto real (versão multilíngue) | calibrado | diz 99,6%, acerta 22% |

Quem testou resume: **trocar Jev por LAYA não é trocar uma peça, é refazer** (calibrar limites,
escolher a versão certa, treinar com dados próprios). Como o Jev custa frações de centavo por decisão,
**a economia de trazer isso para dentro de casa é pequena** e a perda de acerto é grande.

Quando o LAYA passa a valer a pena:

- se o Jev ficar indisponível ou mudar de preço;
- em decisões de sim/não de altíssimo volume (ex.: triagem contínua de cada variação de venda);
- se tivermos servidor com placa de vídeo ou rodarmos no computador do caixa, onde o agente Windows
  já está instalado.

Mesmo assim, só depois de 30 dias rodando em paralelo e passando de 90% de acerto calibrado.

### 8.6 Onde está a economia de verdade

Em ordem de peso:

1. **O motor que já temos:** preço, giro, cobertura, previsão, reposição e divergência de nota não
   gastam nada.
2. **Jev nas decisões fechadas:** tira do DeepSeek escolha de ferramenta, triagem e voltas extras.
3. **Cache e horário de desconto do DeepSeek:** instrução fixa no começo (cache a ~1/100 do preço) e
   rotinas em lote fora do pico (metade do preço).
4. **LAYA local:** só em volume muito alto e com placa de vídeo.

### 8.7 DeepSeek Harness: faz sentido para nós?

**O que é:** o DeepSeek Harness (`dsh`) é o "motor de agentes" de código aberto que a DeepSeek
publicou em 13/08/2026 (licença MIT, 95 mil estrelas no GitHub em 48 h). Características:

- Roda em **Node.js**, com linha de comando, interface web local (`127.0.0.1:3080`), aplicativo de
  desktop e SDK.
- **"Tudo é plugin"** (framework Cordis): modelo, ferramentas, habilidades, laço do agente, sessão,
  sandbox e interface são peças trocáveis.
- Funciona com **vários provedores**, não só DeepSeek (Moonshot/Kimi e outros).
- Fala **MCP** (o padrão aberto para ligar ferramentas a agentes) e tem um ecossistema de plugins.
- Tem subagentes, "modo plano" e o **Code Mode**: em vez de uma chamada ao modelo por ferramenta, o
  modelo escreve um pequeno programa que encadeia várias operações de uma vez, o que corta voltas e
  tokens.
- As ferramentas embutidas são de **agente de programação**: arquivos, terminal e busca na web, com
  permissões "só leitura", "escrever na pasta" e "acesso total".
- Está em **prévia para desenvolvedores**, e o próprio README avisa que haverá mudanças que quebram
  compatibilidade.

**Veredito: não usar como motor dos agentes do lojista agora, mas aproveitar três coisas.**

Por que não como motor:

| Ponto | DeepSeek Harness | O que os agentes do MercadoFlow precisam |
|---|---|---|
| Para quem foi feito | uma pessoa no próprio computador, trabalhando com arquivos e terminal | milhares de mercados num servidor, cada um isolado dos outros |
| Isolamento entre clientes | não é o foco (sessão local) | proteção por mercado no banco (RLS), já pronta no Java |
| Cobrança | não tem | débito de créditos por uso, teto por mercado |
| Linguagem | Node.js | backend Java/Spring; entraria um serviço novo para manter |
| Ferramentas | terminal e arquivos (perigosas num SaaS) | consultas e ações de negócio tipadas, que já existem |
| Maturidade | prévia, com mudanças que quebram | produto pago com cliente real |

O laço de agente do MercadoFlow já existe e é pequeno (o "Pergunte aos dados" consulta ferramentas em
até 4 voltas). O difícil e valioso é o que está em volta: isolamento, cobrança, dados e as
ferramentas de negócio. Isso o `dsh` não traz, e colocá-lo no meio seria mais uma peça para
proteger.

O que aproveitar:

1. **Ideias de arquitetura:** ferramentas, agentes e modelos como peças registráveis (plugins); modo
   plano; subagentes; e o princípio do Code Mode aplicado do nosso jeito, com o modelo pedindo várias
   consultas de uma vez numa volta só (o chat já aceita até 4 por volta) em vez de uma por volta.
2. **Servidor MCP do MercadoFlow:** expor as ferramentas de consulta, só leitura e por mercado com
   chave própria, no padrão MCP. Assim qualquer agente externo (o próprio `dsh`, o Claude, o ChatGPT,
   o Cursor) conversa com os dados da loja. Serve para redes com equipe técnica e vira um recurso do
   plano mais alto. As mesmas ferramentas continuam servindo os nossos agentes internos.
3. **Agentes internos da operação (superadmin):** curadoria do catálogo global, revisão de temas de
   encarte, triagem de suporte. Aqui o `dsh` pode rodar do nosso lado, sem cliente final e sem dado
   de mercado, e ganhamos experiência com ele até sair da prévia.

Reavaliar quando o `dsh` sair da prévia e tiver modo servidor para vários usuários (sem interface),
com isolamento por sessão.

---

## 9. Créditos de IA: modelo de receita

### 9.1 Como funciona

1. A plataforma compra créditos no DeepSeek (chave da plataforma, cifrada, só no servidor).
2. Cada mercado tem uma **carteira de IA**, igual à do Confere: saldo, extrato, pacotes, Pix com QR
   ou cartão, e confirmação no superadmin.
3. Cada uso debita créditos pelo que a tarefa custa. O lojista vê "créditos", não "tokens", porque
   token não significa nada para ele.
4. **Teto mensal por mercado:** um cliente não esgota o saldo da plataforma nem leva susto na conta.
5. Sem crédito, o Copiloto avisa e o produto segue com o motor e os textos do sistema.

A opção de o mercado usar a própria chave (código atual) pode continuar como alternativa para redes
grandes, fora do caminho principal.

### 9.2 Quanto custa para nós (estimativa)

Premissas: DeepSeek V4.1 Flash no preço de pico (pior caso), sem desconto de cache, US$ 1 = R$ 5,50.

| Tarefa | Tokens (entrada / saída) | Custo por uso |
|---|---|---|
| Pergunta com ferramentas (até 3 voltas) | 8.000 / 600 | ~R$ 0,017 |
| Resumo do dia | 6.000 / 700 | ~R$ 0,015 |
| Explicação de oportunidade (lote, fora do pico) | 1.200 / 150 | ~R$ 0,0015 |
| Execução diária de um agente | 15.000 / 1.500 | ~R$ 0,035 |
| Minuto de voz com reconhecimento pago | — | ~R$ 0,04 |

Mercado de uso intenso por mês:

- 20 perguntas por dia: R$ 10,20
- resumo diário: R$ 0,45
- 40 explicações por noite: R$ 1,80
- 5 agentes: R$ 5,25
- 5 min de voz paga por dia: R$ 6,30

Total: **cerca de R$ 24 por mês** só com DeepSeek. Com texto pronto, Jev e geração sob demanda
(seções 2.2, 5.3, 6.5 e 8.3):

| Item (uso intenso) | Só DeepSeek | Texto pronto + Jev + DeepSeek |
|---|---|---|
| 20 perguntas por dia (40% de número direto) | R$ 10,20 | R$ 2,70 |
| Resumo diário | R$ 0,45 | R$ 0,03 |
| Explicação de oportunidade | R$ 1,80 | R$ 0,15 (sob demanda) |
| Agentes (8, vigília em funil) | R$ 5,25 (5 agentes) | R$ 4,00 |
| Voz paga, 5 min por dia | R$ 6,30 | R$ 6,30 |
| **Total** | **~R$ 24** | **~R$ 13 (R$ 7 sem voz paga)** |

Com a IA enxuta, **a voz paga vira o maior custo**. Por isso a voz padrão é a do próprio celular
(grátis) e a paga fica só no pacote Pro. Um mercado de uso normal fica perto de R$ 1 a 3 por mês.

### 9.3 Proposta de preço (hipótese a validar)

| Pacote | Preço | Inclui | Custo estimado | Margem bruta |
|---|---|---|---|---|
| **Copiloto** | R$ 79/mês | assistente, resumo diário, voz do celular, 800 créditos | até ~R$ 3 | ~95% |
| **Copiloto Pro** | R$ 199/mês | + agentes, WhatsApp, voz paga, 2.500 créditos | até ~R$ 13 | ~93% |
| **Recarga** | R$ 39 | 500 créditos | ~R$ 2 | ~95% |

Referência: 1 crédito ≈ 1 pergunta simples; agente e plano de compras gastam mais créditos. A margem
real desconta taxa do Pix e do cartão e impostos. O registro de uso já grava tokens por chamada, e
é com ele que calibramos preço e crédito depois de um mês com clientes reais.

---

## 10. Privacidade, LGPD e segurança

- **Dados para fora do Brasil:** o DeepSeek processa na China. É transferência internacional (LGPD,
  art. 33). É preciso:
  - avisar nos termos e na contratação do pacote;
  - enviar só métricas agregadas, com a lista de permissão que já existe;
  - nunca enviar dado de consumidor final;
  - deixar pronta a opção de usar o mesmo modelo por um provedor hospedado fora da China.
- **Chave da plataforma:** cifrada, só no servidor, com alerta de saldo baixo no DeepSeek e teto de
  gasto diário global.
- **Injeção de instrução:** nome de produto, observação de conferência e texto de nota vêm de fora
  e podem conter instruções maliciosas. Resultado de ferramenta é tratado como dado, nunca como
  ordem. Ações passam pela caixa de decisões.
- **Auditoria:** quem pediu, qual agente, quais números, quanto custou, quem aprovou.
- **Isolamento entre mercados:** ferramentas e agentes rodam com o mercado na sessão, sob a mesma
  proteção por mercado (RLS) que já existe no banco.

---

## 11. Plano de implantação

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **F0a · Painel de APIs** (1-2 semanas) | página "IA e APIs" no superadmin: chaves cifradas (DeepSeek, OpenRouter), botão testar, roteamento por tarefa, tetos, mercados de teste, modo sombra do Jev e console de teste (seção 4.3) | chaves cadastradas e testadas pelo painel; uma tarefa roda no console mostrando camada, tokens e custo |
| **F0 · Fundação** (2-3 semanas) | chave DeepSeek da plataforma, carteira de IA com pacotes e Pix, débito por uso, teto por mercado, roteador por tarefa, cortes da IA atual (seção 2.2: sob demanda, cache por faixas, Jev, só pacote pago), textos prontos da seção 5.3 | toda chamada de IA debita crédito; relatório de custo × receita no superadmin; leitura das oportunidades abaixo de R$ 0,20 por mercado/mês |
| **F1 · Copiloto texto + Jev** (3-4 semanas) | Jev pela OpenRouter na camada de decisão (ferramenta, número direto, dificuldade), chat com resposta por regra, resumo diário, caixa de decisões, notificação no celular | acerto do Jev em português medido; 70% das perguntas comuns sem modelo de linguagem; custo por pergunta caindo |
| **F2 · Voz** (2-3 semanas) | aperte-para-falar no app e no Confere, resumo falado, comandos na conferência | resposta falada em até 3 s; funciona no Android e no iPhone |
| **F3 · Agentes** (4-6 semanas) | Gerente, Compras e Recebimento, níveis 0-2, eventos, WhatsApp | 3 agentes em produção; taxa de aceite e impacto em R$ medidos |
| **F4 · Mais modelos e MCP** (4-5 semanas) | Qwen/MiniMax na cadeia, escolha por custo × acerto, agentes de Preço, Capital, Promoções e Cenários, servidor MCP do MercadoFlow (só leitura, por mercado), LAYA em paralelo só se o volume justificar | custo por tarefa cai sem cair a taxa de aceite; um agente externo consulta a loja pelo MCP |
| **F5 · Autonomia** | nível 3 com limites, WhatsApp de ida e volta | ações executadas sem incidente; lojista mantém o nível ligado |

---

## 12. Como medir se deu certo

- **Valor para o lojista:** decisões aceitas por semana, impacto em reais (já medido pela avaliação
  de resultado), tempo até agir.
- **Uso:** perguntas por dia, resumos ouvidos, aprovações por voz ou WhatsApp.
- **Negócio:** mercados pagantes, receita de IA, custo de IA por mercado, margem.
- **Qualidade:** respostas sem número inventado (auditoria por amostragem), reclamações, recusas por
  "não faz sentido".
- **Custo:** percentual respondido por texto pronto, pelo Jev e por modelo (meta: menos de 20% das
  interações chegando ao DeepSeek); aproveitamento do cache; tokens
  de contexto por tarefa (a montagem com Jev deve manter esse número estável mesmo com a memória
  crescendo).

---

## 13. Riscos

| Risco | Mitigação |
|---|---|
| IA inventar número numa compra | número só de ferramenta; o texto do sistema é o piso; auditoria por amostragem |
| Custo sair do controle | débito por uso, teto por mercado, teto global, horário de desconto |
| DeepSeek fora do ar ou mudar preço | cadeia de reserva com outros modelos; texto do sistema |
| Transferência de dados para a China | aviso, dados mínimos, opção de hospedagem fora da China |
| Agente agir errado | caixa de decisões, níveis de autonomia, limites em reais, botão de desligar |
| Voz errar no barulho | aperte-para-falar, confirmação antes de agir, reconhecimento pago onde precisar |
| Jev sem bom português | piloto medindo acerto real; abaixo do limite de confiança, cai para o DeepSeek |
| Jev indisponível (cadastro direto pausado) | acesso pela OpenRouter/Vercel; LAYA local como plano B; DeepSeek decide se ambos faltarem |
| LAYA fraco em português ou com muitas opções | só em teste paralelo e só em sim/não; sai se não passar da meta |

---

## 14. Decisões que ficam com o dono

1. Preços e conteúdo dos pacotes (seção 9.3) e se o Copiloto fica dentro dos planos atuais ou é
   adicional.
2. Se a opção de o mercado usar a própria chave continua existindo, e para quem.
3. Teto de gasto diário global da conta DeepSeek e valor do saldo mínimo de alerta.
4. Quais agentes entram primeiro (proposta: Gerente, Compras e Recebimento).
5. Se o WhatsApp entra na F3 (exige conta WhatsApp Business e custo por conversa).
6. Texto de consentimento sobre processamento fora do Brasil.
7. Conta na OpenRouter para o Jev (e se o saldo fica junto do DeepSeek na conta da plataforma).
8. Se vale investir em servidor com placa de vídeo para a decisão local, depois do piloto.
9. Se testamos o DeepSeek Harness em agentes internos da operação (catálogo, temas, suporte).
10. Quais mercados entram como mercados de teste no painel de APIs, e por quanto tempo o Jev fica em
    modo sombra antes de valer.

---

## Fontes

- Preços DeepSeek (set/2026): [benchlm.ai](https://benchlm.ai/deepseek/api-pricing),
  [cloudzero.com](https://www.cloudzero.com/blog/deepseek-pricing/),
  [justinmckelvey.com](https://justinmckelvey.com/blog/deepseek-pricing)
- Preços Qwen, Kimi, GLM e MiniMax: [benchlm.ai/alibaba](https://benchlm.ai/alibaba/api-pricing),
  [morphllm.com](https://www.morphllm.com/llm-api),
  [geotoolbox.ai](https://geotoolbox.ai/blog/chinese-ai-models-compared)
- Jev e o uso com modelos de linguagem: [Firecrawl](https://www.firecrawl.dev/blog/what-is-jev),
  [InfoWorld](https://www.infoworld.com/article/4223468/typesafe-ais-new-models-work-with-machines-not-humans.html),
  [LangChain](https://www.langchain.com/blog/building-a-harness-with-jev),
  [Refix](https://www.refix.ai/news/jev-for-ai-agents/),
  [18 usos (Hugging Face)](https://huggingface.co/blog/karmen-beatapi/18-practical-jev-use-cases-for-ai-agents),
  [DEV Community](https://dev.to/vivek_shetye/jev-explained-why-it-could-matter-for-ai-agents-51om),
  [preço](https://jevtypesafeai.com/pricing)
- DeepSeek Harness: [repositório oficial](https://github.com/deepseek-ai/deepseek-harness),
  [The New Stack](https://thenewstack.io/deepseek-harness-open-source-plugins/),
  [guia de uso](https://thetricontinental.org/how-to-use-deepseek-harness/),
  [MCP no dsh](https://findharness.com/blog/deepseek-harness-mcp-guide),
  [ecossistema de plugins](https://github.com/0xsline/awesome-deepseek-harness)
- LAYA × Jev: [Hugging Face](https://huggingface.co/blog/sora-2/jev-vs-laya-hosted-api-or-open-weights-2026-guide),
  [BKS-Lab](https://bks-lab.com/en/blog/laya-gegen-jev/),
  [iMasters](https://imasters.com/news/laya-arrives-as-an-open-source-alternative-to-typesafe-ai-jev),
  [GitHub laya-browser-agent](https://github.com/ChenneyZhuang/laya-browser-agent)
- Voz: [Deepgram](https://deepgram.com/pricing),
  [Whisper API](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/),
  [comparativo 2026](https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide/)
- Código do MercadoFlow: `service/ai/*`, `service/ai/chat/*`, `job/*`, `service/intelligence/*`,
  `service/opportunity/*`, `service/confere/*`, `service/art/PlatformAiService.java`
