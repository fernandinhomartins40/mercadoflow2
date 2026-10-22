package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.pdv2cloud.model.entity.Market;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** D-04: o superadmin desligar a loja deixa a marca; religar apaga. */
class MarketAdminDisableTest {

    @Test
    void desligarMarcaEReligarApaga() {
        Market m = new Market();
        m.setIsActive(false);
        SuperAdminService.markAdminDisabled(m);
        assertNotNull(m.getDisabledByAdminAt());

        LocalDateTime first = m.getDisabledByAdminAt();
        SuperAdminService.markAdminDisabled(m);
        assertEquals(first, m.getDisabledByAdminAt(), "salvar de novo desligada mantém a data");

        m.setIsActive(true);
        SuperAdminService.markAdminDisabled(m);
        assertNull(m.getDisabledByAdminAt());
    }
}
