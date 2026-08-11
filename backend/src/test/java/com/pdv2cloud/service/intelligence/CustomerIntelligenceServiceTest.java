package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * Garantias de LGPD do hash de cliente.
 *
 * Estes testes existem porque as propriedades verificadas aqui não são detalhes
 * de implementação: são o que torna a camada de cliente aceitável do ponto de
 * vista de proteção de dados. Se algum deles quebrar, a feature deixou de ser
 * pseudonimizada e não pode ir para produção.
 */
class CustomerIntelligenceServiceTest {

    private final CustomerIntelligenceService service =
        new CustomerIntelligenceService(mock(NamedParameterJdbcTemplate.class));

    private static final String SALT_LOJA_A = "a".repeat(64);
    private static final String SALT_LOJA_B = "b".repeat(64);
    private static final String CPF = "123.456.789-00";

    @Test
    @DisplayName("o hash é determinístico dentro da mesma loja")
    void deterministicWithinSameMarket() {
        String first = service.hashDocument(CPF, SALT_LOJA_A);
        String second = service.hashDocument(CPF, SALT_LOJA_A);

        assertEquals(first, second,
            "o mesmo cliente precisa ser reconhecido entre compras");
    }

    @Test
    @DisplayName("o mesmo CPF gera hashes DIFERENTES em lojas diferentes")
    void saltIsolatesMarkets() {
        String lojaA = service.hashDocument(CPF, SALT_LOJA_A);
        String lojaB = service.hashDocument(CPF, SALT_LOJA_B);

        assertNotEquals(lojaA, lojaB,
            "salt por tenant impede cruzar o comportamento da mesma pessoa entre lojas");
    }

    @Test
    @DisplayName("a formatação do documento não altera o hash")
    void normalizesFormatting() {
        String comMascara = service.hashDocument("123.456.789-00", SALT_LOJA_A);
        String semMascara = service.hashDocument("12345678900", SALT_LOJA_A);
        String comEspacos = service.hashDocument(" 123 456 789 00 ", SALT_LOJA_A);

        assertEquals(comMascara, semMascara,
            "o mesmo CPF com e sem mascara e o mesmo cliente");
        assertEquals(comMascara, comEspacos);
    }

    @Test
    @DisplayName("o hash não contém o documento original")
    void hashDoesNotLeakDocument() {
        String hash = service.hashDocument(CPF, SALT_LOJA_A);

        assertTrue(hash.matches("[0-9a-f]{64}"),
            "deve ser hexadecimal de 64 caracteres (SHA-256)");
        assertTrue(!hash.contains("12345678900"),
            "o documento nao pode aparecer no hash");
    }

    @Test
    @DisplayName("CPFs diferentes geram hashes diferentes")
    void differentDocumentsDifferentHashes() {
        assertNotEquals(
            service.hashDocument("11111111111", SALT_LOJA_A),
            service.hashDocument("22222222222", SALT_LOJA_A));
    }

    @Test
    @DisplayName("documento ausente ou sem dígitos devolve null")
    void missingDocumentIsNull() {
        assertNull(service.hashDocument(null, SALT_LOJA_A));
        assertNull(service.hashDocument("", SALT_LOJA_A));
        assertNull(service.hashDocument("   ", SALT_LOJA_A));
        assertNull(service.hashDocument("SEM-CPF", SALT_LOJA_A),
            "texto sem digito nao identifica cliente");
    }
}
