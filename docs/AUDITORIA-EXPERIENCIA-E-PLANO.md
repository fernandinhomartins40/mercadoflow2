# Auditoria de experiência e plano — "o motor é bom, a lataria não mostra"

07/10/2026. Base: as 22 telas do supermercadista capturadas no computador (1440 px) e no celular
(390 px), os textos que o backend gera e os dados de produção (só leitura).

## 1. O diagnóstico em uma frase

O sistema calcula certo o que importa (giro, cobertura, tração, custo, resultado em 30 dias), mas
entrega ao dono **muitas decisões, em linguagem técnica, com números que às vezes não fazem sentido
e sem mostrar o dinheiro** — então ele não confia, não decide e não percebe o valor.

## 2. O que foi medido

| Tela | Palavras | Altura no celular | Achados |
|---|---|---|---|
| Início | 340 | 3.591 px | manchete "Ainda sem vendas de hoje"; nenhum número de capital |
| Decidir (tudo) | 359 | 3.502 px | jargão (Classe AX, GMROI), decimal com ponto, data ISO |
| Decidir › Comprar | **1.464** | **13.106 px** | 66 botões; o mesmo parágrafo técnico repetido em cada item |
| Decidir › Dinheiro parado | 253 | 2.545 px | "Nada para decidir" e, abaixo, "R$ 0,00 · 0% do estoque" e "retorno R$ 353 por R$ 1" |
| Produto | 218 | 2.426 px | "3,3 por dia" e "5,0 por dia" na mesma tela; compra para 14 dias aqui e 21 no Decidir |
| Perguntar | 190 | 1.358 px | resposta contradiz o Decidir |
| Todas | — | — | aviso técnico "Histórico chegando…" fixo no topo; cabeçalho gigante de 300 a 400 px |

Em produção (Super Novo): **3.919 recomendações abertas**, 351 visíveis no Decidir, quase todas
"reduzir próxima compra" com certeza 0 e valor R$ 0; mais 3.568 órfãs (a situação acabou e a
recomendação nunca foi fechada). Na loja MercadoFlow Admin, 675.

## 3. Os 10 problemas, do mais grave ao menos

1. **Enxurrada de decisões sem valor.** Centenas de itens com certeza 0 e R$ 0 enterram as poucas
   decisões que importam. Fadiga de decisão: o dono para de abrir.
2. **"R$ em jogo" mistura gasto com ganho.** O valor de uma compra (dinheiro que sai) é somado à
   receita de uma promoção e ordena a fila. As maiores compras sobem ao topo como se fossem ganho.
3. **Números absurdos chegam ao dono.** "Comprar 635 un. de arroz 5 kg" (R$ 13.648 num item, numa loja
   que vende R$ 10 mil/dia), "1.812 kg de tomate", "retorno R$ 353 por R$ 1". As regras já foram
   corrigidas, mas **recomendação aberta não é recalculada** quando a regra ou o dado muda, e não há
   teto de bom senso.
4. **O capital de giro — a promessa central — não tem placar.** Em nenhum lugar o dono vê "quanto
   dinheiro está na prateleira, quantos dias de estoque, quanto as decisões liberaram".
5. **Linguagem de sistema.** "Classe AX", "GMROI", "momentum 0.35", "lift", "29.53 un./dia",
   "2026-10-03", "Certeza 15%". 51 textos do backend formatam número sem idioma (por isso o ponto) e
   28 trazem jargão.
6. **Estimado parece medido.** Margem padrão de 25% e estoque calculado aparecem com a mesma força
   visual de um número medido.
7. **Números que se contradizem.** Dois motores de compra (14 e 21 dias), duas velocidades na mesma
   tela, o Perguntar dizendo o contrário do Decidir.
8. **"No que deu" não mostra dinheiro.** Contagens (aceitas, em acompanhamento), sem "suas decisões
   liberaram R$ X e trouxeram R$ Y de margem".
9. **O celular não foi desenhado.** O dono decide no meio da loja; no celular a fila de compra tem 15
   telas de rolagem e o painel da decisão fica no fim da lista.
10. **Peso visual sem informação.** Aviso técnico em toda página, cabeçalho enorme com 3 botões em
    toda página, telas que repetem o Decidir (Produtos "pedem atenção", Comprar), telas que só vendem
    plano (Clientes, Rede).

## 4. Princípios da nova lataria

- **Dinheiro primeiro.** Toda tela abre com reais e dias, não com contagens.
- **Uma decisão = um número, uma frase, um botão.** O cálculo fica em "Como chegamos nesse número".
- **Nada absurdo chega ao dono.** Sem confiança ou sem valor, não entra na fila.
- **Medido × estimado sempre visível**, com o caminho para medir (Confere, ERP, contagem).
- **Poucas por dia.** Até 7 decisões em "Hoje"; o resto fica guardado, agrupado.
- **Celular primeiro.** Cada tela de decisão precisa caber e funcionar com o polegar.
- **Uma verdade.** Um motor de compra, uma velocidade, o mesmo número em todas as telas.

## 5. O plano

Ordem pensada para que cada fase já melhore a vida do dono sozinha. Esforço em dias de trabalho.

