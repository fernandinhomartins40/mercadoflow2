# Configurar o Stripe — passo a passo

Guia completo para ligar a cobrança de assinaturas. São ~20 minutos no modo de
teste. **Faça tudo em modo de teste primeiro**; só depois repita em produção.

O toggle **Test mode** fica no canto superior direito do painel do Stripe.
Confira-o antes de cada passo: as chaves, produtos e webhooks de teste e de
produção são conjuntos completamente separados.

---

## 1. Criar os produtos e preços

### Opção A — pelo script (mais rápido)

```bash
cd scripts/stripe
chmod +x setup-stripe.sh
./setup-stripe.sh sk_test_SUA_CHAVE
```

A chave está em **Developers → API keys → Secret key**. O script cria os dois
produtos, imprime os `price_...` e é seguro de rodar mais de uma vez.

### Opção B — pelo painel

**Product catalog → Add product**, uma vez para cada plano:

| Campo | Essencial | Profissional |
|---|---|---|
| Name | `Mercado Flow Essencial` | `Mercado Flow Profissional` |
| Amount | `197,00` | `397,00` |
| Currency | BRL | BRL |
| Billing period | Monthly | Monthly |

Depois de salvar, abra o produto e copie o **API ID do preço** (começa com
`price_`, não `prod_`). É o `price_` que vai no `.env`.

---

## 2. Cadastrar o webhook

É o que faz o plano subir sozinho quando o cliente paga. Sem isso, o pagamento
acontece mas a conta continua no gratuito.

1. **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://mercadoflow.com/api/v1/stripe/webhook`
3. Em **Select events**, marque exatamente estes cinco:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Salve e clique em **Reveal** no *Signing secret*. Copie o valor `whsec_...`.

Esse segredo é o que prova que o webhook veio mesmo do Stripe — sem ele,
qualquer um que descobrisse a URL poderia forjar um "pagamento aprovado".

---

## 3. Ativar o Customer Portal

É a tela onde o cliente troca cartão, muda de plano e cancela sozinho.

1. **Settings → Billing → Customer portal**
2. Ative **Customers can update their payment methods**
3. Ative **Customers can cancel subscriptions**
4. Ative **Customers can switch plans** e adicione os dois produtos criados
5. Salve

---

## 4. Configurar o servidor

No `.env` da VPS (ou nos secrets do deploy):

```bash
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ESSENCIAL=price_...
STRIPE_PRICE_PROFISSIONAL=price_...
```

Reinicie o backend. Sem `STRIPE_ENABLED=true` a integração fica desligada e a
aplicação sobe normalmente — o botão vira "Falar com o comercial".

---

## 5. Testar de ponta a ponta

1. Entre na aplicação com uma conta no plano gratuito
2. Vá em **Planos → Assinar** no Essencial
3. No Checkout, use o cartão de teste:
   - Número `4242 4242 4242 4242`
   - Validade: qualquer data futura · CVC: qualquer 3 dígitos
4. Após pagar, você volta para a aplicação
5. **Confirme que o plano virou Essencial** — é o que prova que o webhook chegou

Se o plano não mudar, veja **Developers → Webhooks → seu endpoint**: a lista
mostra cada tentativa e a resposta do servidor.

Outros cartões úteis:

| Cenário | Número |
|---|---|
| Pagamento recusado | `4000 0000 0000 0002` |
| Exige autenticação 3DS | `4000 0025 0000 3155` |

---

## 6. Ir para produção

1. Ative a conta no Stripe: **Settings → Business settings** — dados da empresa
   e conta bancária. Sem isso o dinheiro não é repassado. Só você pode fazer.
2. Troque para **Test mode desligado** e repita os passos 1, 2 e 3 — produtos e
   webhooks de teste **não** existem em produção.
3. Atualize o `.env` com as chaves `sk_live_...` e o novo `whsec_...`.
4. Faça uma compra real de teste, com cartão próprio, e depois estorne pelo
   painel.

---

## Como o sistema se comporta

| Evento no Stripe | Efeito na aplicação |
|---|---|
| Assinatura criada/ativa | Plano sobe, status `ACTIVE` |
| Falha no pagamento | Status `PAST_DUE`, **acesso mantido** |
| Assinatura cancelada | Volta para o gratuito, dados preservados |
| Plano trocado no portal | Plano é atualizado conforme o novo preço |

Falha de pagamento não corta o acesso de imediato porque o Stripe segue tentando
cobrar por alguns dias, e a maioria dos casos se resolve sozinha — cortar na
primeira falha puniria o cliente por um problema temporário de cartão.

---

## Problemas comuns

**O plano não sobe após o pagamento.** Quase sempre é o webhook. Cheque em
Developers → Webhooks se as entregas estão retornando 200. Se der 400, o
`STRIPE_WEBHOOK_SECRET` no servidor não bate com o do endpoint.

**"Pagamento online ainda não está configurado".** Falta `STRIPE_ENABLED=true`
ou a `STRIPE_SECRET_KEY` no `.env`, ou o backend não foi reiniciado.

**"Este plano não está disponível para contratação online".** Falta o
`STRIPE_PRICE_...` daquele plano. O plano Rede é sob medida por design e nunca
aparece para contratação direta.
