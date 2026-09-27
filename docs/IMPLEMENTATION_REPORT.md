# Relatório Final

Data: 2026-09-27 · Plano: `docs/IMPLEMENTATION_PLAN.md` · Protocolo: `PROTOCOLO_UNIVERSAL_PRODUTO_V2.md`

## Resumo

A análise partiu do código atual e da análise de produto já existente (`docs/mercadoflow-product/`, 63 achados,
decisões do owner D-001…D-035). O foco foi o trabalho que o comprador faz para o sistema e que o sistema já
poderia fazer por ele. Três fluxos tinham trabalho sobrando:

1. **Decidir → agir**: aceitar "Comprar 24 un. de X" só gravava um status. Depois o comprador remontava o pedido à
   mão em outra tela.
2. **Pedido → fornecedor**: "Enviar pedido" só mudava o status. O pedido era redigitado no WhatsApp.
3. **Painel do dia**: os números eram somas de 90 dias rotuladas como se fossem do dia.

Os três foram implementados e testados. Esta sessão não fez commit nem push. A fatia F1 (ativação guiada) foi
validada e publicada por uma sessão paralela (`25d80af`), com divisão de arquivos combinada entre as duas.

## Melhorias realizadas

| ID | O que mudou para o usuário | Esforço eliminado |
|---|---|---|
| OP-01 | "Aceitar e pôr no pedido": o produto entra no rascunho do fornecedor de quem a loja comprou da última vez, com a quantidade da recomendação e o último custo pago. Se o produto já estiver no rascunho, a quantidade sobe até a sugerida. Sem histórico de compra, o aviso pergunta o fornecedor ali mesmo. Há **Desfazer**, que reverte a decisão, o item, o rascunho vazio e a medição pendente. | de ~8 ações (outra tela, fornecedor, busca, quantidade, custo) para 1 toque |
| OP-02 | Ao enviar, o comprador escolhe o canal: **WhatsApp** (abre a conversa com o número do fornecedor e o texto pronto), **e-mail**, **copiar texto** ou **imprimir/PDF** (lista de conferência para o representante). O canal escolhido já marca o pedido como ENVIADO. Pedido já enviado pode ser reenviado. Os preços ficam fora da mensagem de propósito. | redigitar o pedido fora do app; voltar para mudar o status |
| OP-03 | Painel: "Vendas hoje" (comparado com o mesmo dia da semana anterior) e "Últimos 7 dias" (comparado com os 7 dias anteriores). Ticket e produtos com "· 90 dias" no rótulo. O "vs semana passada", que na verdade comparava com os 90 dias anteriores, saiu. Percentuais em pt-BR. | adivinhar o período de cada número |
| OP-04 | "Como chegamos nesse número" em pt-BR: `0,42 un./dia` e `R$ 5.893,50` no lugar de `0.4166666` e `5893.5`. | decifrar números crus |
| OP-05 | "Ver pedido" leva direto ao pedido (`/app/lista-compras?pedido=<id>`) | procurar o pedido na lista |

## Arquivos e áreas alteradas

- Backend (novos): `V55__recommendation_order_link.sql`, `service/opportunity/RecommendationOrderService.java`,
  testes `RecommendationOrderServiceTest`, `RecommendationTextFormatTest` e `GlobalExceptionHandlerTest`.
- Backend (alterados): `OpportunityController` (endpoints `order`/`undo` e `orderLink` na resposta de `decide`),
  `Recommendation` (2 campos), `SupplierOrderItemRepository` (1 consulta), `RecommendationEngine` (só formatação),
  `GlobalExceptionHandler`, `application-production.yml`.
- Frontend (novos): `utils/orderMessage.ts`, `utils/salesPeriods.ts`, `components/orders/OrderSendOptions.tsx`,
  `components/intelligence/DecisionFeedback.tsx`.
- Frontend (alterados): `IntelligenceCenter.tsx`, `Dashboard.tsx` (bloco de KPIs; a ramificação de ativação da F1
  foi preservada), `ShoppingList.tsx` (inserções pontuais, com o trabalho local do owner preservado),
  `market.service.ts`, `analytics.types.ts`.
- Documentos: `docs/IMPLEMENTATION_PLAN.md` e este relatório.

