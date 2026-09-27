package com.pdv2cloud.service.storemap;

/**
 * Setores de um supermercado, na linguagem do dono.
 *
 * Cada produto vendido cai em um setor pelo NCM da nota (obrigatório em toda
 * NFC-e) ou, na falta dele, pela categoria do catálogo. É o que permite dizer
 * onde cada produto está sem o dono cadastrar produto nenhum: basta dizer em
 * qual móvel fica cada setor.
 *
 * {@code magnet}: setor de destino (o cliente vai até ele de propósito). Posto
 * no fundo, puxa o cliente pela loja inteira.
 * {@code cold}: precisa de móvel refrigerado.
 */
public enum StoreDepartment {
    HORTIFRUTI("Hortifruti", false, false),
    ACOUGUE("Açougue", true, true),
    FRIOS_LATICINIOS("Frios e laticínios", true, true),
    CONGELADOS("Congelados", false, true),
    PADARIA("Padaria", true, false),
    BEBIDAS("Bebidas", true, false),
    BEBIDAS_ALCOOLICAS("Cervejas e destilados", true, false),
    MERCEARIA("Mercearia", false, false),
    MATINAIS("Café e matinais", false, false),
    BISCOITOS_DOCES("Biscoitos e doces", false, false),
    LIMPEZA("Limpeza", false, false),
    HIGIENE("Higiene e beleza", false, false),
    PET("Pet", false, false),
    BAZAR("Bazar e utilidades", false, false),
    TABACARIA("Tabacaria", false, false),
    OUTROS("Outros", false, false);

    private final String label;
    private final boolean magnet;
    private final boolean cold;

    StoreDepartment(String label, boolean magnet, boolean cold) {
        this.label = label;
        this.magnet = magnet;
        this.cold = cold;
    }

    public String label() { return label; }
    public boolean magnet() { return magnet; }
    public boolean cold() { return cold; }
}
