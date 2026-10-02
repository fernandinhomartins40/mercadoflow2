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

### Ciclo 10 — Copiloto F0a e F0: painel de APIs, créditos de IA e cortes

Implementação das fases F0a e F0 de `docs/PROPOSTA-IA-AGENTES.md` (revenda de IA: a plataforma compra
nos provedores e vende créditos aos mercados).

- **Painel "IA e APIs" (superadmin, `/super-admin/ia`):** chaves de DeepSeek, Jev, OpenRouter, Deepgram e
  WhatsApp (cifradas, só os 4 últimos dígitos na tela, endereço de lista fixa, botão Testar com saldo do
  DeepSeek); roteamento por tarefa editável (camada, modelo, tetos de tokens, créditos, preço de
  referência, limite de confiança do Jev, modo sombra); orçamento (teto diário global, câmbio, teto
  mensal padrão, créditos de teste); mercados de teste com carteira e ajuste; console que roda chat,
  "Por quê?" e Jev contra um mercado sem debitar; uso e custo por dia, tarefa, provedor e mercado;
  concordância do Jev em sombra; pacotes e confirmação de Pix; auditoria de toda alteração.
- **Portão da IA da plataforma:** tarefa roteada → interruptor geral → só piloto → chave → teto diário →
  créditos e teto mensal do mercado. Sem liberação, segue a chave própria do mercado (se houver) e, por
  fim, o texto do sistema.
- **Créditos de IA do mercado:** carteira, extrato, teto mensal, pacotes e compra por Pix (mesma chave
  Pix do Confere) em Configurações; o chat passa a funcionar com créditos mesmo no plano grátis.
- **Jev:** cliente próprio (`POST /v1/systemone`, perguntas de escolha, sim/não e escala) e modo sombra
  no chat (qual consulta?) e no "Por quê?" (o texto do sistema bastava?), sem atrasar a resposta.
- **Cortes da IA atual:** fim dos 40 textos por noite (explicação só no "Por quê?"); cache por faixas
  (contagem de detecções e números arredondados a 2 algarismos, datas preservadas).
- **Reaproveitamento:** a chave DeepSeek dos temas de encarte migrou para o painel e os temas usam a do
  painel quando não têm a própria.
- **Teste local:** simulador de DeepSeek e Jev ligado só com `-Dmercadoflow.ai.mock-base-url` na JVM
  (produção não define; a proteção contra endereço interno continua valendo).
- **Testes:** backend 257/257 (20 novos); ponta a ponta do painel, chat, créditos, Pix, roteamento, teto,
  "Por quê?", sombra e interruptor 34/34.

### Ciclo 11 — Copiloto F1: Jev decidindo, texto pronto e resumo do dia

- **Jev escolhe a consulta de verdade:** com a rota `JEV_FERRAMENTA` fora do modo sombra, a primeira
  pergunta de uma conversa passa pelo Jev (qual consulta? é só número direto?). Com confiança acima do
  limite da rota:
  - pergunta de número direto ("quanto vendi na semana?", "quais os 5 mais vendidos?") roda a consulta e
    sai em **texto pronto**, sem DeepSeek e sem debitar crédito (registro com camada `TEMPLATE`);
  - pergunta de análise vai ao DeepSeek levando **só a consulta escolhida**, o que corta os tokens das
    descrições das outras ferramentas.
  Abaixo do limite, ou com o Jev fora do ar, segue o caminho anterior. Período e quantidade saem da
  pergunta por código (`DirectAnswers`), nunca do Jev.
- **Resumo do dia:** às 6h (horário de Brasília) o job gera, para cada mercado ativo, um texto pronto
  com as vendas de ontem contra o mesmo dia da semana anterior, os 3 assuntos de maior prioridade e as
  recomendações esperando decisão. Sem IA e sem custo. Tabela `ai_daily_briefs` (V62, com RLS).
- **Tela Hoje:** cartão "Resumo do dia" com botão **Ouvir** (voz do próprio aparelho, sem custo) e botão de
  atualizar. O cartão aparece só depois da ativação, quando já há vendas.
- **Testes:** backend 267/267 (10 novos); ponta a ponta da F1 15/15 (resumo, texto pronto com 0 crédito,
  análise indo ao modelo); regressão da F0 34/34.

### Ciclo 12 — Copiloto F2: voz

