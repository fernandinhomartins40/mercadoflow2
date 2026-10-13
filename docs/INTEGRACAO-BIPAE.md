# Bipae + MercadoFlow: integração nativa

Proposta e entrega de 12/10/2026. O Bipae (PDV e ERP, www.bipae.com.br) é da mesma empresa do MercadoFlow e roda na mesma VPS.

## A tese

A API de parceiros do MercadoFlow (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md) foi desenhada para ERPs **de terceiros** e, de propósito, **não entrega inteligência**: um ERP de fora recebe só a entrada de mercadoria pronta e o que o dono aprovou.

O Bipae é da casa. Ele pode ir onde nenhum concorrente vai:

| | ERP de terceiros | Bipae |
|---|---|---|
| Vendas | Só pelo agente Windows lendo XML na pasta | **Direto do caixa, na hora, sem instalar nada** |
| Cadastro de produto | Envia o dele | **Bipou, cadastrou**: nome, marca, categoria, foto e NCM vindos do catálogo |
| Decisões do Tino | Nunca | **Dentro do Bipae**, com link que abre a decisão no MercadoFlow |
| Preço da região | Nunca | **Na tela de preço do Bipae** (mediana, faixa, menor preço e loja) |
| Encartes | Nunca | **O preço do encarte vira oferta no caixa**, na vigência |
| Troca obrigatória (estoque e preço a cada 7 dias) | Exigida | Dispensada (o Bipae já manda as vendas) |
| Conexão | Lojista digita o código do ERP em Integrações | **Botão "Conectar ao MercadoFlow" dentro do Bipae**; o dono aprova com 1 clique |
| Rede | Internet, https | **Rede interna do Docker** (mesma VPS) |

**O argumento de venda:** "Comprou o Bipae, ganhou um analista de compras e preço". Nenhum PDV concorrente consegue oferecer, porque a inteligência do MercadoFlow não sai para terceiros.

**O que continua só no MercadoFlow, mesmo para o Bipae:** giro, curva, tração, sazonalidade, previsão e o raciocínio completo das decisões. O Bipae mostra a decisão e leva o dono ao MercadoFlow para decidir. É isso que mantém os dois produtos com valor próprio.

## O que foi implementado (MercadoFlow)

### Parceiro da casa
- `integration_partners.first_party` (migração V95). O super admin marca em **Parceiros → Sistema da casa**.
- Quatro escopos exclusivos, recusados para qualquer outro parceiro (no consentimento, na aprovação e na API):

| Escopo | Libera |
|---|---|
| `sales:write` | `POST /markets/{id}/sales` e `/sales/cancel` |
| `catalog:read` | `GET /markets/{id}/catalog/{gtin}` e `POST /markets/{id}/catalog/lookup` |
| `insights:read` | `GET /markets/{id}/decisions` e `GET /markets/{id}/local-prices` |
| `promotions:read` | `GET /markets/{id}/promotions` |

- O Bipae aparece em **Integrações** de toda loja, com o selo "Da mesma empresa", mesmo sem estar na lista pública.
- Tirar a marca "da casa" remove os escopos exclusivos de todos os vínculos.

### Vendas do caixa
- Mesmo formato (`InvoiceDTO`) e mesmas regras das notas do agente: cota do plano, duplicidade pela chave de acesso, catálogo e cesta.
- Lote de até 500 vendas, resultado por venda (`GRAVADO`, `JA_RECEBIDA`, `RECUSADO`, `LIMITE_DO_PLANO`), `dryRun` para testar.
- Cancelamento pela chave: a venda sai da base. Os números do dia são refeitos na agregação noturna.

