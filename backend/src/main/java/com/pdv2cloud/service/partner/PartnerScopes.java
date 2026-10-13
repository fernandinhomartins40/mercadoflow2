package com.pdv2cloud.service.partner;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * O que a loja pode autorizar a um ERP. Quase tudo é o ERP mandando dados
 * para cá; o que sai é só a entrada de mercadoria pronta e o que o dono aprovou.
 *
 * Os escopos "da casa" ({@link #FIRST_PARTY}) só existem para o parceiro da
 * mesma empresa (Bipae): vendas direto do caixa, catálogo por GTIN, fila de
 * decisões, preços da região e encartes. Um ERP de terceiros nunca os recebe.
 */
public final class PartnerScopes {

    public static final String CATALOG_WRITE = "catalog:write";
    public static final String COSTS_WRITE = "costs:write";
    public static final String PRICES_WRITE = "prices:write";
    public static final String STOCK_WRITE = "stock:write";
    public static final String RECEIPTS_WRITE = "receipts:write";
    public static final String INBOUND_READ = "inbound:read";
    public static final String ORDERS_READ = "orders:read";
    public static final String PRICES_READ = "prices:read";

    // Da casa
    public static final String SALES_WRITE = "sales:write";
    public static final String CATALOG_READ = "catalog:read";
    public static final String INSIGHTS_READ = "insights:read";
    public static final String PROMOTIONS_READ = "promotions:read";
    public static final String CONFERE_USE = "confere:use";

    public static final Set<String> FIRST_PARTY = Set.of(SALES_WRITE, CATALOG_READ, INSIGHTS_READ, PROMOTIONS_READ, CONFERE_USE);

    /** Escopo → frase que o lojista lê na hora de autorizar. */
    public static final Map<String, String> LABELS;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(SALES_WRITE, "Enviar as vendas do caixa na hora (sem instalar o agente)");
        m.put(CATALOG_WRITE, "Enviar o cadastro de produtos e fornecedores");
        m.put(COSTS_WRITE, "Enviar o custo de compra dos produtos");
        m.put(PRICES_WRITE, "Enviar o preço de venda e as promoções");
        m.put(STOCK_WRITE, "Enviar o estoque");
        m.put(RECEIPTS_WRITE, "Enviar as notas de entrada lançadas no ERP");
        m.put(INBOUND_READ, "Receber as entradas prontas das notas do Confere (cadastro e conferência)");
        m.put(ORDERS_READ, "Receber os pedidos que você enviar ao fornecedor");
        m.put(PRICES_READ, "Receber os preços que você aprovar");
        m.put(CATALOG_READ, "Consultar o catálogo pelo código de barras (nome, marca, categoria e foto)");
        m.put(INSIGHTS_READ, "Mostrar as decisões do Tino e os preços da região dentro do sistema");
        m.put(PROMOTIONS_READ, "Receber os encartes publicados para aplicar a oferta no caixa");
        m.put(CONFERE_USE, "Usar o Confere dentro do sistema: certificado, notas de entrada da Sefaz e conferência");
        LABELS = java.util.Collections.unmodifiableMap(m);
    }

    public static final List<String> ALL = List.copyOf(LABELS.keySet());

    /** O que este parceiro pode receber: os da casa só para o parceiro da casa. */
    public static Map<String, String> labelsFor(boolean firstParty) {
        if (firstParty) return LABELS;
        Map<String, String> m = new LinkedHashMap<>(LABELS);
        m.keySet().removeAll(FIRST_PARTY);
        return m;
    }

    public static boolean allowed(String scope, boolean firstParty) {
        return LABELS.containsKey(scope) && (firstParty || !FIRST_PARTY.contains(scope));
    }

    private PartnerScopes() {
    }
}