- **Padrão grátis, no aparelho:** reconhecimento de fala e voz do próprio navegador (pt-BR). Os comandos
  são lidos por código no celular (`utils/voiceCommands.ts`), inclusive números por extenso ("vinte e
  três", "meia dúzia", "quatro vírgula cinco"); funciona sem sinal.
- **Chat:** botão "Perguntar falando"; pergunta feita por voz tem a resposta falada.
- **Resumo do dia:** botão "Responder falando": "detalhe" abre a Central, "depois" encerra, "repete" lê
  de novo e frase longa vira pergunta no chat, já respondida em voz.
- **Confere, mãos livres na contagem:** microfone na barra do polegar; fica ouvindo até desligar.
  "Mais dois", "menos um", "contei doze", "veio certo", "avaria", "validade", "trocado", "próximo",
  "volta", "terminei". O microfone desliga sozinho fora da contagem.
- **Jev só como reserva:** frase que a lista fixa não reconhece vai ao Jev (rota `JEV_COMANDO_VOZ`), que
  escolhe entre as ações daquela tela ou "nenhuma"; nunca lê número; abaixo do limite de confiança, nada
  acontece e a tela pede para repetir.
- **Transcrição paga (Deepgram):** só quando o navegador não tem reconhecimento de fala. O app grava
  até 1 minuto, o servidor transcreve (rota `VOZ_TRANSCRICAO`, camada nova "Voz", 1 crédito) e o áudio
  não é guardado. Na camada Voz, os "tokens de entrada" do registro de uso são segundos de áudio.
- **Migração V63:** as duas rotas novas, editáveis no painel IA e APIs.
- **Correção:** requisição com formato não suportado passa a responder 400 em vez de 500.
- **Testes:** backend 273/273 (13 novos de voz e texto pronto); leitor de comandos 34/34; ponta a ponta
  da voz 32/32 (chat, resumo, conferência, Jev, transcrição paga com gravação real do navegador);
  conferência com microfone sem rolagem em 320, 360 e 390 px (24/24); F0 34/34 e F1 15/15.

### Ciclo 13 — Copiloto F3a: agentes, caixa de decisões e memória

- **Três agentes** (Gerente, Compras e Recebimento) em funil, como na seção 6.5 da proposta:
  1. **Motor:** cada agente lê os números que o sistema já calcula e monta o texto pronto, sem IA.
     - Compras junta as compras recomendadas num pedido só.
     - Recebimento prepara a mensagem ao fornecedor quando a conferência termina com falta, sobra ou
       problema.
     - Gerente avisa a oportunidade nova de alta prioridade.
  2. **Memória:** o funil descarta o sinal já avisado (mesmo hash dos números), o que foi recusado há
     menos de 14 dias, o que está abaixo do valor mínimo e o que passa do limite de avisos do dia.
  3. **Jev:** uma chamada responde "vale avisar?" e "é urgente?", com as lições do assunto. O Jev só
     silencia quando está confiante. Sem Jev, vale a regra.
  4. **DeepSeek:** entra só no "Por quê?" (rota `AGENTE_EXPLICAR`, 1 crédito, guardado). As lições vão
     escolhidas pelo montador de contexto (Jev com nota de relevância, ou a regra), e cada montagem
     fica registrada.
- **Caixa de decisões** (`/app/copiloto`, menu Hoje → Copiloto):
  - abas Para decidir, Decididas e Silenciadas; as silenciadas ficam visíveis para auditar o Jev;
  - **Aprovar** só executa no nível 2: o pedido vai para o rascunho de cada fornecedor (o mesmo caminho
    da Central) e a mensagem ao fornecedor abre no WhatsApp do lojista;
  - **Recusar** pede o motivo, e a recusa vira lição;
  - dois toques seguidos não executam a ação duas vezes;
  - uma proposta nova do mesmo assunto substitui a anterior, e a pendente expira em 7 dias.
- **Agentes:** por agente, o lojista escolhe se está ligado, o nível (0 só avisar, 1 sugerir, 2 deixar
  pronto), o limite de avisos por dia e o valor mínimo. Também define o horário de silêncio. O nível 3
  (executar sozinho) fica para a F5.
- **Memória da loja:** as lições são escritas por código, sem IA, e aparecem na tela:
  - fornecedor que entrega com falta (das últimas 6 conferências);
  - resultado medido por tipo de ação (todo dia às 4h30);
  - recusas do lojista com motivo.
- **Vigília:** job a cada 5 minutos, no perfil `jobs`. A maior parte da rodada é consulta ao banco; o Jev
  entra só para o sinal que passa pela memória. Há também o botão "Verificar agora".
- **Resumo do dia** cita o que o Copiloto preparou; o lojista diz "aprova" e a decisão é aprovada por voz.
- **Migração V64:** tabelas `ai_agent_settings`, `ai_copilot_prefs`, `ai_decisions`, `ai_lessons`,
  `ai_context_traces` e `ai_agent_runs` (todas com RLS), rotas `JEV_VIGILIA` e `AGENTE_EXPLICAR`, e
  `JEV_RELEVANCIA` fora da sombra.
- **Testes:**
  - backend 282/282 (9 novos do funil);
  - ponta a ponta da F3a 38/38: funil 4 sinais → 3 avisos + 1 silenciado, sem repetição, "Por quê?"
    com cache, aprovar pedido e WhatsApp, recusa virando lição, nível 0, limite do dia, substituição e
    "aprova" por voz;
  - regressão: F0 34/34, F1 15/15 e F2 32/32.

### Ciclo 14 — Copiloto F3b: canal WhatsApp

- **API oficial da Meta (Cloud API).** O token e o ID do número ficam no provedor WhatsApp do painel.
- **Superadmin**, cartão novo "WhatsApp: modelo de mensagem e webhook":
  - nome e idioma do modelo aprovado;
  - token de verificação (com botão Gerar);
  - segredo do app, guardado cifrado e nunca devolvido à tela;
  - endereço do webhook para cadastrar;
  - botão "Enviar avisos agora" para um mercado do piloto.
- **O que configurar na Meta:** um modelo da categoria Utilidade com corpo `{{1}}` e dois botões de
  resposta rápida, **Aprovar** e **Depois**.
- **Lojista** (Copiloto → Agentes): número com DDD e aceite explícito ("responda PARAR para cancelar"),
  com data do aceite.
- **Envio** a cada 5 minutos, no mesmo job da vigília:
  - só para quem aceitou, fora do horário de silêncio;
  - resumo do dia uma vez por dia (a partir das 6h30);
  - até 3 avisos por rodada;
  - cada decisão é avisada uma vez;
  - o botão Aprovar carrega o id da decisão.
  Tudo com texto pronto, sem IA. O custo por mensagem fica no uso (rota `WHATSAPP_AVISO`, camada
  nova "Canal", 0 crédito por padrão).
- **Webhook** (`/api/v1/public/whatsapp/webhook`):
  - verificação pelo token cadastrado;
  - cada mensagem só é aceita com a assinatura HMAC dos bytes recebidos;
  - o botão Aprovar só aprova decisão de um mercado daquele número;
  - "aprova" escrito aprova a última decisão avisada;
  - texto solto recebe ajuda e número desconhecido é ignorado;
  - "PARAR" cancela o aceite na hora (LGPD).
  A confirmação responde com o resultado: itens no rascunho, ou a mensagem pronta para encaminhar ao
  fornecedor.
- **Migração V65:** `ai_whatsapp_config` (linha única), `ai_whatsapp_messages` (com RLS) e rota
  `WHATSAPP_AVISO`.
- **Testes:**
  - backend 287/287 (5 novos do canal);
  - ponta a ponta da F3b 38/38: configuração, aceite, envio sem repetir, webhook com e sem assinatura,
    aprovar pelo botão e por texto, ajuda, número desconhecido e PARAR;
  - regressão: F0 34/34, F1 15/15, F2 32/32 e F3a 38/38.

### Ciclo 15 — Copiloto F4: mais modelos, agentes novos e servidor MCP

- **Cadeia de reserva de modelos:** se o modelo da rota falhar, o Copiloto tenta as reservas, na
  ordem, antes de cair no texto do sistema.
  - Vale para o chat, para o "Por quê?" de oportunidades e para o "Por quê?" das decisões.
  - Cada reserva tem o próprio preço (tabela `ai_route_fallbacks`, até 5 por tarefa).
  - Reserva inicial: Qwen 3.5 Flash pelo OpenRouter. Confira o id do modelo antes de ligar.
  - O lojista paga o crédito uma vez só.
  - Editável em IA e APIs → Roteamento → Cadeia de reserva.
- **Custo por tarefa bem resolvida** (IA e APIs → Uso): por tarefa e modelo, mostra chamadas, taxa de
  sucesso, custo por resposta que deu certo e tempo. Também mostra o aceite das decisões dos agentes,
  no geral e quando o lojista pediu o "Por quê?". É o critério da proposta para escolher o modelo de
  cada tarefa.
- **Quatro agentes novos** no mesmo funil:
  - **Capital parado:** liquidações sugeridas, com o valor parado e os dias de estoque.
  - **Preço:** compara o preço da loja com o do mercado e avisa que a referência pode ser de outra
    região.
  - **Promoções:** ao aprovar, deixa o rascunho do encarte pronto no Estúdio, com o preço de oferta
    calculado pelo desconto sugerido.
  - **Cenários:** quando uma data forte começa em 3 a 21 dias, compara a venda por dia da mesma
    temporada no ano passado com as 4 semanas anteriores e lista o que mais vendeu. Só informa.

  Aprovar aceita as recomendações pelo caminho da Central, e o resultado é medido em 30 dias. Nada
  muda no caixa.
- **Servidor MCP do MercadoFlow** (`/api/v1/mcp`, HTTP com JSON-RPC 2.0, sem sessão):
  - expõe as mesmas consultas do "Pergunte aos dados", só leitura, para Claude, ChatGPT, dsh ou
    qualquer agente que fale MCP;
  - a chave é por integração, criada em Copiloto → Agentes, mostrada uma vez, guardada só como hash e
    revogável;
  - o mercado vem da chave, nunca dos argumentos, e a consulta roda com o mercado no contexto (RLS);
  - limite de 60 chamadas por minuto por chave, e o uso fica registrado.
- **LAYA:** não entrou. Pela proposta, só vale se o volume justificar, depois de 30 dias em paralelo com
  o Jev.
- **Migração V66:** `ai_route_fallbacks` e `ai_mcp_keys` (com RLS).
- **Testes:**
  - backend 298/298 (11 novos: cadeia, MCP, Cenários e preço de oferta);
  - ponta a ponta da F4 31/31: reserva respondendo com o DeepSeek fora, cobrança única, custo por
    modelo, 3 agentes novos, encarte pronto e MCP (chave, initialize, tools/list e tools/call com
    mercado da chave, revogação);
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38 e F3b 38/38.

### Ciclo 16 — Copiloto F5: autonomia (nível 3)

- **"Fazer sozinho, dentro dos meus limites"** só para o agente de Compras. Ele monta o rascunho de
  pedido e avisa; nada é enviado ao fornecedor sem revisão. Os outros agentes vão no máximo ao nível 2:
  a ação deles depende da loja (preço no caixa, liquidação). Registrar isso sozinho falsearia a
  medição de resultado e as lições.
- **Travas.** Todas precisam estar abertas ao mesmo tempo; senão a decisão espera o sim, e o motivo
  aparece no cartão:
  1. liberação global no superadmin (começa desligada), com teto máximo por pedido;
  2. aceite explícito do lojista, com data e autor;
  3. teto por pedido e teto por dia (soma do que foi feito sozinho e não desfeito);
  4. todos os itens com fornecedor habitual (o do pedido mais recente do produto) na lista de
     permitidos;
  5. botão "Pausar tudo" do lojista.

  Sair do nível 3 apaga o aceite: voltar exige aceitar de novo.
- **Desfazer em até 24 horas** qualquer decisão aprovada (pelo lojista ou pelo nível 3): as
  recomendações voltam para a caixa e os itens saem do rascunho. No agente de Promoções, o rascunho do
  encarte é apagado se ainda não foi publicado.
- **Rastro:** a aba "Feitas sozinho" e o selo "Feito pelo Copiloto" mostram o que o agente fez. Também
  ficam registrados o autor (`copiloto:compras (nível 3)`), o resultado e quem desfez. O WhatsApp avisa
  o que foi feito e como desfazer, com botões que não aprovam nada.
- **Correção:** o agente de Compras passou a contar como "no pedido" só o que entrou no rascunho. O que
  foi aceito sem produto ou quantidade aparece à parte.
- **Migração V67:** `ai_autonomy_config`; nível 0 a 3 e limites em `ai_agent_settings`; pausa em
  `ai_copilot_prefs`; `auto_executed`, `undone_at` e `undone_by` em `ai_decisions`.
- **Testes:**
  - backend 303/303 (5 novos da guarda);
  - ponta a ponta da F5 25/25: bloqueado sem liberação, recusa sem fornecedor ou sem aceite, pedido
    feito sozinho, aviso no WhatsApp, desfazer, fornecedor fora da lista, teto, pausa e aceite
    apagado ao sair;
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38, F3b 38/38 e F4 31/31.

### Ciclo 17 — Assinaturas S0 e S1 (docs/PROPOSTA-ASSINATURAS.md)

Decisões do owner: o plano Grátis é permanente; teste de 7 dias sem cartão; atraso com 7 dias de
carência e depois só consulta; Asaas e Stripe lado a lado (S2); Copiloto dentro dos planos (S3).

- **S0 (6be303b):**
  - "Esqueci minha senha" por e-mail (Resend), com link de 30 minutos e resposta neutra;
  - o login explica o motivo do bloqueio, mas só depois de conferir a senha;
  - troca de plano no Stripe sem cobrança dupla.
- **S1, assinatura única** (`subscriptions`, uma por rede, na matriz):
  - estados Grátis, Teste, Ativa, Em atraso, Só consulta, Pausada, Suspensa, Pendente e Cancelada;
  - `plan_type`, `billing_status` e `trial_ends_at` do mercado e das filiais passam a ser espelho;
  - Stripe, régua das faturas de rede, superadmin, contrato de rede e cadastro mudam o estado por
    `SubscriptionService`. Os caminhos antigos sincronizam depois do commit, numa transação própria.
- **Ciclo diário** (`BillingLifecycleJob`, 8h15; o superadmin também pode rodar na hora):
  - teste vencido volta ao Grátis; um aviso sai 48 h antes do fim;
  - atraso além da carência vira só consulta;
  - 30 dias só consulta volta ao Grátis;
  - cancelamento agendado vale no fim do período.

  Cada passo gera um aviso no app e um e-mail aos donos, sem repetir (chave por aviso). Prazos ficam
  em `billing_settings`, editáveis no superadmin (Assinaturas → Planos e preços).
- **Só consulta:**
  - toda alteração em `/markets/{id}/**` devolve 402, com a frase em português;
  - continuam liberados pagamento, assinatura, avisos, créditos de IA e Confere;
  - o agente do PDV segue enviando notas, e o superadmin não é afetado;
  - a IA da plataforma recusa com o motivo, e agentes e WhatsApp param.
- **Telas:**
  - faixa no topo do app: teste com dias restantes, atraso com prazo, só consulta;
  - "Testar 7 dias grátis" e selo "Em teste" em Planos, mais a lista "Avisos da conta";
  - `/app/assinatura` aponta para Planos até a tela própria (S3).
- **Correção antiga (V72):** o gatilho que impede filial de filial era BEFORE UPDATE. Ele travava a
  linha do mercado em modo exclusivo, e a troca de plano pelo superadmin ficava pendurada esperando o
  registro de evento. Agora é AFTER, com a mesma regra.
- **Migrações:**
  - V70: tokens de nova senha e provedor de e-mail;
  - V71: `billing_settings`, `subscriptions` (com carga a partir dos mercados) e `app_notifications`,
    com RLS;
  - V72: gatilho de rede como AFTER.
- **Testes:**
  - backend 321/321;
  - ponta a ponta: S0 20/20 e S1 40/40 (teste, lembrete sem repetir, volta ao Grátis, superadmin,
    carência, 402, IA, faixa, regras pela tela);
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38, F3b 38/38, F4 31/31 e F5 25/25.

### Ciclo 18 — Assinaturas S2: Pix e boleto (Asaas) ao lado do cartão (Stripe)

- **Checkout com escolha:** ao assinar, o lojista escolhe Pix, boleto ou cartão. Só aparece o que está
  configurado.
  - Pix e boleto criam uma assinatura mensal no Asaas e levam à fatura hospedada por ele. O plano só
    muda quando o pagamento é confirmado; até lá, Planos mostra "Abrir fatura".
  - O cartão segue no Stripe, como antes.
- **Troca de plano no Asaas:** muda o valor da mesma assinatura, sem cobrança dupla. Contratação
  anterior não paga é descartada.
- **Pagar agora** abre a fatura vencida, ou a da contratação pendente. Quem paga no cartão vai ao
  portal do Stripe.
- **Cancelar assinatura** apaga a assinatura no Asaas. O plano vale até o fim do período pago, e depois
  a conta volta ao Grátis pelo ciclo diário.
- **Avisos de pagamento:**
  - `/api/v1/public/asaas/webhook`, com o token no header `asaas-access-token`, gerado e cadastrado
    pelo botão "Conectar avisos de pagamento". Ele é guardado cifrado e conferido em tempo constante;
  - cada aviso é tratado uma vez (`billing_webhook_events`), na mesma transação que o efeito;
  - pagamento confirmado: plano ativo por um mês a partir do vencimento;
  - fatura vencida: entra em atraso (carência, depois só consulta);
  - assinatura apagada: cancela no fim do período.
- **Créditos sem confirmação manual:** com o Asaas ligado, o Pix de créditos de IA e de leituras do
  Confere sai com o QR do Asaas, e o aviso credita sozinho. "Confirmado" mais "recebido" não credita
  duas vezes. Sem o Asaas, segue o Pix na chave da plataforma com confirmação no painel.
- **Nota fiscal:** com a opção ligada (código do serviço municipal, descrição, ISS e observações), cada
  assinatura nova recebe a configuração para o Asaas emitir a NFS-e a cada pagamento confirmado.
- **Painel:**
  - provedor ASAAS em IA e APIs → Chaves e canais: chave cifrada, sandbox ou produção, teste em
    `/myAccount`, e-mail de alerta;
  - Assinaturas → Planos e preços → "Pix e boleto (Asaas)".
- **Pix Automático:** ainda não implementado. Hoje a assinatura por Pix gera uma cobrança Pix por mês,
  confirmada sozinha. O Pix Automático do Asaas (débito autorizado) exige liberação na conta e um fluxo
  de autorização próprio.
- **Migração V73:**
  - provedor ASAAS;
  - `billing_customers` (com RLS) e `billing_webhook_events`;
  - contratação pendente em `subscriptions`;
  - id, payload Pix e fatura do Asaas em `ai_orders` e `confere_orders`;
  - nota fiscal e token do aviso em `billing_settings`.
- **Testes:**
  - backend 325/325;
  - ponta a ponta do S2 42/42: chave, avisos e nota pela tela, token errado, sem CNPJ, assinatura por
    Pix, pagamento, aviso repetido, troca para boleto, vencida e paga, créditos de IA e do Confere,
    cancelamento e volta ao Grátis;
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38, F3b 38/38, F4 31/31, F5 25/25, S0 20/20 e
    S1 40/40.

### Ciclo 19 — Assinaturas S3: catálogo com recursos, Copiloto nos planos e Minha assinatura

- **Um catálogo só:** `plan_feature_definitions` e `plan_features` dizem o que cada plano dá.
  - **Inteligência:** previsão em dias, rede, clientes, simulação de preço, histórico de resultados e
    exportação.
  - **Copiloto:** resumo e voz, perguntas, agentes, WhatsApp, autonomia e créditos de IA por mês.
  - `Entitlements` responde às checagens do sistema (`PlanService`, chat, agentes, WhatsApp, nível 3)
    e alimenta a vitrine. A escada antiga do enum fica só como reserva.
  - O superadmin muda um recurso pela tabela em Assinaturas → Planos e preços. A mudança vale na
    hora para todos os assinantes do plano e fica registrada (`plan_feature_changes`).
  - "Só para novos assinantes" não foi feito.
- **Copiloto dentro dos planos:**
  - Grátis: resumo do dia e voz;
  - Essencial: mais perguntas, agentes e caixa de decisões;
  - Profissional e Rede: mais WhatsApp e o Copiloto agindo sozinho (nível 3).

  Fora do plano, a tela explica qual plano libera. A vitrine tirou as notas por semana, que seguem
  só como teto técnico.
- **Créditos de IA inclusos:** 50 / 500 / 1.500 / 3.000 por mês, por loja.
  - São gastos antes dos comprados e vencem na virada do mês.
  - Ao subir de plano no meio do mês, a diferença entra na hora, e o extrato registra só o
    complemento.
  - O teto mensal do mercado passa a somar os inclusos.
- **Minha assinatura** (`/app/assinatura`, no menu Loja):
  - plano e estado, valor mensal, próxima cobrança e forma de pagamento;
  - o que o plano inclui e o uso de lojas, caixas e pessoas;
  - créditos de IA (do plano e comprados) e leituras do Confere;
  - adicionais, faturas com link da nota fiscal;
  - pausar ou cancelar.
- **Adicionais:** loja extra (R$ 79) e usuário extra (R$ 19), com preço editável no superadmin.
  - Somam aos limites e ao valor da mesma assinatura no Asaas, com a fatura em aberto atualizada.
  - Diminuir é recusado quando o uso passaria do limite.
  - No cartão (Stripe), o pedido vai ao comercial.
- **Pausa de 1 ou 2 meses** (assinaturas por Pix ou boleto):
  - a conta usa os limites do Grátis;
  - a próxima cobrança e o fim do período pago andam junto, sem perder o que já foi pago;
  - o ciclo diário retoma sozinho, e "Voltar agora" antecipa.
- **Cancelamento com motivo:** preço, pouco uso, faltou recurso, temporada, fechou a loja ou outro,
  mais um comentário. A pausa é oferecida antes. O cartão cancela no Stripe ao fim do período. O
  superadmin vê "Por que saíram". No fim do período, os adicionais também se encerram.
- **Migração V74:** definições e valores de recursos, descrições dos planos, créditos inclusos em
  `ai_wallets`, `addon_catalog`, `subscription_addons` (RLS), `paused_from` e
  `subscription_cancel_feedback` (RLS).
- **Testes:**
  - backend 328/328;
  - ponta a ponta do S3 47/47;
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38, F3b 38/38, F4 31/31, F5 25/25, S0 20/20,
    S1 40/40 e S2 42/42.

  As suítes do Copiloto passam a rodar com o mercado de teste no Profissional, com os créditos do
  plano zerados, para medir só o saldo comprado.

### Ciclo 20 — Assinaturas S4: equipe, papéis por função e verificação em duas etapas

- **Papéis por função:** Dono, Gerente, Comprador, Conferente, Financeiro e Leitura (`users.team_role`).
  - O papel de sistema continua guardando as rotas: o Dono é `MARKET_OWNER`; os demais,
    `MARKET_MANAGER`.
  - Um filtro único (`TeamPermissions`, no `TenantAccessFilter`) decide por área da rota: equipe,
    assinatura, Confere, compras, decisões do Copiloto, operação e ações que só leem. Assim a rota
    pergunta "pode comprar?" em vez de "é dono ou gerente?".
  - O 403 vem com a frase do papel.
  - Gerente: tudo, menos assinatura e equipe.
  - Comprador: lê tudo; altera compras, fornecedores e Confere, e decide no Copiloto só os agentes
    de Compras e Recebimento.
  - Conferente: só o Confere (o app redireciona).
  - Financeiro: lê tudo e cuida da assinatura.
  - Leitura: lê e pergunta ao Copiloto, sem alterar nada.
- **Equipe** (`/app/equipe`, só para o dono):
  - convite por e-mail com link de 7 dias e uso único, e botão para mandar o mesmo link pelo
    WhatsApp;
  - papel e loja (matriz = rede toda; filial = só a filial);
  - reenviar (o link anterior deixa de valer) e cancelar convite;
  - mudar papel e loja (vale na hora), desativar e reativar, último acesso;
  - contador do plano com convites em aberto, e "Comprar usuário extra" quando lota.
- **Aceite** (`/aceitar-convite`): a pessoa cria a senha (mesma regra do cadastro) e já entra.
- **Transferência de titularidade:** o dono pede com a senha, e a pessoa (da matriz) aceita em Conta.
  Os papéis trocam, o mercado passa a apontar para o novo dono e o antigo fica como gerente.
- **Verificação em duas etapas** (opcional, dono e financeiro):
  - TOTP sem biblioteca nova, conferido com o vetor da RFC 6238;
  - QR e chave para o aplicativo e 8 códigos de recuperação de uso único;
  - no login, um desafio de 5 minutos com até 5 tentativas e limite por IP; também no Confere;
  - desligar pede senha e código.
- **Correção antiga:** o cadastro grava `user_seat_limit = 2` em toda conta, e o limite era tratado
  como negociado. Com isso, quem pagava ficava preso em 2 pessoas. Agora o campo só vale quando dá
  mais que o plano.
- **Migração V75:** `team_role`, colunas de TOTP, `team_invites` (RLS), `ownership_transfers` e
  `mfa_challenges`.
- **Testes:**
  - backend 336/336 (permissões por papel, TOTP);
  - ponta a ponta do S4 49/49;
  - regressão: F0 34/34, F1 15/15, F2 32/32, F3a 38/38, F3b 38/38, F4 31/31, F5 25/25, S0 20/20,
    S1 40/40, S2 42/42 e S3 47/47.

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
