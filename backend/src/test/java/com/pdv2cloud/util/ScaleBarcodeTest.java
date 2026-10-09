package com.pdv2cloud.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ScaleBarcodeTest {

    @Test
    void etiquetaDeBalancaEReconhecida() {
        assertTrue(ProductCatalogUtils.isScaleBarcode("2335200054903"));
        assertTrue(ProductCatalogUtils.isScaleBarcode("02335200054903"));
        assertTrue(ProductCatalogUtils.isScaleBarcode("212345678905"));
    }

    @Test
    void codigoDeBarrasComumNaoE() {
        assertFalse(ProductCatalogUtils.isScaleBarcode("7891000100103"));
        assertFalse(ProductCatalogUtils.isScaleBarcode("07891910000197"));
        assertFalse(ProductCatalogUtils.isScaleBarcode("78912345"));
        assertFalse(ProductCatalogUtils.isScaleBarcode(null));
    }

    @Test
    void mesmoItemComPesosDiferentesTemOMesmoCodigo() {
        // 2 + item 001234 + valor (12,50 / 7,99) + dígito verificador
        assertEquals("2001234", ProductCatalogUtils.scaleItemCode("2001234012503"));
        assertEquals("2001234", ProductCatalogUtils.scaleItemCode("2001234007991"));
        assertEquals("2001234", ProductCatalogUtils.scaleItemCode("02001234012503"));
    }
}
