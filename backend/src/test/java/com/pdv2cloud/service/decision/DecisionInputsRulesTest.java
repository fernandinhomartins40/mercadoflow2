package com.pdv2cloud.service.decision;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DecisionInputsRulesTest {

    @Test
    void margemSobreOPrecoEMarkupSobreOCusto() {
        assertEquals(new BigDecimal("20.00"), DecisionInputsService.margin(new BigDecimal("8"), new BigDecimal("10")));
        assertEquals(new BigDecimal("25.0000"), DecisionInputsService.markup(new BigDecimal("8"), new BigDecimal("10")));
        assertEquals(new BigDecimal("-25.00"), DecisionInputsService.margin(new BigDecimal("10"), new BigDecimal("8")));
        assertNull(DecisionInputsService.margin(null, new BigDecimal("10")));
        assertNull(DecisionInputsService.markup(BigDecimal.ZERO, new BigDecimal("10")));
    }

    @Test
    void recusaValoresSemSentido() {
        UUID p = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class, () -> DecisionInputsService.validate(new DecisionInputsService.Input(p, BigDecimal.ZERO, null, null)));
        assertThrows(IllegalArgumentException.class, () -> DecisionInputsService.validate(new DecisionInputsService.Input(p, null, new BigDecimal("-1"), null)));
        assertThrows(IllegalArgumentException.class, () -> DecisionInputsService.validate(new DecisionInputsService.Input(p, null, null, new BigDecimal("-3"))));
        DecisionInputsService.validate(new DecisionInputsService.Input(p, new BigDecimal("4.5"), new BigDecimal("5.99"), BigDecimal.ZERO));
    }
}
