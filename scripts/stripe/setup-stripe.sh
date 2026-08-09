#!/usr/bin/env bash
# Cria os produtos e precos do Mercado Flow na sua conta Stripe.
#
# Uso:
#   ./setup-stripe.sh sk_test_SUA_CHAVE
#
# Rode primeiro com a chave de TESTE (sk_test_...), valide o fluxo ponta a
# ponta, e so entao repita com a de producao (sk_live_...). O script e
# idempotente: se os produtos ja existirem com o mesmo lookup_key, ele reaproveita
# em vez de duplicar.
#
# Ao final, imprime as variaveis de ambiente para colar no .env do servidor.

set -euo pipefail

API_KEY="${1:-}"
if [[ -z "$API_KEY" ]]; then
    echo "Uso: $0 <STRIPE_SECRET_KEY>" >&2
    echo "Pegue em: Stripe > Developers > API keys > Secret key" >&2
    exit 1
fi

if [[ "$API_KEY" == sk_live_* ]]; then
    echo "ATENCAO: voce esta usando a chave de PRODUCAO."
    echo "Isso cria produtos reais e cobrancas reais."
    read -r -p "Digite 'confirmo' para continuar: " confirm
    [[ "$confirm" == "confirmo" ]] || { echo "Cancelado."; exit 1; }
fi

STRIPE_API="https://api.stripe.com/v1"

# Busca um preco existente pelo lookup_key, que e o identificador estavel que
# escolhemos — assim rodar o script duas vezes nao cria precos duplicados.
find_price_by_lookup_key() {
    local lookup_key="$1"
    curl -s -G "$STRIPE_API/prices" \
        -u "$API_KEY:" \
        -d "lookup_keys[]=$lookup_key" \
        -d "limit=1" \
        | grep -o '"id": *"price_[^"]*"' \
        | head -1 \
        | sed 's/.*"\(price_[^"]*\)"/\1/'
}

create_plan() {
    local name="$1"
    local description="$2"
    local amount_cents="$3"
    local lookup_key="$4"

    local existing
    existing="$(find_price_by_lookup_key "$lookup_key")"
    if [[ -n "$existing" ]]; then
        echo "$existing"
        return
    fi

    local product_id
    product_id="$(curl -s "$STRIPE_API/products" \
        -u "$API_KEY:" \
        -d "name=$name" \
        -d "description=$description" \
        | grep -o '"id": *"prod_[^"]*"' \
        | head -1 \
        | sed 's/.*"\(prod_[^"]*\)"/\1/')"

    if [[ -z "$product_id" ]]; then
        echo "ERRO: falha ao criar o produto '$name'. Verifique a chave." >&2
        exit 1
    fi

    curl -s "$STRIPE_API/prices" \
        -u "$API_KEY:" \
        -d "product=$product_id" \
        -d "unit_amount=$amount_cents" \
        -d "currency=brl" \
        -d "recurring[interval]=month" \
        -d "lookup_key=$lookup_key" \
        | grep -o '"id": *"price_[^"]*"' \
        | head -1 \
        | sed 's/.*"\(price_[^"]*\)"/\1/'
}

echo "Criando produtos e precos..."

PRICE_ESSENCIAL="$(create_plan \
    "Mercado Flow Essencial" \
    "15.000 notas/mes, 1 loja com ate 3 PDVs, 5 usuarios" \
    19700 \
    "mercadoflow_essencial_mensal")"

PRICE_PROFISSIONAL="$(create_plan \
    "Mercado Flow Profissional" \
    "50.000 notas/mes, ate 3 lojas, 4 PDVs por loja (10 no total), 15 usuarios" \
    39700 \
    "mercadoflow_profissional_mensal")"

echo
echo "============================================================"
echo "Pronto. Adicione ao .env do servidor:"
echo "============================================================"
echo "STRIPE_ENABLED=true"
echo "STRIPE_SECRET_KEY=$API_KEY"
echo "STRIPE_PRICE_ESSENCIAL=$PRICE_ESSENCIAL"
echo "STRIPE_PRICE_PROFISSIONAL=$PRICE_PROFISSIONAL"
echo "STRIPE_WEBHOOK_SECRET=<obtido ao cadastrar o webhook, veja o README>"
echo "============================================================"
echo
echo "Proximo passo: cadastre o webhook em"
echo "  https://dashboard.stripe.com/webhooks"
echo "  URL: https://mercadoflow.com/api/v1/stripe/webhook"
echo "  Eventos: customer.subscription.created, customer.subscription.updated,"
echo "           customer.subscription.deleted, invoice.paid, invoice.payment_failed"
