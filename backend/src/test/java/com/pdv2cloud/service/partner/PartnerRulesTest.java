package com.pdv2cloud.service.partner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class PartnerRulesTest {

    @Test
    void gtinComDigitoVerificador() {
        assertTrue(PartnerIngestService.validGtin("7891000100103"));
        assertTrue(PartnerIngestService.validGtin("17891000100100"));
        assertTrue(PartnerIngestService.validGtin("96385074"));
        assertFalse(PartnerIngestService.validGtin("7891000100104"));
        assertFalse(PartnerIngestService.validGtin("123"));
        assertFalse(PartnerIngestService.validGtin(null));
    }

    @Test
    void mesmoGtinComESemZeros() {
        assertEquals(java.util.List.of("7891000100103", "07891000100103"), PartnerIngestService.gtinVariants("07891000100103"));
        assertTrue(PartnerIngestService.gtinVariants("96385074").contains("0000096385074"));
    }

    @Test
    void caixaParaUnidadePelaNota() {
        assertEquals(0, new BigDecimal("12").compareTo(PartnerOutboundService.unitsPerPack(new BigDecimal("2"), new BigDecimal("24"))));
        assertEquals(BigDecimal.ONE, PartnerOutboundService.unitsPerPack(new BigDecimal("2"), null));
        assertEquals(BigDecimal.ONE, PartnerOutboundService.unitsPerPack(BigDecimal.ZERO, new BigDecimal("24")));
    }

    @Test
    void assinaturaDoAviso() {
        // HMAC-SHA256("segredo", "{}") conferido fora (Python hmac)
        assertEquals("fb628fffaa33657454b42caedf691bd6a3ecb2b2f1e32a33d1f916632fa09b20", PartnerWebhookService.sign("segredo", "{}"));
        assertEquals(PartnerWebhookService.sign("segredo", "{\"a\":1}"), PartnerWebhookService.sign("segredo", "{\"a\":1}"));
        assertFalse(PartnerWebhookService.sign("segredo", "{}").equals(PartnerWebhookService.sign("outro", "{}")));
    }

    @Test
    void escoposTemFraseParaOLojista() {
        assertEquals(PartnerScopes.ALL.size(), PartnerScopes.LABELS.size());
        assertTrue(PartnerScopes.ALL.contains(PartnerScopes.INBOUND_READ));
    }
}
