package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * A fronteira por onde dados da loja saem para um provedor externo.
 *
 * O teste central aqui é o da allowlist: ele existe para que um detector futuro
 * que coloque CPF ou chave de NFe dentro de {@code evidence} não consiga
 * vazá-los, ainda que ninguém se lembre de proibir aquele campo.
 */
class AiContextBuilderTest {

    private final AiContextBuilder builder = new AiContextBuilder();

    /**
     * A defesa é por allowlist. Um campo desconhecido — inclusive um que
     * carregue dado pessoal — é descartado por não estar na lista, não por
     * estar numa lista de proibidos.
     */
    @Test
    void campoForaDaAllowlistNaoAtravessa() {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("giroDiario", new BigDecimal("3.5"));
        evidence.put("cpfCliente", "12345678901");
        evidence.put("chaveNfe", "35240712345678000199650010000012341000012345");
        evidence.put("cnpjDestinatario", "12345678000199");

        Map<String, Object> filtrado = builder.filterEvidence(evidence);

        assertTrue(filtrado.containsKey("giroDiario"));
        assertFalse(filtrado.containsKey("cpfCliente"));
        assertFalse(filtrado.containsKey("chaveNfe"));
        assertFalse(filtrado.containsKey("cnpjDestinatario"));
        assertEquals(1, filtrado.size());
    }

    @Test
    void promptNaoContemDadoPessoalMesmoQuandoAEvidenciaContem() {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("coberturaDias", new BigDecimal("2.0"));
        evidence.put("cpfCliente", "98765432100");

        String prompt = builder.forOpportunity(opportunity(evidence), List.of()).prompt();

        assertFalse(prompt.contains("98765432100"), "o CPF não pode chegar ao modelo");
        assertTrue(prompt.contains("2"), "a métrica permitida deve chegar");
    }

    /**
     * O cache é chaveado pelo hash do contexto. Sem ordenação estável das
     * chaves, a mesma evidência geraria hashes diferentes conforme a ordem de
     * iteração do mapa, e o cache nunca acertaria — fazendo o cliente pagar
     * token de novo por um texto que já existia.
     */
    @Test
    void hashEEstavelIndependenteDaOrdemDasChaves() {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("giroDiario", new BigDecimal("3.5"));
        a.put("coberturaDias", new BigDecimal("2.0"));

        Map<String, Object> b = new LinkedHashMap<>();
        b.put("coberturaDias", new BigDecimal("2.0"));
        b.put("giroDiario", new BigDecimal("3.5"));

        assertEquals(
            builder.forOpportunity(opportunity(a), List.of()).hash(),
            builder.forOpportunity(opportunity(b), List.of()).hash()
        );
    }

    /** Número diferente = hash diferente: a interpretação precisa ser refeita. */
    @Test
    void hashMudaQuandoUmNumeroMuda() {
        Map<String, Object> a = Map.of("giroDiario", new BigDecimal("3.5"));
        Map<String, Object> b = Map.of("giroDiario", new BigDecimal("4.1"));

        assertNotEquals(
            builder.forOpportunity(opportunity(a), List.of()).hash(),
            builder.forOpportunity(opportunity(b), List.of()).hash()
        );
    }

    /**
     * Nome de produto atravessa de propósito: é dado de catálogo, e sem ele a
     * interpretação seria inútil ("o produto está parado" não ajuda ninguém).
     */
    @Test
    void nomeDoProdutoAtravessa() {
        Opportunity o = opportunity(Map.of("giroDiario", new BigDecimal("0.1")));
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName("Arroz Tipo 1 5kg");
        o.setProduct(p);

        assertTrue(builder.forOpportunity(o, List.of()).prompt().contains("Arroz Tipo 1 5kg"));
    }

    @Test
    void evidenciaNulaNaoQuebra() {
        assertTrue(builder.filterEvidence(null).isEmpty());
        assertFalse(builder.forOpportunity(opportunity(null), List.of()).prompt().isBlank());
    }

    /**
     * Persistência entra no contexto: algo que reaparece há semanas merece tom
     * diferente do que apareceu ontem.
     */
    @Test
    void persistenciaDaSituacaoEntraNoContexto() {
        Opportunity o = opportunity(Map.of("giroDiario", new BigDecimal("0.1")));
        o.setDetectionCount(12);

        assertTrue(builder.forOpportunity(o, List.of()).prompt().contains("12 vezes"));
    }

    private Opportunity opportunity(Map<String, Object> evidence) {
        Opportunity o = new Opportunity();
        o.setId(UUID.randomUUID());
        o.setType("CAPITAL_PARADO");
        o.setSource("CAPITAL");
        o.setTitle("Liquidar: produto de teste");
        o.setDescription("Capital parado na prateleira.");
        o.setEvidence(evidence);
        o.setFirstDetectedAt(LocalDateTime.now().minusDays(30));
        o.setLastDetectedAt(LocalDateTime.now());
        o.setDetectionCount(1);
        return o;
    }
}