### F0 — Limpar o que chega ao dono (2 dias) · pré-requisito de tudo
- Fechar as recomendações órfãs (situação encerrada) e as de certeza 0 e valor 0.
- **Portão da fila:** só entra decisão com confiança mínima e ganho em reais; o resto vai para
  "Atenção" ou some.
- **"Reduzir próxima compra" vira uma só decisão agrupada** ("Comprar menos de 23 produtos que estão
  sobrando — libera R$ X") ou passa a ajustar sozinho a sugestão de compra.
- Recalcular as recomendações abertas a cada detecção (número velho não fica na tela).
- **Teto de bom senso na compra:** no máximo o maior de (2× o último pedido do produto, 30 dias de
  venda); acima disso pede confirmação.
- Separar **ganho** de **gasto**: a fila ordena por ganho esperado × confiança; a compra mostra
  "investe R$ X para não perder R$ Y de venda".

### F1 — Linguagem de balcão (2 dias)
- Formatar todo número e data em pt-BR no backend (um formatador único).
- Reescrever os modelos de texto das decisões: **uma frase com reais, dias e unidades inteiras**.
  Ex.: "O arroz acaba em 2 dias. Peça 120 pacotes (R$ 2.580) para cobrir 3 semanas."
- Glossário aplicado em todas as telas: Curva A → "mais vendidos"; ritmo → "vendendo mais/menos que
  o normal"; GMROI → "cada R$ 1 parado devolve R$ X de margem por mês"; tração → "puxa a cesta".
- "Certeza 15%" → "Confiança baixa: falta o estoque deste produto" (o motivo, não o número).
- Aviso de histórico só no Início e em Configurações, e em uma linha.

### F2 — Placar do capital no Início (3 dias)
- Novo topo do Início: **"Seu dinheiro na loja"** — estoque em reais, dias de estoque, margem do mês,
  capital liberado pelas decisões — cada um com o selo **medido** ou **estimado** e a tendência desde
  que a loja entrou.
- Gravação diária desses números por loja (tabela pequena) para mostrar a evolução.
- Quando estimado, o botão que mede: "Conferir as notas no Confere", "Contar os 20 mais vendidos".

### F3 — Decidir enxuto e de celular (3 dias)
- **"Hoje" com até 7 decisões**, ordenadas por ganho × confiança; "Depois" guarda o resto, agrupado.
- Decisões em lote como **um cartão**: "Pedido da semana para a Distribuidora X: 23 itens, R$ 8.400",
  abrindo a lista enxuta (nome, quantidade, custo — sem parágrafo por item).
- No celular: cartão por decisão com Aceitar/Não à mão; o detalhe abre por cima (folha), não no fim da
  lista.
- Um nome só para o dono: **decisão** (Tino é quem prepara; oportunidade/recomendação/sinal somem da tela).

### F4 — "No que deu" com dinheiro (2 dias)
- Placar do mês: **capital liberado, margem a mais, faltas evitadas, acertos/erros** — em reais.
- Cada decisão medida mostra o resultado em uma linha ("Liquidar vinho rosé: R$ 840 voltaram ao caixa
  em 21 dias").
- O placar alimenta o Início (F2).

### F5 — Uma verdade só (2 dias)
- Um motor de compra (o do capital, 21 dias + prazo medido) em produto, Comprar, Decidir e Perguntar.
- Uma velocidade de venda por produto (mesma janela em todas as telas).
- Perguntar responde com os mesmos números do Decidir.

### F6 — Menos peso, telas com propósito (2 dias)
- Cabeçalho compacto (≤ 120 px no celular), um só botão principal por tela.
- Produtos vira consulta (busca e detalhe); "pedem atenção" leva ao Decidir.
- Comprar vira "pedidos em andamento" (enviar, receber, conferir).
- Clientes e Rede: mostrar o valor com os dados que já existem antes de pedir o plano.
- Estados vazios dizem o que fazer para destravar (conectar caixas, Confere, contagem).

### F7 — Destravar o dado que move o capital (2 dias)
- **Contagem rápida no celular:** "Conte os 20 produtos que mais vendem (5 minutos)" — dá estoque
  medido aos itens que mais pesam e liga GMROI, capital parado e compra certa.
- Checklist de dados no Início até a cobertura passar de 80%: caixas → custo (Confere/ERP) → contagem.

**Total: cerca de 18 dias de trabalho**, entregues fase a fase (cada fase vai ao ar sozinha).

## 6. Como saber se deu certo

| Métrica | Hoje | Meta |
|---|---|---|
| Decisões na fila do dia | 26 (local) / ~350 (Super Novo) | ≤ 7 |
| Itens com valor R$ 0 ou certeza baixa na fila | centenas | 0 |
| Palavras por tela de decisão | 359 a 1.464 | ≤ 150 |
| Altura da fila de compra no celular | 13.106 px | ≤ 2.500 px |
| Termos técnicos e decimais com ponto nas telas | 51 + 28 no backend | 0 |
| Placar de capital no Início | não existe | existe, com medido/estimado |
| Resultado das decisões em reais | não existe | placar mensal |
| % do vendido com custo e estoque medidos | baixo (teste) | > 80% por loja ativa |
| Decisões aceitas por semana (adoção) | — | medir a partir de F3 |
