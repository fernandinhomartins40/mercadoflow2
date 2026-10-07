package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CoverageTargetTest {

    @Test
    void pereciveisCobremMenosDias() {
        assertEquals(3, WorkingCapitalService.coverageDaysFor("Hortifruti", "Tomate kg"));
        assertEquals(3, WorkingCapitalService.coverageDaysFor("FRUTAS E VERDURAS", "Banana prata"));
        assertEquals(3, WorkingCapitalService.coverageDaysFor("Padaria", "Pão francês kg"));
        assertEquals(7, WorkingCapitalService.coverageDaysFor("Açougue", "Carne moída kg"));
        assertEquals(7, WorkingCapitalService.coverageDaysFor("Laticínios", "Leite integral 1L"));
        assertEquals(21, WorkingCapitalService.coverageDaysFor("Mercearia", "Arroz tipo 1 5kg"));
        assertEquals(21, WorkingCapitalService.coverageDaysFor(null, "Detergente 500ml"));
    }
}
