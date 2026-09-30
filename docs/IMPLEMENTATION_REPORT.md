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

## Ciclo 6 — Loja Viva profissional (editor e 3D)

- **Editor de planta de verdade:**
  - zoom com a roda do mouse, pinça ou botões, e arrastar o fundo para andar;
  - alças para mudar o tamanho de qualquer móvel com o mouse, mostrando a medida;
  - móveis grudam na grade e nas bordas dos vizinhos, com guias de alinhamento;
  - seleção de vários (Shift ou laço), com alinhar, espaçar por igual e igualar tamanho;
  - desfazer e refazer, atalhos de teclado e medidas digitadas no inspetor;
  - paredes da loja arrastáveis.
- **Criar do zero ou personalizar:** além das 3 plantas típicas, "Desenhar do zero" com as medidas do salão, paleta
  de móveis para arrastar e gerador de corredores com prévia.
- **Visual:** cada móvel é desenhado como é visto de cima (módulos da gôndola, portas da geladeira, caixotes da
  banca, esteira do caixa), com a cor de cada setor na borda.
- **3D sem peso:**
  - a loja em isométrico, em SVG, girável, com a altura real de cada móvel; no calor de vendas, a altura mostra
    quanto cada móvel vende;
  - "Corredor": andar entre as prateleiras em CSS 3D, com a placa do setor e os produtos mais vendidos. Também
    avisa quando o corredor é apertado para dois carrinhos.
  - Sem WebGL e sem dependência nova; o formato da planta salva é o mesmo.
- **Testes:**
  - mapa no Playwright: 39/39 a 1440 e 1920 px e 32/32 a 390 px. Cobre zoom, alça, desfazer/refazer, medida
    digitada, laço e alinhar, atalhos, paleta arrastável, gerador, 3D, corredor, calor, sugestões, "Onde fica?",
    persistência, sem rolagem horizontal e sem erro JS;
  - regressão das outras telas: navegação 28/28, fluxo de compra 24/24, painel Hoje 24/24;
  - varredura: 96/100. As 4 falhas são o passo dos modais de pedido, que esperou 8 s enquanto a tela de pedidos
    (não alterada) levou mais que isso para carregar num banco de teste com cerca de 45 lojas. Verificada à mão,
    ela carrega e funciona. É o mesmo risco de desempenho do isolamento dos itens de nota, já registrado.
- **Correção feita nos testes:** no celular, as alças do meio de um móvel fino cobriam o corpo e atrapalhavam o
  arrasto. Agora elas somem quando o móvel fica pequeno na tela.

## Ciclo 7 — Estúdio de encartes (temas com IA)

- **Por que o editor antigo não servia:** a prévia era desenhada em HTML e o arquivo final redesenhado em Java,
  com resultados diferentes; a grade tinha espaços fixos; o PDF era uma foto. Ele continua desligado e intacto.
- **Superadmin, "Temas de encarte":**
  - cartão da chave do DeepSeek: a chave é cifrada, nunca volta para a tela, e há botões de testar e remover;
  - tema com fundo PNG por formato (a proporção é conferida), selo 3D transparente, cores da etiqueta, ocasião e
    publicar;
  - ao subir o fundo, o navegador mede as áreas livres, e o DeepSeek (se tiver chave) escolhe logo, produtos,
    rodapé e selo entre elas e sugere nome, ocasião e cores. Sem chave ou com erro, fica a sugestão da medição,
    com aviso;
  - as áreas são ajustáveis com alças e setas, e a prévia mostra o tema com 1 a 16 produtos de exemplo.
- **Mercado, "Vender → Encartes":**
  - produtos pela sugestão das vendas (puxam clientes, precisam girar, em alta), busca por nome ou código de
    barras, colar lista ou item avulso; o preço vem da última venda;
  - por produto: nome na arte, detalhe, unidade, preço, preço de antes, condição ("Leve 3 pague 2") e destaque;
  - a arte se monta sozinha no tema escolhido, em cada formato pronto, e clicar num produto da arte abre a edição;
  - o tema "Básico", desenhado pelo código, existe para o mercado nunca ficar sem tema;
  - exporta PNG, PDF A4 e cartazes de gôndola; publicar gera um link `/encarte/...` para o WhatsApp.
