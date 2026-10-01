package com.pdv2cloud.service.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.User;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** Uma regra só para entrar, e sempre com o motivo em português quando não pode. */
class AccessPolicyTest {

    private final AccessPolicy policy = new AccessPolicy();

    private Market market(MarketBillingStatus status) {
        Market m = new Market();
        m.setIsActive(true);
        m.setBillingStatus(status);
        return m;
    }

    @Test
    void ativaETesteEntram() {
        assertTrue(policy.of(market(MarketBillingStatus.ACTIVE)).canLogin());
        assertTrue(policy.of(market(MarketBillingStatus.TRIAL)).canLogin());
    }

    @Test
    void emAtrasoEntraComAviso() {
        AccessPolicy.Access a = policy.of(market(MarketBillingStatus.PAST_DUE));
        assertTrue(a.canLogin());
        assertFalse(a.readOnly());
        assertNotNull(a.message());
    }

    @Test
    void restritaEntraSoParaConsulta() {
        AccessPolicy.Access a = policy.of(market(MarketBillingStatus.RESTRICTED));
        assertTrue(a.canLogin());
        assertTrue(a.readOnly());
    }

    @Test
    void bloqueiosExplicamOMotivo() {
        for (MarketBillingStatus s : new MarketBillingStatus[] {MarketBillingStatus.PENDING, MarketBillingStatus.SUSPENDED, MarketBillingStatus.CANCELLED}) {
            AccessPolicy.Access a = policy.of(market(s));
            assertFalse(a.canLogin(), s.name());
            assertEquals(s.name(), a.state());
            assertTrue(a.message().length() > 20);
        }
        Market expired = market(MarketBillingStatus.ACTIVE);
        expired.setAccessExpiresAt(LocalDateTime.now().minusDays(1));
        assertEquals("EXPIRED", policy.of(expired).state());
        Market off = market(MarketBillingStatus.ACTIVE);
        off.setIsActive(false);
        assertEquals("MARKET_DISABLED", policy.of(off).state());
    }

    @Test
    void usuarioDesativadoTemMotivoProprio() {
        User u = new User();
        u.setIsActive(false);
        u.setMarket(market(MarketBillingStatus.ACTIVE));
        AccessPolicy.Access a = policy.of(u);
        assertEquals("USER_DISABLED", a.state());
        assertFalse(a.canLogin());
    }
}
