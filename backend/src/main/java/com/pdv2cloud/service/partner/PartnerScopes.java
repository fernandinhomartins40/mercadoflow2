package com.pdv2cloud.service.partner;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * O que a loja pode autorizar a um ERP. Quase tudo é o ERP mandando dados
 * para cá; o que sai é só a entrada de mercadoria pronta e o que o dono aprovou.
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

    /** Escopo → frase que o lojista lê na hora de autorizar. */
    public static final Map<String, String> LABELS;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(CATALOG_WRITE, "Enviar o cadastro de produtos e fornecedores");
        m.put(COSTS_WRITE, "Enviar o custo de compra dos produtos");
        m.put(PRICES_WRITE, "Enviar o preço de venda e as promoções");
        m.put(STOCK_WRITE, "Enviar o estoque");
        m.put(RECEIPTS_WRITE, "Enviar as notas de entrada lançadas no ERP");
        m.put(INBOUND_READ, "Receber as entradas prontas das notas do Confere (cadastro e conferência)");
        m.put(ORDERS_READ, "Receber os pedidos que você enviar ao fornecedor");
        m.put(PRICES_READ, "Receber os preços que você aprovar");
        LABELS = java.util.Collections.unmodifiableMap(m);
    }

    public static final List<String> ALL = List.copyOf(LABELS.keySet());

    private PartnerScopes() {
    }
}