- **Testes:**
  - Playwright: 41/41 a 1440 px (superadmin + mercado) e 24/24 a 390 px (mercado e página pública), com PNG, PDF e
    cartazes baixados e conferidos, sem rolagem horizontal e sem erro JS;
  - fotos de outro site passam pelo proxy e a exportação não é bloqueada;
  - segurança (curl e psql): 16/16. Outro mercado não lê nem apaga encarte (403/404), mercado não chama o
    superadmin, rascunho não é público, o proxy recusa endereço interno, http e página que não é imagem, travessia
    de pasta é recusada, arquivo falso como imagem é recusado, o RLS isola as campanhas e a chave não fica em claro;
  - regressão: navegação 28/28, fluxo de compra 24/24, painel Hoje 24/24, mapa 39/39.
- **Não testado:** a resposta real do DeepSeek (não havia chave válida no teste). Testei o caminho de erro (chave
  recusada → aviso e áreas da medição mantidas). Validar com a chave do owner depois do deploy.

### Ciclo 7.1 — fotos, catálogo global e cores automáticas

- **Catálogo global no editor:** a busca procura nos vendidos da loja (com preço da última venda) e no catálogo
  da plataforma (nome canônico, foto e código de barras). O código de barras aceita zeros à esquerda, e o Enter
  de um leitor com um só resultado já põe o produto no encarte. Nome do catálogo fica como está; só nome de nota
  (em maiúsculas) é ajustado.
- **Fotos nos cartões:** vêm do catálogo. Em cada produto dá para buscar outra foto no catálogo, enviar uma foto
  própria ou tirar a foto. O proxy agora aceita http público (muitas fotos do catálogo são http), com a mesma
  barreira para endereço interno e porta diferente de 80/443.
- **Cores automáticas:** a paleta sai do fundo de cada formato. É o padrão no mercado, com opção "Do tema". O
  superadmin já recebe as cores ao subir o primeiro fundo e tem o botão "Tirar as cores do fundo".
- **Correção encontrada no teste:** uma foto lenta de site externo segurava a prévia inteira (até 15 s em branco).
  Agora a prévia espera cada foto no máximo 6 s e a exportação 20 s.
- **Testes:** encartes 41/41 (1440 px) e 24/24 (390 px); novidades 13/14 (a falha é esperada: as cores do tema
  vieram do mesmo fundo, então coincidem com as automáticas); troca de cores com o tema em outra cor: ok;
  segurança das rotas novas 12/12.

### Ciclo 7.2 — busca no catálogo global de verdade e dados completos do produto