## Problemas corrigidos

- **P0**: KPIs do Painel sem período e com comparação errada (UX-01).
- **P1**: ruptura decisão → ação (D-011); pedido "enviado" que não saía da loja (D-012).
- **P2**: números em formato americano (UX-07); "não encontrado" e rota inexistente respondiam 500 com "Ocorreu um
  erro no servidor". Este último foi achado no E2E e agora responde 404.
- **P3**: Swagger/OpenAPI desligado no perfil `production` (SEC-06, defesa em profundidade).

## UX/UI

- Celular primeiro: alvos de toque ≥ 44 px, foco visível e textos ≥ 14 px nos componentes novos. Sem rolagem
  horizontal a 360, 768 e 1280 px (medido).
- O aviso de decisão usa `role="status"` e rola para ficar à vista de quem tocou.
- O botão diz o que vai acontecer: "Aceitar e pôr no pedido".
- Nenhuma tela nova e nenhum modal novo: o envio reutiliza o modal de pedido existente, e o aviso fica na própria
  Central.

## Backend e banco

- Migração **V55**, aditiva: `recommendations.order_item_id` (FK para `supplier_order_items`, `ON DELETE SET NULL`)
  e `order_item_previous_qty`. Nenhuma migração existente foi editada.
- A decisão e o item de pedido são gravados na mesma transação: não existe "aceita pela metade".
- Desfazer é recusado (409, com mensagem) quando o resultado já foi medido ou quando nada foi decidido. Com o pedido
  já enviado, a decisão volta, mas o item fica, e a tela avisa.
- Contrato compatível: a resposta de `decide` ganhou `orderLink` (campo novo, opcional); as demais respostas não mudaram.

## Segurança

- Os endpoints novos usam `assertCanAccessMarket` e RLS. No E2E, um usuário de outra loja recebe **403** ao tentar
  desfazer a decisão alheia, e um fornecedor de outra loja é recusado.
- O backend rodou com a role de aplicação **sem BYPASSRLS**, como em produção.
- A página de impressão escapa o HTML dos nomes de produto (testado com `<script>`).
- A mensagem ao fornecedor não leva preço nem dado pessoal.

## Performance e infraestrutura

- Nenhuma dependência, container ou serviço novo. O envio usa `wa.me`/`mailto`/impressão do navegador: sem
  integração externa, credencial ou custo.
- Aceitar faz de 2 a 4 consultas indexadas a mais (`idx_supplier_order_items_product`). O Painel calcula hoje/7 dias
  a partir do `salesTrend`, que já vinha na resposta: nenhuma chamada nova.

## Testes executados

| Verificação | Comando / ambiente | Resultado |
|---|---|---|
| Suíte do backend (Java 17, mesma imagem do deploy) | `mvn -B -o test` em `maven:3.9.6-eclipse-temurin-17`, cópia isolada das fontes | **217 testes, 0 falhas** (eram 189 antes das fatias; +11 OP-01, +2 OP-04, +2 handler, restante da F1) |
| Typecheck do frontend | `tsc --noEmit -p .` | 132 linhas de erro, **idênticas à linha de base** (preexistentes, fora dos arquivos tocados) |
| Build de produção | `vite build` | OK |
| Funções puras (mensagem, telefone, períodos) | `tsc` + asserções em Node | OK |
| E2E de API com PostgreSQL 16 + RLS | stack local descartável, perfil `production`, 55 migrações aplicadas | **24/24** (inferência de fornecedor, rascunho, subir quantidade, desfazer, pedido enviado, 403 entre lojas, 404) |
| Navegador — compra e envio | Playwright + Edge, 360 e 1280 px | **24/24** |
| Navegador — Painel com vendas conhecidas | Playwright + Edge, 360, 768 e 1280 px | **24/24** (R$ 150,00, +50,0 % contra domingo; R$ 450,00, +12,5 %) |

Falhas encontradas e corrigidas no caminho: dois erros de stubbing no teste novo; 404 que virava 500 (corrigido no
handler); `formatSignedPercent` em formato americano. Falhas do meu ambiente de teste (segredo JWT, CNPJ repetido,
limite de cadastro por IP) foram ajustadas no próprio ambiente. O limite de cadastro por IP funcionou como previsto.

