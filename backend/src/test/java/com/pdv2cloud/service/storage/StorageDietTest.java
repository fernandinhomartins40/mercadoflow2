package com.pdv2cloud.service.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.pdv2cloud.service.CatalogImageStorageTestAccess;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class StorageDietTest {

    @Test
    void fotoJpgTemIrmaWebp() {
        assertEquals(Path.of("img", "products", "789.webp"), CatalogImageStorageTestAccess.webpSibling(Path.of("img", "products", "789.jpg")));
        assertEquals(Path.of("789.webp"), CatalogImageStorageTestAccess.webpSibling(Path.of("789.PNG")));
        assertNull(CatalogImageStorageTestAccess.webpSibling(Path.of("789.webp")));
        assertNull(CatalogImageStorageTestAccess.webpSibling(Path.of("semextensao")));
    }
}