- **Por que a busca não achava em produção:** o catálogo real está em maiúsculas e acentuado ("AÇÚCAR REF
  UNIÃO"). A busca comparava só em minúsculas, então "acucar" dava 0 resultados, e exigia o texto seguido ("coca
  2l" não achava "REFRIG COCA COLA 2L"). Ela também podia tentar baixar a foto de novo para cada resultado, o
  que estourava o tempo com o catálogo grande. Reproduzido num catálogo de teste com 200 mil produtos.
- **Busca nova:** ignora acento e maiúsculas, exige cada palavra em qualquer ordem, acha o código de barras pelo
  índice (com e sem zeros), põe primeiro o nome que começa com o que foi digitado e monta a foto sem baixar nada.
  Leva de 0,7 a 3,5 s nos 200 mil produtos. Se o catálogo falhar, a tela avisa em vez de dizer "nada encontrado".
- **Dados completos ao escolher:** nome canônico, embalagem (quando o nome não diz), marca, unidade, código de
  barras, foto e preço do mercado, com a origem: última venda na loja no último ano, senão o preço médio
  registrado pela loja. Preço de outros mercados não entra (é dado de outro cliente). Escolher no botão do cartão
  preenche o que está vazio e mantém o nome que o lojista digitou.
- **Rodapé:** sombra no tom oposto para o texto continuar legível quando o fundo muda de cor dentro do rodapé.
- **Testes:** encartes 41/41 (1440 px) e 24/24 (390 px); informações do produto 12/12; novidades 13/14 (a falha é
  a esperada, já explicada no 7.1).

## Ciclo 8 — MercadoFlow Confere

- **O app** (`/confere/`, instalável): criar a conta do mercado com aceite de que as notas ficam armazenadas (ou
  entrar com a conta do MercadoFlow), ler a nota pela câmera ou digitar a chave, conferir em letras grandes,
  comprar leituras pelo Pix, cadastrar o certificado A1 e importar XML.
- **De onde vem a nota:** já guardada → Sefaz pelo certificado A1 (grátis e ilimitado) → Meu Danfe pela chave
  (1 leitura do saldo, só quando a nota vem; releitura não cobra).
- **Superadmin, "Confere":** Api-Key do Meu Danfe (validada sem gastar crédito, cifrada, nunca volta para a tela),
  preço por leitura (R$ 0,06), leituras grátis (15), termos com versão, chave Pix do recebedor, planos, pedidos com
  "Confirmar pagamento", saldo e ajuste por mercado, números do mês (inclui o custo no Meu Danfe).
- **Pix:** BR Code estático com valor e identificador do pedido; o pagamento cai na chave da plataforma e as
  leituras entram quando o superadmin confirma o pedido. Stripe fica como opção com crédito automático.
- **Testes:**
  - unidade (backend): leitura do XML, recusa de XXE, dígito da chave, resposta da distribuição com docZip,
    assinatura do evento de ciência validada, CRC do Pix igual ao exemplo do Banco Central — 6/6;
  - Playwright no celular com câmera simulada (código de barras do DANFE em vídeo, caminho WebAssembly do iPhone)
    e simulador do Meu Danfe no contrato da documentação: 39/39 — cadastro e aceite, 15 grátis, leitura em 2,5 s,
    conferência com falta e avaria, resumo e WhatsApp, releitura sem cobrança, chave inválida, Pix com QR,
    confirmação no painel e saldo 114, importação de XML, sem rolagem horizontal e sem erro JS;
  - segurança: 14/14 (outro mercado não lê nota nem pedido, mercado não chama o superadmin nem confirma o próprio
    pedido, leitura exige termos, chave do Meu Danfe cifrada e fora das respostas, RLS isola as notas, XXE e
    certificado falso recusados); extrato exato (+15, −1, +100);
  - regressão: navegação 28/28, encartes 41/41.
- **Não testado de ponta a ponta:** a Sefaz com certificado A1 real e a API do Meu Danfe com a Api-Key real.
  Validar em produção: cadastrar a Api-Key no painel (o botão "Testar a chave" não gasta crédito) e ler uma nota;
  cadastrar um A1 real e usar "Buscar agora".

### Ciclo 8.1 — Confere: diagnóstico da leitura, instalação e ícone configurável

- **Leitura que "não encontrou a nota":** o fluxo segue a documentação do Meu Danfe; o NOT_FOUND veio da API
  deles. Agora a tela mostra a chave lida e a mensagem do Meu Danfe (e orienta sobre boleto e XML), e o painel
  tem "Diagnóstico da consulta" com cada chamada e resposta, sem expor a Api-Key. Depois de um OK, o XML é
  baixado com novas tentativas (pode demorar um instante para ficar disponível).
- **Instalação:** o app já era instalável (Chrome sem erros de instalação); faltava o convite. Botão "Instalar o
  app" (Android abre o convite; iPhone mostra o passo a passo do Safari), com o evento capturado no index.html
  antes do app carregar. Manifest agora sai do backend com Content-Type application/manifest+json.
- **Ícone do app no superadmin:** envio de imagem, recorte 1:1 (arrastar e zoom), cor de fundo e margem da
  versão redonda, com prévias; gera 192, 512, 512 maskable e 180 (iPhone) e o manifest passa a usá-los. V59.
- **Testes:** PWA/ícone/diagnóstico 16/16; Confere 39/39; unidade 6/6.

### Ciclo 8.2 — Confere em passos e base de dados para fabricantes

- **Passo a passo:** Ler nota → Conferir → Revisar → Pronto, com indicador de passos em todas as telas. A
  conferência de um produto cabe na tela sem rolar (medido em 320×568, 360×640, 390×844 e 768×1024): foto e
  letras se ajustam à altura, "Problema" e as opções (lista, conferência cega) abrem em folhas, o bipe abre em tela
  cheia, "Veio certo" já passa para o próximo e arrastar para o lado troca de item. A revisão mostra diferenças,
  problemas e itens sem contar antes de encerrar.
- **Nada se perde:** cada toque fica no celular e vai ao servidor em seguida, ao sair da tela ou quando o sinal
  volta — inclusive o encerramento feito sem internet (antes ficava só no celular). A lista de notas também fica
  guardada para abrir sem sinal. Bipes fora da nota ficam guardados.
- **Armazenamento (V60):** itens de cada nota em tabela própria (GTIN de venda e da caixa, ligação ao catálogo,
  NCM, CFOP, quantidades, desconto, custo por unidade de venda, lote e validade); ao encerrar, entradas de estoque
  em unidades de venda (5 CX de 24 = 120 UN), com o contado, o esperado e o problema — item não contado fica
  "não conferido". Fornecedores (CNPJ, cidade, UF) e o endereço do mercado (bairro, cidade, IBGE, CEP) vêm da
  própria nota; o endereço só é gravado quando o destinatário é o CNPJ do mercado. Notas e conferências antigas
  são reprocessadas por um job em lotes.
- **Base para o produto de fabricantes (LGPD):** agregado semanal por GTIN em três níveis (bairro, cidade, UF),
  sem coluna de mercado nem de fornecedor, só com mercados que aceitaram os termos, só venda de mercadoria (sem
  bonificação/remessa), célula com pelo menos N lojas (padrão 3, ajustável no superadmin entre 2 e 50) e nenhuma
  loja com mais de 70% do volume. Visões de tração (4 semanas contra as 4 anteriores), sazonalidade por mês e
  custo por cidade. Recalculado toda madrugada. Os termos atuais já cobrem esse uso (agregado e anônimo).
- **Opt-in do mercado:** tela "Fabricantes" no app: o mercado pode autorizar (e retirar) que os fabricantes dos
  produtos que compra vejam seu nome, bairro e quantidades por mês, para receber condições personalizadas. Cada
  escolha fica registrada no extrato. Visão `mf_optin_store_sellin` respeita a RLS.
- **Superadmin:** card "Inteligência de produto (prévia)" com a cobertura da base, tração por produto/UF,
  sazonalidade e custo por cidade, mínimo de lojas e recálculo manual.
- **Decisão revisitada:** a regra anterior da divisão para fabricantes era "sem mínimo de lojas". Para o agregado
  de entrada de mercadoria o mínimo passou a existir (3) porque, sem ele, uma célula de bairro com uma loja
  mostraria as compras daquela loja. O valor é configurável.
- **Testes:** passos/sem rolagem/offline/opt-in 54/54; regressão Confere 39/39; dados (itens, estoque,
  localização, RLS, agregado, k lojas, dominância, bonificação) 33/33; backfill pelo job; unidade 7/7.

### Ciclo 9 — IA: correções da análise

- **Falha passageira não congela mais o texto do sistema:** o texto guardado quando todos os provedores
  falham vale 6 horas; depois a IA é tentada de novo e o texto dela substitui o do sistema. Cadastrar ou
  reativar uma chave apaga na hora os textos de falha do mercado e tira as credenciais dele da quarentena.
- **Cache com limpeza:** a rodada da madrugada apaga interpretações com mais de 90 dias (a função existia,
  mas nada a chamava). Oportunidade ainda aberta ganha o texto de novo na rodada seguinte.
- **DeepSeek na lista dos mercados:** endereço e modelo padrão prontos (o mesmo modelo dos temas de encarte)
  e link para criar a chave. Antes só entrava como "endpoint próprio".
- **Testes:** backend 241/241 (5 novos); API local: chave DeepSeek salva e cifrada, textos de falha
  apagados e texto da IA preservado.

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