## Ciclo 2 — integração e acabamento

O que mudou para o usuário:
- **Celular**: diálogos viram folha presa ao rodapé, formulários passam a 1 coluna e as barras de abas não cortam
  mais a 360 px. Esses são os 21 arquivos de UX de outra sessão, revisados e integrados, somados ao `SegmentedTabs`.
- **Diálogos previsíveis**: todos fecham com Esc (só o de cima, quando há um sobre outro) e liberam a rolagem ao
  fechar. Antes, o modal de fornecedor deixava a tela bloqueada.
- **Números em pt-BR em todo o app**: "8,0/dia", "+100,0%", "1,00×", margens e quantidades.
- **Requisição malformada** responde 400 com mensagem clara, não "Ocorreu um erro no servidor".

Qualidade interna:
- **Typecheck**: de 132 linhas de erro para **0**. O `npm run build` agora roda `tsc`, e o CI barra o deploy com
  erro de tipo.
- **Código morto**: 15 arquivos sem nenhuma referência foram removidos (~3.000 linhas). A lista está no plano (C-07).
- **Documentação**: acentuação dos documentos de VPS reparada; prompts organizados em `docs/prompts/`.

Testes deste ciclo (ambiente descartável com PostgreSQL 16, RLS e perfil `production`):
- **Varredura visual**: 19 telas (mercado + super admin), abas e modais, a 360/768/1024/1440 px. **112
  verificações, 0 problemas**: sem rolagem horizontal, sem erro de JavaScript, sem resposta 5xx, Esc e rolagem OK.
- **E2E de API**: 24/24.
- **Tela de compra/envio**: 24/24.
- **Painel**: 24/24.
- **JSON malformado**: 400.
- **Suíte do backend**: 218/218.
- **Frontend**: `tsc` 0 erro e `npm run build` OK.

Bloqueado: o plano de otimização da VPS (`docs/VPS-OPT-MASTER-PLAN.md`) depende de acesso ao host. A regra do
projeto é alterar a VPS só pelo GitHub Actions, então ele ficou registrado, não executado.

## Ciclo 3 — organização do produto

- **Navegação em 5 destinos** (R-14): Hoje · Comprar · Produtos · Vender · Loja, no lugar de 14 itens de menu.
  - no celular, barra inferior sempre visível;
  - no desktop, lateral com as páginas do destino aberto;
  - "Perguntar aos dados" virou botão no topo de todas as telas.
- **Tela Hoje** (R-08): Painel do dia e Central de Inteligência viraram uma tela, e a aba Alertas saiu. A ordem é a
  da decisão:
  1. números do dia;
  2. o que decidir agora (as 5 de maior impacto, aceitáveis ali mesmo);
  3. pedidos para enviar;
  4. acompanhamento e resultados;
  5. como a loja está vendendo.
- **Alertas**: a geração de hora em hora fica desligada por padrão (sem uso de CPU); dá para religar por ambiente.
- **Testes**:
  - navegação + Hoje a 360 e 1440 px: 28/28 (inclui aceitar compra de produto nunca comprado, escolhendo o
    fornecedor na própria faixa);
  - Painel: 24/24;
  - compra e envio: 24/24;
  - varredura de 19 telas × 4 larguras: 112/112;
  - backend: 218/218;
  - typecheck: 0 erro.

## Ciclo 4 — páginas internas

- **Comprar abre no que o comprador faz todo dia:**
  - "Sugestões para comprar" com "Pôr no pedido";
  - pedidos agrupados em Para enviar (com "Revisar e enviar"), Aguardando entrega (com "Receber mercadoria") e
    Concluídos.
- **Correção de cálculo:** item comprado por caixa tinha margem de −705%, e o histórico registrava caixas como
  unidades. Agora tudo é convertido para a unidade vendida no caixa.
- **Caixas e agente responde "as vendas estão chegando?":** agente on-line ou sem sinal há quanto tempo, notas
  recebidas e recusadas.
- **Produtos virou uma lista escaneável:** a situação aparece em palavras, e o jargão (Momentum, Saúde, GMROI) saiu.
- **Mapa da loja:**
  - marcar corredor passou a funcionar no celular;
  - o mapa vazio ganhou um guia de 3 passos.