### "Conectar ao MercadoFlow"
1. O Bipae chama `POST /api/v1/partner/connect` com CNPJ, nome da loja, e-mail do dono, id da loja no Bipae e a URL de volta.
2. Recebe `connectUrl` (`https://mercadoflow.com/conectar?code=mfx_...`, válido por 7 dias).
3. O dono abre o link e entra, ou cria a conta com os dados da loja já preenchidos. Confere as permissões e aprova.
4. O vínculo é criado e o Bipae recebe o aviso `connection.authorized` com o `marketId`. Em seguida o navegador volta para a URL de volta com `?mf_status=ok&mf_market=<id>`.
5. Se o dono revogar em Integrações, o Bipae recebe `connection.revoked`.

### Mesma VPS
- O Bipae chama `http://mercadoflow-backend:8080/api/v1/partner/...` pela rede `mercadoflow-web_default`.
- O MercadoFlow entrega os avisos em `http://bipae-api:3333/...`: http só é aceito para o parceiro da casa e para hosts listados em `APP_PARTNER_INTERNAL_HOSTS` (padrão `bipae-api`).
- **Não há banco compartilhado.** Cada produto continua com o próprio deploy, as próprias migrações e a própria escala. O contrato é a API.

### Arquivos
- Backend:
  - `FirstPartyService`
  - `FirstPartyApiController`
  - `PartnerCallLog`
  - `PartnerScopes` (escopos da casa)
  - `PartnerWebhookService` (`enqueueTo`, eventos de conexão)
  - `MarketIntegrationController` (aprovar ou recusar a conexão, aviso de revogação)
  - `PublicPartnerController` (dados do link antes do login)
  - V95
- Frontend:
  - `/conectar` (`Connect.tsx`)
  - Integrações: selo, escopos por parceiro e chamadas novas no log
  - Super admin: "Sistema da casa"
  - Login e cadastro voltam para a aprovação pendente
- Instrução para a IA do Bipae: `docs/BIPAE-INSTRUCOES-PARA-IA.md`.

## Segunda leva (12/10/2026): catálogo, contas, desconto e Confere

### Catálogo nativo para toda loja Bipae
- Não exige conta no MercadoFlow. São 267 mil produtos, praticamente todos com imagem própria.
- **Por código de barras:**
  - nome padronizado, marca, fabricante, departamento e categoria;
  - unidade, se é de balança e conteúdo lido do nome (500 g, 1,5 kg, 12 × 350 ml), para o preço por kg/L;
  - NCM e CEST sugeridos (os mais usados nas notas e nos cadastros do Bipae, com a confiança);
  - códigos de caixa e fardo vistos nas notas de entrada;
  - imagem e ficha técnica (descrição, ingredientes, tabela nutricional, atributos).
- **Por nome:** cada palavra em qualquer ordem, sem acento, com índice de trigramas (V96).
  - Medido em produção sem o índice: 1,6 s. Com o índice, deve cair para milissegundos.
- **Fotos genéricas** (frutas, carnes, padaria, frios) para produto sem código.
- **O Bipae devolve o que as lojas cadastram:**
  - produto que o catálogo não tinha passa a existir;
  - NCM e CEST viram votos;
  - a loja chega só como hash.
- Limite de requisições do parceiro da casa: 1.200/min (os demais: 120).

### Contas
- **"Criar minha conta MercadoFlow" no Bipae** (`POST /accounts`):
  - a conta nasce no grátis, já vinculada;
  - o dono recebe o e-mail "Criar minha senha", válido por 7 dias;
  - o Bipae nunca vê a senha;
  - fica marcada com `markets.created_by_partner_id` e com a nota do aceite.
- Se o e-mail ou a empresa (raiz do CNPJ) já têm conta, nada é criado e a resposta traz o link de conexão.

### Desconto no plano para cliente Bipae
- **Percentual:** o super admin define em Parceiros → Bipae → "Desconto no plano".
- **Quando vale:** a loja (ou uma filial da rede) está vinculada e o Bipae diz que ela é cliente ativo (`PUT /markets/{id}/customer`).
- **Onde se aplica:** na contratação por Pix ou boleto e no valor mensal, só sobre o plano (os adicionais ficam fora).
  - A assinatura ativa é recalculada sozinha quando o vínculo, a situação de cliente, o percentual ou a marca "da casa" mudam.
  - A próxima fatura já vem com o valor novo.
