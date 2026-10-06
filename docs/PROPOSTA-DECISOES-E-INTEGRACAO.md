# Decisões com preço e custo informados, e a API de integração para ERPs

Proposta de 06/10/2026. Baseada no código atual (`main`, b571d9a) e nos dados de produção do Super Novo.

---

## 1. Onde o sistema decide às cegas hoje

Em produção, **100% dos produtos não têm custo** (`cost_source = MARGIN_ESTIMATE`) e nenhum tem estoque conhecido. Mesmo assim, várias decisões calculam preço, desconto e custo como se soubessem:

| Decisão | O que a tela mostra | De onde vem o número | Problema |
|---|---|---|---|
| **Promover** (recomendação e Copiloto "Promoções") | "Desconto sugerido de 8% respeita o teto de 70% da margem atual (25%)" | Margem **fixa de 25%** para todo produto sem custo (`FALLBACK_MARGIN_PERCENT`); teto = 70% dela = 17,5% | O texto afirma respeitar uma margem que o sistema inventou. Num produto de 8% de margem real, o "teto seguro" dá prejuízo |
| **Liquidar / dinheiro parado** | Desconto de 15% + risco × 15, limitado à mesma margem | Mesma margem fixa; estoque desconhecido | Não sabe quanto há para liquidar nem a que preço deixa de ter lucro |
| **Comprar → pôr no pedido** | Valor do pedido e custo do item | Último pedido ao fornecedor; senão `valorEstimado ÷ quantidade`; senão **R$ 0,00** (`RecommendationOrderService.unitCost`) | Pedido sai com custo zero quando não há histórico |
| **Copiloto: ajustar desconto** | Barra de desconto em % e o preço de oferta | Preço médio praticado × (1 − desconto) | O lojista escolhe uma %, não o preço que vai praticar; nada pergunta o custo |
| **Ajustar preço** (contra o mercado) | "Seu preço está X% acima da mediana" | Preço praticado nas notas e preços públicos | O dado é real, mas sem custo não sabe se o preço de mercado cabe |
| **Encarte** | Preço da oferta | Preço da loja, editável | Funciona; o preço digitado é perdido como informação |

**O que já é dado real e deve ser aproveitado:**
- o recebimento de pedido grava custo e entrada (`purchase_price_history`);
- as NF-e de entrada do Confere já entram como custo quando são coerentes (06/10).

## 2. Decisões com entrada manual: o lojista informa, o sistema calcula

### Princípio
> Sem custo informado, o sistema não decide preço: ele pergunta. O que o lojista informa vira dado e não precisa ser digitado de novo.

### O fluxo em 3 passos, igual para promover, liquidar, comprar e ajustar preço

1. **Ver:** a sugestão continua vindo da análise (o quê e por quê): giro, tração, parceiros e sazonalidade.
2. **Informar, item a item:**
   - **Custo unitário**: vem preenchido quando existe, sempre com a fonte ("NF-e de entrada de 02/10", "pedido de 15/09", "você informou em 01/10"). Sem fonte, vem vazio e é obrigatório.
   - **Preço de venda na ação**: em **R$**, não em %. A % aparece calculada ao lado.
   - **Quanto tem na loja** (só liquidar e comprar): opcional, com "não sei" como opção.
3. **Confirmar:** o sistema mostra, por item, **margem unitária, margem total esperada e quanto do estoque gira na ação**:
   - abaixo do custo: alerta vermelho, e confirmar exige marcar "sei que é abaixo do custo";
   - sem custo informado, o botão não libera.

### O que é gravado (vira base de dados)

| Informado | Onde fica | Para quê |
|---|---|---|
| Custo | `purchase_price_history` com nova coluna `source = 'MANUAL'` (migração) | Margem e GMROI reais; próximo uso já vem preenchido |
| Preço da ação e período | Itens da campanha (`campaign_products`: preço de oferta, início, fim) | Medir o efeito real da promoção contra o preço informado, e não contra o detectado nas notas |
| "Quanto tem na loja" | Nova tabela `stock_counts` (contagem informada, data, produto) | Ponto de partida do estoque: contagem + entradas − vendas. Sem isso o estoque continua desconhecido |

### Incentivo ao Confere
- Medidor no Início e no Decidir: **"Custo conhecido em X% do que você vende"**, com a meta e o caminho: "Conferindo as notas de entrada no Confere, custo e estoque entram sozinhos".
- O campo de custo diz de onde viria automaticamente: "Este produto chegou na NF-e de 02/10 do Atacado X: confira no Confere e não precisa digitar".
- Plano: custo manual ilimitado no Grátis (é dado para nós); o automático (Confere/ERP) como argumento de upgrade.

## 3. A API de integração para ERPs: a plataforma consome, não entrega

### A tese
**Entendo, e concordo com a direção, com um ajuste.**

