package com.pdv2cloud.service;

import java.nio.file.Path;

/** Acesso de teste ao helper de pacote. */
public final class CatalogImageStorageTestAccess {
    private CatalogImageStorageTestAccess() {
    }

    public static Path webpSibling(Path p) {
        return CatalogImageStorageService.webpSibling(p);
    }
}
