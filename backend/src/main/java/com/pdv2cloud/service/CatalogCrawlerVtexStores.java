package com.pdv2cloud.service;

import java.util.List;
import java.util.Optional;

/**
 * Lojas VTEX do crawler que entram so por configuracao, sem coletor proprio.
 * A mesma lista existe em scripts/catalog/vtex_sources.json (lida pelo
 * dispatcher): loja nova entra nos dois lugares.
 */
public final class CatalogCrawlerVtexStores {

    public record Store(String name, String provider, boolean pharmacy, String siteHost, String account) {

        /** O dominio publico de varias lojas devolve 503 no CDN para chamadas de API. */
        public String apiBase() {
            return "https://" + account + ".vtexcommercestable.com.br";
        }

        public String categoryTreeUrl() {
            return apiBase() + "/api/catalog_system/pub/category/tree/20";
        }

        public String sitemapUrl() {
            return apiBase() + "/sitemap.xml";
        }
    }

    public static final List<Store> STORES = List.of(
        new Store("Drogarias Pacheco", "DROGARIASPACHECO_WEB_BR", true, "www.drogariaspacheco.com.br", "drogariaspacheco"),
        new Store("Farmacias App", "FARMACIASAPP_WEB_BR", true, "www.farmaciasapp.com.br", "lojafarmaciasapp"),
        new Store("Drogaria Venancio", "VENANCIO_WEB_BR", true, "www.drogariavenancio.com.br", "drogariavenancio"),
        new Store("Farmacia Indiana", "FARMACIAINDIANA_WEB_BR", true, "www.farmaciaindiana.com.br", "farmaciaindiana"),
        new Store("Drogarias Tamoio", "TAMOIO_WEB_BR", true, "www.drogariastamoio.com.br", "dmvfarma"),
        new Store("Droga Leste", "DROGALESTE_WEB_BR", true, "www.drogaleste.com.br", "drogaleste"),
        new Store("Drogaria Moderna", "DROGARIAMODERNA_WEB_BR", true, "www.drogariamoderna.com.br", "drogariamoderna"),
        new Store("Drogal", "DROGAL_WEB_BR", true, "www.drogal.com.br", "drogal"),
        new Store("Farmacias Sao Joao", "SAOJOAOFARMACIAS_WEB_BR", true, "www.saojoaofarmacias.com.br", "sjdigital"),
        new Store("Santa Lucia Drogarias", "SANTALUCIA_WEB_BR", true, "www.santaluciadrogarias.com.br", "santaluciadrogaria"),
        new Store("Drogaria Catarinense", "DROGARIACATARINENSE_WEB_BR", true, "www.drogariacatarinense.com.br", "drogariacatarinense"),
        new Store("Preco Popular", "PRECOPOPULAR_WEB_BR", true, "www.precopopular.com.br", "precopopular"),
        new Store("Drogaria Globo", "DROGARIAGLOBO_WEB_BR", true, "www.drogariaglobo.com.br", "drogariaglobo"),
        new Store("FarmaConde", "FARMACONDE_WEB_BR", true, "www.farmaconde.com.br", "farmaconde"),
        new Store("GBarbosa", "GBARBOSA_WEB_BR", false, "www.gbarbosa.com.br", "gbarbosa"),
        new Store("Covabra", "COVABRA_WEB_BR", false, "www.covabra.com.br", "covabra"),
        new Store("Prezunic", "PREZUNIC_WEB_BR", false, "www.prezunic.com.br", "prezunic"),
        new Store("Bretas", "BRETAS_WEB_BR", false, "www.bretas.com.br", "bretas"),
        new Store("Zona Sul", "ZONASUL_WEB_BR", false, "www.zonasul.com.br", "zonasul"),
        new Store("Carone", "CARONE_WEB_BR", false, "www.carone.com.br", "tezegw"),
        new Store("Sam's Club", "SAMSCLUB_WEB_BR", false, "www.samsclub.com.br", "samsclub"),
        new Store("Mambo", "MAMBO_WEB_BR", false, "www.mambo.com.br", "mambodelivery"),
        new Store("Savegnago", "SAVEGNAGO_WEB_BR", false, "www.savegnago.com.br", "savegnagoio"),
        new Store("Zaffari", "ZAFFARI_WEB_BR", false, "www.zaffari.com.br", "zaffari"),
        new Store("Rissul", "RISSUL_WEB_BR", false, "www.rissul.com.br", "superrissul"),
        new Store("Mercantil Atacado", "MERCANTILATACADO_WEB_BR", false, "www.mercantilatacado.com.br", "mercantilatacado"),
        new Store("Hortifruti", "HORTIFRUTI_WEB_BR", false, "www.hortifruti.com.br", "hortifrutibr"),
        new Store("Apoio Entrega", "APOIOENTREGA_WEB_BR", false, "www.apoioentrega.com", "apoioentrega"),
        new Store("Hiperideal", "HIPERIDEAL_WEB_BR", false, "www.hiperideal.com.br", "hiperideal"),
        new Store("Coop", "COOP_WEB_BR", false, "www.coopsupermercado.com.br", "coopsp"),
        new Store("Oba Hortifruti", "OBAHORTIFRUTI_WEB_BR", false, "www.obahortifruti.com.br", "obahortifruti")
    );

    private CatalogCrawlerVtexStores() {
    }

    public static Optional<Store> find(String provider) {
        return STORES.stream().filter(store -> store.provider().equals(provider)).findFirst();
    }
}