- **Consistência:**
  - título só uma vez por página;
  - mesmas abas e cabeçalhos em todas as telas.
- **Testes:**
  - backend: 220/220;
  - navegação + Hoje: 28/28;
  - Painel: 24/24;
  - compra e envio: 24/24;
  - varredura de 19 telas × 4 larguras: 112/112;
  - typecheck: 0 erro.

## Ciclo 5 — Loja Viva (mapa da loja)

- **Montar em um toque:** o dono escolhe entre 3 plantas típicas, com prévia real, já com os setores que ele vende
  distribuídos em cada móvel, e só ajusta: arrasta, gira, troca o setor. Tudo é salvo sozinho.
- **Cada produto é localizado sem cadastro:** a classificação usa o NCM da nota fiscal. Com a loja de teste, 13
  setores foram reconhecidos sozinhos, e "Onde fica? detergente" apontou a gôndola de Limpeza.
- **Calor por móvel e sugestões explicadas:** com vendas realistas, o sistema encontrou que açougue e cerveja saem
  juntos 3× mais que o acaso (71% das compras com açougue levam cerveja) e sugeriu aproximá-los, desenhando a
  linha entre os dois móveis. Também indica móveis que vendem pouco em lugar de passagem e os candidatos a ponta de
  gôndola.
- **Testes:**
  - backend: 229/229 (classificação, validação da planta e cada regra de sugestão);
  - plantas geradas: sem sobreposição e sem móvel fora da loja, nos 3 tamanhos;
  - Playwright a 390 e 1440 px: 19/19 cada (assistente, planta, editar, arrastar, gravação automática, calor,
    sugestões, "Onde fica?", persistência).
- **Achado de desempenho:** logo após uma carga grande de notas, antes de o PostgreSQL atualizar as estatísticas, a
  primeira leitura de vendas pode levar dezenas de segundos. A causa é a política de isolamento dos itens de nota.
  Vale para todas as telas; o mapa passou a mostrar a planta antes das vendas.

## Itens bloqueados

- **Publicação**: commit e push das mudanças desta sessão aguardam decisão do owner. O push dispara o deploy em
  produção, e o working tree mistura estas mudanças com 21 arquivos de trabalho local do owner.

## Riscos restantes

- **Escala da leitura de vendas (prioridade alta antes de ter muitos clientes):** num banco de teste com 28 lojas e
  85 mil itens, o cockpit do Painel levou 19–33 s até para uma loja com 20 notas; com o banco limpo, é instantâneo.
  A política RLS de `invoice_items` não tem `market_id` no próprio item, então consultas analíticas podem percorrer
  itens de todas as lojas. Correção recomendada (fatia F11): coluna `market_id` em `invoice_items` com índice,
  preenchida na ingestão, e a política passando a usá-la diretamente.
- Primeira leitura depois de uma carga grande de notas (ex.: histórico enviado pelo agente) pode ficar lenta até o
  autovacuum atualizar as estatísticas: a política RLS de `invoice_items` confere a nota de cada item. Mitigação
  futura: `ANALYZE` ao fim da carga histórica ou política apoiada em `market_id` no próprio item.

- As recomendações de compra ainda nascem do estoque teórico (D-019/D-026). O fluxo "aceitar → pedido" vale para
  qualquer recomendação COMPRAR, então continua servindo quando a F4/F5 trocar a fonte por sinais de venda.
- Custo do item sem histórico de compra: vem do valor estimado da própria recomendação, ou R$ 0 se ele não existir.
  O comprador revisa no rascunho.
- Desfazer apaga um rascunho que ficou vazio e sem observação. Se ele já existia vazio antes da aceitação, também
  some. O efeito é pequeno e está documentado no código.

## Próximas melhorias recomendadas

- F4/F5: reposição pelo vendido e sinais de venda no lugar do estoque teórico, depois da validação V1 com compradores.
- F8: feed único Hoje (Painel + Central) e fim de Alertas (D-021).
- F10: PWA + push "hora de pedir".
- Plano de otimização da VPS, quando houver acesso de leitura ao host.
