package com.pdv2cloud.service.localprice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class LocalPriceRulesTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void geohashDeCuritiba() {
        // Curitiba (centro) cai na célula 6gkz, a mesma que o portal usa
        assertTrue(Geohash.encode(-25.4195, -49.2646, 7).startsWith("6gkz"));
        assertEquals(7, Geohash.encode(-25.4195, -49.2646, 7).length());
    }

    @Test
    void mesmoProdutoPeloTamanhoEPeloFardo() {
        assertTrue(TextMatch.sameProduct("Refrigerante Coca-Cola 2L", "REFRI COCA COLA PET 2L"));
        assertTrue(TextMatch.sameProduct("Leite Condensado Moça 395g", "LEITE COND MOCA 395G"));
        assertFalse(TextMatch.sameProduct("Café 3 Corações Tradicional 500g", "CAFE 3 CORACOES SOLUVEL 40G UN"));
        assertFalse(TextMatch.sameProduct("Refrigerante Coca-Cola 2L", "COCA COLA ORIGINAL PET 2L 6 FL"));
        assertFalse(TextMatch.sameProduct("Refrigerante Coca-Cola 2L", "FARDO COCA COLA 2L"));
        assertTrue(TextMatch.sameProduct("Banana prata kg", "BANANA PRATA"));
        assertEquals(2000.0, TextMatch.quantity("COCA 2L"));
        assertEquals(1500.0, TextMatch.quantity("SUCO 1,5 LT"));
        assertNull(TextMatch.quantity("BANANA PRATA"));
    }

    @Test
    void barEPostoNaoEntram() {
        assertTrue(TextMatch.notGrocery("BAR MAKIOLKA"));
        assertTrue(TextMatch.notGrocery("PETROBRAS - POSTO AEROPORTO"));
        assertTrue(TextMatch.notGrocery("PIZZA REI"));
        assertFalse(TextMatch.notGrocery("CONDOR SUPER CENTER"));
        assertFalse(TextMatch.notGrocery("SUPERMERCADO BARBOSA"));
    }

    private static JsonNode offer(String store, String desc, String price, int daysAgo, String km) throws Exception {
        String when = LocalDate.now().minusDays(daysAgo) + "T12:00:00.000Z";
        return JSON.readTree("{\"desc\":\"" + desc + "\",\"valor\":\"" + price + "\",\"datahora\":\"" + when + "\",\"distkm\":\"" + km
            + "\",\"estabelecimento\":{\"codigo\":\"" + store + "\",\"nm_fan\":\"" + store + "\",\"nm_emp\":\"" + store + " LTDA\"}}");
    }

    @Test
    void resumoDescartaRuidoEUsaUmPrecoPorLoja() throws Exception {
        List<JsonNode> raw = new ArrayList<>();
        raw.add(offer("MERCADO A", "COCA COLA 2L", "9.99", 1, "1.2"));
        raw.add(offer("MERCADO A", "COCA COLA 2L", "10.49", 5, "1.2"));    // mais antiga da mesma loja
        raw.add(offer("MERCADO B", "COCA COLA PET 2L", "10.99", 2, "2.0"));
        raw.add(offer("MERCADO C", "COCA COLA 2L", "11.49", 3, "3.5"));
        raw.add(offer("MERCADO D", "REFRI COCA 2L", "10.29", 2, "4.0"));
        raw.add(offer("MERCADO E", "COCA COLA 2L", "1.00", 2, "5.0"));     // absurdo
        raw.add(offer("BAR DO ZE", "COCA COLA 2L", "14.00", 1, "0.5"));    // bar
        raw.add(offer("MERCADO F", "COCA COLA 2L 6 FL", "54.00", 1, "2.5")); // fardo
        raw.add(offer("MERCADO G", "COCA COLA 2L", "9.50", 40, "2.5"));    // velha demais
        LocalPriceService.Snapshot s = LocalPriceService.summarize(raw, "Refrigerante Coca-Cola 2L", 10);
        assertEquals("OK", s.status());
        assertEquals(4, s.stores());
        assertEquals(new BigDecimal("10.64"), s.median());
        assertEquals(new BigDecimal("9.99"), s.cheapest().price());
        assertEquals("MERCADO A", s.cheapest().store());
    }

    @Test
    void poucasLojasNaoOpinam() throws Exception {
        List<JsonNode> raw = List.of(offer("MERCADO A", "COCA COLA 2L", "9.99", 1, "1"), offer("MERCADO B", "COCA COLA 2L", "10.99", 1, "2"));
        assertEquals("POUCAS_LOJAS", LocalPriceService.summarize(raw, "Coca-Cola 2L", 10).status());
        assertEquals("SEM_DADOS", LocalPriceService.summarize(List.of(), "Coca-Cola 2L", 10).status());
    }

    @Test
    void gtinValido() {
        assertTrue(LocalPriceService.validGtin("7894900027013"));
        assertFalse(LocalPriceService.validGtin("7890000000001"));
        assertFalse(LocalPriceService.validGtin("0000000000000"));
    }
}
