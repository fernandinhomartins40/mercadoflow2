package com.pdv2cloud.security;

/**
 * Coletor de catálogo (scripts/catalog) autenticado pelo token de serviço.
 * Só tem o papel CATALOG_SERVICE e só vale nas rotas de
 * {@link CatalogServiceTokenFilter#isCatalogServiceRoute}.
 */
public record CatalogServicePrincipal(String name) {

    public static final CatalogServicePrincipal COLLECTOR = new CatalogServicePrincipal("catalog-service");

    @Override
    public String toString() {
        return name;
    }
}