- **Onde aparece:** na tela Assinatura do lojista e na descrição da fatura.
- **Cartão (Stripe):** o desconto **não** se aplica. Fica como pendência, porque exige cupom no Stripe.

### Confere dentro do Bipae
- Novo escopo da casa: `confere:use`.
- **O Bipae é a tela; o motor continua no MercadoFlow:**
  - termos e certificado A1 (enviado em base64, guardado cifrado aqui);
  - busca automática na Sefaz a cada hora, leitura pela chave e importação de XML;
  - saldo e compra de leituras por Pix;
  - conferência cega ou aberta.
- **Entrada pronta** (`ConfereEntryExport`):
  - itens já em unidade de venda (caixa → unidade pela nota) e custo por unidade de venda;
  - recebido × esperado, divergências, lote e validade, código do fornecedor e GTIN da caixa.
- **Avisos novos:**
  - `confere.document.received`: nota completa nova;
  - `confere.check.finished`: conferência concluída, com a entrada inteira.
  - Valem também quando a conferência é feita no Confere do próprio MercadoFlow.

### Validação
- 403 testes do backend passando (14 deles de regras do Bipae).
- Frontend passa na checagem de tipos.
- As consultas novas rodaram em produção em transação só leitura, com rollback.
- Não testado: o contexto Spring subindo com banco, e as telas no navegador.

## Pendências que dependem de você
1. **Página pública de termos de uso e privacidade do MercadoFlow.** Não existe hoje. A conta criada pelo Bipae registra o aceite feito no Bipae, mas falta a página para o link.
2. **Desconto no cartão (Stripe):** aplicar com cupom do Stripe ou manter só no Pix e no boleto.
3. **Percentual do desconto:** está em 0 até você definir no super admin.

## Para ligar em produção
1. Deploy do MercadoFlow (V95 roda sozinha).
2. Super admin → Parceiros:
   - cadastrar "Bipae" e clicar em **Sistema da casa**;
   - definir o **desconto no plano**;
   - guardar `client_id` e `client_secret` no `/root/bipae/.env` (`MERCADOFLOW_CLIENT_ID` e `MERCADOFLOW_CLIENT_SECRET`).
3. No `docker-compose.vps.yml` do Bipae, ligar o serviço `api` também à rede `mercadoflow-web_default` com o alias `bipae-api` (veja a instrução).
4. O Bipae registra o webhook: `PUT /api/v1/partner/webhook` com `http://bipae-api:3333/v1/integrations/mercadoflow/webhook`.

## Próximos passos (não implementados)
| Ideia | Por que | Esforço |
|---|---|---|
| **Plano conjunto Bipae + MercadoFlow** (cobrança única, cota de notas ilimitada para vendas do Bipae) | Hoje as vendas do Bipae contam na cota do plano do MercadoFlow como as do agente | Médio (billing) |
| **Entrar no MercadoFlow sem senha** a partir do Bipae (link assinado de uso único, só para o dono que aprovou) | Tira o último atrito do link "abrir no MercadoFlow" | Médio (segurança) |
| **Aviso `promotion.published`** quando um encarte é publicado | Hoje o Bipae consulta `/promotions` periodicamente | Pequeno |
| **Decidir dentro do Bipae** (aceitar ou recusar a compra sugerida) | Mais conveniente, mas tira o dono do MercadoFlow. Recomendo só depois de medir o uso do link | Médio |
| **Estoque do Bipae como fonte oficial** (`stock:write` contínuo por movimento) | Cobertura, ruptura e dinheiro parado em R$ reais | Já existe na API aberta; falta o Bipae mandar |
| **Cadastro da loja no Bipae cria a conta no MercadoFlow** (grátis) | Toda loja Bipae vira usuária do MercadoFlow no dia 1 | Pequeno, mas é decisão comercial |