O padrão de mercado é exatamente este: o **iFood Mercado** e a **Rappi** publicam uma API de catálogo, estoque e preço, e **os ERPs e integradores implementam**. A plataforma define o contrato, homologa os parceiros e publica a lista de quem é homologado. O lojista escolhe a plataforma e cobra do ERP a integração. Fontes:
- [iFood Merchant API, catálogo](https://developermercado.ifood.com.br/docs/guides/catalog-api/)
- [Parceiros homologados iFood Mercado](https://developermercado.ifood.com.br/docs/partners/)
- [Bluesoft integrando com o iFood Mercado](https://ajuda.bluesoft.com.br/integracoes/integracao-via-api-com-ifood-mercado/139746)
- [Rappi Partners API](https://dev-portal.rappi.com/api/)
- [padrões de integração da Rappi](https://dev-portal.rappi.com/integration-standards/)

O ajuste: **uma API que só recebe dá ao ERP pouco motivo para implementar.** O motivo dele é o cliente pedir. Por isso a saída existe, mas é **operacional e decidida pelo dono**, nunca análise:

> A inteligência sai do MercadoFlow como **decisão do lojista** (um pedido aprovado, um preço aprovado), nunca como **dado** (curva, giro, tração, previsão, score).

### O que entra (ERP → MercadoFlow)

| Recurso | Conteúdo | Por que nos interessa |
|---|---|---|
| `products` | GTIN, código interno, descrição, departamento, marca, unidade e embalagem (caixa × unidade) | Catálogo limpo; resolve "caixa × unidade" que hoje erra custo |
| `costs` | Custo da última entrada, custo médio, data, fornecedor | Margem e GMROI reais em todo o portfólio |
| `prices` | Preço vigente; preço promocional com início e fim | Promoção medida pelo preço oficial, não inferido |
| `stock` | Saldo por loja e data (ou movimentos) | Estoque real: cobertura, ruptura, dinheiro parado em R$ |
| `receipts` | Entradas de mercadoria (NF-e de entrada) | Mesmo papel do Confere, sem o lojista conferir |
| `suppliers` | CNPJ, prazo de entrega | Ponto de pedido com prazo real |

As vendas continuam vindo pelo agente das notas de saída. Pela API, só como alternativa opcional, quando o ERP é o PDV.

### O que sai (MercadoFlow → ERP)

| Sai | O que é | O que NÃO leva |
|---|---|---|
| **Pedido de compra aprovado** pelo lojista (webhook) | Fornecedor, itens, quantidades e custos combinados | O porquê, o giro, a previsão e a sugestão original |
| **Preço aprovado** pelo lojista (webhook) | Produto, preço novo, vigência | A análise de mercado ou de margem |
| **Status de sincronização** | Aceitos, rejeitados e motivo de validação | — |

**Nunca sai pela API:**
- desempenho de produto, curva ABC/XYZ e giro;
- tração e parceiros;
- sazonalidade e previsão;
- oportunidades não decididas e scores;
- comparações com outras lojas.

### Desenho técnico
- **REST + JSON**, contrato em **OpenAPI 3.1**, versão no caminho (`/partner/v1`).
- **Autenticação em duas camadas:**
  - o ERP (parceiro) tem credencial própria (OAuth2 client credentials);
  - cada loja **autoriza** o parceiro no painel (consentimento por escopo).
  - Escopos: `catalog:write`, `costs:write`, `prices:write`, `stock:write`, `receipts:write`, `orders:read`, `prices:read`.
  - O lojista revoga quando quiser.
- **Escrita em lote** de até 1.000 itens, com `Idempotency-Key`, validação por item (o que falhou e por quê) e limite de requisições por parceiro.
- **Webhooks assinados** (HMAC, como já fazemos com o agente) só para os eventos de saída, com reenvio.
- **Isolamento:** a credencial do parceiro só enxerga as lojas que o autorizaram (mesma RLS por loja de hoje).
- **Auditoria:** registro de cada chamada por parceiro e loja, visível ao lojista ("o ERP X enviou 4.210 preços hoje").

### Portal de documentação e programa de parceiros
- **Portal público:**
  - guia de início, referência gerada do OpenAPI e exemplos por recurso;
  - erros e limites, changelog e status;
  - **sandbox** com loja de teste.
- **Homologação:** checklist automático (lote idempotente, validação, webhooks, revogação). Níveis Registrado → Homologado. **Lista pública de ERPs homologados**, selo "Integra com MercadoFlow".
- **"Peça ao seu ERP"** dentro do painel:
  - o lojista escolhe o ERP que usa e o sistema envia ao fornecedor o link da documentação;
  - nós passamos a ver a demanda por ERP, o que serve de argumento para procurar os maiores.

### O diferencial que sai: "entrada de mercadoria pronta" (decidido em 06/10/2026)

Pelas notas de entrada que o **Confere** busca na SEFAZ (certificado A1 da loja), o MercadoFlow entrega ao ERP do lojista o **cadastro de produto e a entrada de estoque prontos para gravar**.

**O que existe no mercado e o que não existe:**
- ERPs já importam XML de entrada e cadastram produtos, mas o lojista baixa e importa o XML e faz o de-para à mão, loja por loja. Exemplos: [vhsys](https://ajuda.vhsys.com.br/categorias/compras/entrada-de-mercadoria-importar-xml), [Linx Microvix](https://share.linx.com.br/pages/viewpage.action?pageId=211787654), [GestãoClick](https://ajuda.gestaoclick.com.br/hc/pt-br/articles/33490521395351-Como-importar-produtos-por-NF-e-no-ERP).
- Catálogo por GTIN existe ([Bluesoft Cosmos](https://cosmos.bluesoft.com.br/api), 26 mi de itens), mas não conhece o código do fornecedor da loja nem a embalagem dele.
- **A combinação abaixo não existe hoje:**
  1. a nota chega sozinha (SEFAZ, sem XML manual);
  2. a entrada é conferida (recebido × nota);
  3. o de-para fornecedor → produto e caixa → unidade é aprendido em rede e confirmado pela venda no caixa;
  4. o produto vem enriquecido: nome padronizado, departamento, imagem, NCM, embalagem.

**O que sai, por loja autorizada:**

| Recurso de saída | Conteúdo |
|---|---|
| `inbound-products` | Para cada item das notas da loja: GTIN da unidade e da caixa, fator de conversão, código do fornecedor, descrição padronizada, marca, departamento, NCM/CEST, unidade, imagem |
| `inbound-receipts` | Entrada pronta: fornecedor (CNPJ), número da nota, itens já convertidos para a unidade vendida, quantidade recebida (conferida), custo unitário da própria nota, divergências |

**Travas (o que protege o negócio):**
1. **Só o que a loja comprou:** nunca o catálogo inteiro, nem busca livre por GTIN. Com isso o catálogo não pode ser copiado em massa.
2. **Troca obrigatória:** o parceiro só recebe `inbound-*` de uma loja se estiver enviando `stock` e `prices` (e `costs`, quando houver) dessa loja nos últimos N dias. Sem troca, a saída pausa e o lojista é avisado.
3. **Nada de outras lojas:** o de-para em rede compartilha só identificadores e fatores de conversão, nunca preço, custo ou volume de outra loja.
4. **Nada de inteligência:** desempenho, giro, tração, sazonalidade, previsão e scores continuam fora.
5. **Consentimento e revogação** pela loja, auditoria por chamada e limite por parceiro.

**Por que o ERP implementa:** passa a oferecer ao cliente dele "cadastro e entrada de nota automáticos", sem desenvolver leitura de SEFAZ, conferência e de-para. Em troca, envia estoque, preço e custo, que é exatamente o que falta à nossa análise.

**Requisito para isso funcionar:** o Confere precisa estar em uso, porque é ele quem traz as notas. Isso reforça a fase 2 (incentivo ao Confere) e muda a prioridade: o Confere vira a porta de entrada do ecossistema.

### O que já existe e entrega inteligência (revisar)
| Saída atual | Hoje | Proposta |
|---|---|---|
| Servidor MCP (`/api/v1/mcp`) | Ferramentas de capital, oportunidades e vendas para assistentes de IA, com o token do lojista | Uso pessoal do dono, mantido; fora do escopo de parceiros e com termo de uso |
| Exportação CSV (capital, oportunidades, decisões) | Plano pago | Manter para o dono; avaliar retirar "oportunidades" e scores, deixando decisões e números próprios |
| Indústria | Agregado anônimo por região | Já está no modelo certo: dado agregado, nunca por loja |

## 4. Ordem sugerida

| Fase | Entrega | Depende de |
|---|---|---|
| **1. Decisões com preço e custo informados** | Fluxo de 3 passos em promover, liquidar, comprar e ajustar preço. Custo obrigatório com fonte. Preço em R$. Margem calculada e alerta abaixo do custo. Migração `source` em `purchase_price_history`, `stock_counts` e preço por item de campanha. Retira os textos "respeita a margem" quando a margem é estimada. | — |
| **2. Medidor de custo conhecido + incentivo ao Confere** | "Custo conhecido em X%", sugestão do Confere no campo de custo | Fase 1 |
| **3. API de entrada v1** | `products`, `costs`, `prices`, `stock`, `receipts` com consentimento por loja, lote idempotente, auditoria. Portal com OpenAPI e sandbox. | Fase 1 (mesmas tabelas) |
| **4. Saída operacional** | "Entrada de mercadoria pronta" (`inbound-products`, `inbound-receipts`) com troca obrigatória; webhooks de pedido e preço aprovados; homologação; "Peça ao seu ERP" | Fase 3 e Confere em uso |
| **5. Programa de parceiros** | Lista pública, selo, revisão do MCP e do CSV | Fase 4 |

## 5. Decisões que dependem de você
1. **Pedido e preço aprovados saem para o ERP?** Recomendo que sim, para o ERP ter motivo de integrar e o lojista não digitar duas vezes. A alternativa (só entrada) protege mais, mas tende a não ser implementada pelos ERPs.
2. **Custo manual no Grátis:** liberar (é dado para nós) ou só nos planos pagos?
3. **Parceiro paga?** Recomendo homologação gratuita no início (precisamos da adesão) e cobrança só de volume alto ou de recursos premium no futuro.
4. **MCP e CSV:** manter como estão para o dono, ou restringir já?
