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
        assertTrue(PartnerScopes.LABELS.keySet().containsAll(PartnerScopes.FIRST_PARTY));
    }

    @Test
    void escoposDaCasaNuncaVaoParaTerceiros() {
        for (String s : PartnerScopes.FIRST_PARTY) {
            assertFalse(PartnerScopes.allowed(s, false), s);
            assertTrue(PartnerScopes.allowed(s, true), s);
            assertFalse(PartnerScopes.labelsFor(false).containsKey(s), s);
        }
        assertTrue(PartnerScopes.allowed(PartnerScopes.STOCK_WRITE, false));
        assertFalse(PartnerScopes.allowed("qualquer:coisa", true));
        assertEquals(PartnerScopes.LABELS.size(), PartnerScopes.labelsFor(true).size());
    }

    @Test
    void vendaPrecisaDaChaveDeAcessoCompleta() {
        assertTrue(FirstPartyService.validAccessKey("41261012345678000199650010000012341000012345"));
        assertFalse(FirstPartyService.validAccessKey("4126101234567800019965001000001234100001234"));
        assertFalse(FirstPartyService.validAccessKey("4126101234567800019965001000001234100001234X"));
        assertFalse(FirstPartyService.validAccessKey(null));
    }

    @Test
    void decisaoLevaSoOsNumerosParaAgir() {
        java.util.Map<String, Object> s = FirstPartyService.suggestion("COMPRAR",
            "{\"quantidade\": 24, \"valorEstimado\": 120.5, \"produtoId\": \"x\", \"evidenciaInterna\": 1}");
        assertEquals(24, s.get("quantidade"));
        assertFalse(s.containsKey("produtoId"));
        assertFalse(s.containsKey("evidenciaInterna"));
        assertTrue(FirstPartyService.suggestion("INVESTIGAR", "{\"a\":1}").isEmpty());
        assertTrue(FirstPartyService.suggestion("COMPRAR", "não é json").isEmpty());
    }

    @Test
    void descontoDeClienteDoParceiro() {
        PartnerDiscount.Discount d = new PartnerDiscount.Discount(java.util.UUID.randomUUID(), "Bipae", 20);
        assertEquals(15920, PartnerDiscount.apply(19900, d));
        assertEquals(19900, PartnerDiscount.apply(19900, null));
        assertEquals(0, PartnerDiscount.apply(19900, new PartnerDiscount.Discount(null, "Bipae", 100)));
        assertEquals(0, PartnerDiscount.apply(0, d));
        // 15% de 9.990 = 1.498,5 → arredonda para 1.499
        assertEquals(8491, PartnerDiscount.apply(9990, new PartnerDiscount.Discount(null, "Bipae", 15)));
    }

    @Test
    void confereEhDaCasa() {
        assertTrue(PartnerScopes.FIRST_PARTY.contains(PartnerScopes.CONFERE_USE));
        assertFalse(PartnerScopes.allowed(PartnerScopes.CONFERE_USE, false));
    }

    @Test
    void unidadeDoCadastro() {
        assertEquals("UN", PartnerCatalogService.unit("und"));
        assertEquals("UN", PartnerCatalogService.unit("Unidade"));
        assertEquals("KG", PartnerCatalogService.unit("kg"));
        assertEquals("L", PartnerCatalogService.unit("Litro"));
        assertEquals("CX", PartnerCatalogService.unit("CX"));
        assertEquals(null, PartnerCatalogService.unit(null));
    }

    @Test
    void conteudoPeloNome() {
        assertEquals(java.util.Map.of("quantity", "500", "unit", "G", "packs", 1), PartnerCatalogService.content("Pão Vital Preto 500g"));
        assertEquals(java.util.Map.of("quantity", "1.5", "unit", "KG", "packs", 1), PartnerCatalogService.content("Molho Cheddar Polenghi Bisnaga 1,5kg"));
        assertEquals(java.util.Map.of("quantity", "350", "unit", "ML", "packs", 12), PartnerCatalogService.content("Cerveja Lata 12 x 350ml"));
        assertEquals(java.util.Map.of("quantity", "1", "unit", "L", "packs", 1), PartnerCatalogService.content("Leite Integral 1L Caixa"));
        assertEquals(null, PartnerCatalogService.content("Tigela Amarela"));
    }

    @Test
    void buscaSemAcento() {
        assertEquals(java.util.List.of("%acucar%", "%uniao%"), PartnerCatalogService.words("Açúcar  União"));
        assertEquals(java.util.List.of("%leite%", "%1,5%"), PartnerCatalogService.words("Leite 1,5"));
    }

    @Test
    void retornoDaConexao() {
        assertTrue(FirstPartyService.validReturnUrl("https://www.bipae.com.br/integracoes/mercadoflow"));
        assertTrue(FirstPartyService.validReturnUrl("http://localhost:5173/volta"));
        assertFalse(FirstPartyService.validReturnUrl("http://bipae.com.br/volta"));
        assertFalse(FirstPartyService.validReturnUrl("javascript:alert(1)"));
        java.util.UUID m = java.util.UUID.fromString("00000000-0000-0000-0000-000000000001");
        assertEquals("https://b.com/x?mf_status=ok&mf_market=" + m, FirstPartyService.returnUrl("https://b.com/x", "ok", m));
        assertEquals("https://b.com/x?a=1&mf_status=recusado", FirstPartyService.returnUrl("https://b.com/x?a=1", "recusado", null));
        assertEquals(null, FirstPartyService.returnUrl(null, "ok", m));
    }
}
