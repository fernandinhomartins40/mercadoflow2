package com.pdv2cloud.service.ai.agents;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.AuditService;
import com.pdv2cloud.service.ai.agents.CopilotSettingsService.ConsentChange;
import com.pdv2cloud.service.ai.agents.CopilotSettingsService.Prefs;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** S7: aceite do WhatsApp com data, IP, número e versão do texto; revogação com data. */
class WhatsAppConsentTest {

    private static final LocalTime Q1 = LocalTime.of(21, 0);
    private static final LocalTime Q2 = LocalTime.of(7, 0);

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AuditService audit = mock(AuditService.class);
    private final CopilotSettingsService settings = new CopilotSettingsService(jdbc);
    private final UUID market = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    private void current(Prefs p) {
        settings.setAudit(audit);
        when(jdbc.query(anyString(), anyMap(), any(RowMapper.class))).thenReturn(List.of(p));
    }

    private MapSqlParameterSource savedParams() {
        ArgumentCaptor<MapSqlParameterSource> cap = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).update(anyString(), cap.capture());
        return cap.getValue();
    }

    @Test
    void ligarTrocarNumeroEDesligar() {
        Prefs off = new Prefs(Q1, Q2, null, false);
        Prefs on = new Prefs(Q1, Q2, "5542999998888", true);
        assertEquals(ConsentChange.GRANT, CopilotSettingsService.consentChange(off, true, "5542999998888"));
        assertEquals(ConsentChange.GRANT, CopilotSettingsService.consentChange(on, true, "5542911112222"));
        assertEquals(ConsentChange.NONE, CopilotSettingsService.consentChange(on, true, "5542999998888"));
        assertEquals(ConsentChange.REVOKE, CopilotSettingsService.consentChange(on, false, "5542999998888"));
        assertEquals(ConsentChange.NONE, CopilotSettingsService.consentChange(off, false, null));
    }

    @Test
    void aceiteGravaDataIpNumeroEVersaoDoTexto() {
        current(new Prefs(Q1, Q2, null, false));
        Map<String, Object> body = new HashMap<>(Map.of("whatsappPhone", "(42) 99999-8888", "whatsappOptIn", true,
            "whatsappConsentVersion", CopilotSettingsService.WHATSAPP_CONSENT_VERSION));

        settings.savePrefs(market, body, "dono@loja", "200.1.2.3");

        MapSqlParameterSource p = savedParams();
        assertEquals(true, p.getValue("g"));
        assertEquals(false, p.getValue("r"));
        assertEquals("200.1.2.3", p.getValue("ip"));
        assertEquals("5542999998888", p.getValue("p"));
        assertEquals(CopilotSettingsService.WHATSAPP_CONSENT_VERSION, p.getValue("v"));
        verify(audit).logAction(eq("MARKET"), eq(market), eq("WHATSAPP_CONSENT_GRANTED"), eq(true),
            eq(Map.of("textVersion", CopilotSettingsService.WHATSAPP_CONSENT_VERSION, "phoneEnd", "8888")));
    }

    @Test
    void revogacaoGravaADataEMantemOUltimoAceite() {
        current(new Prefs(Q1, Q2, "5542999998888", true));

        settings.savePrefs(market, new HashMap<>(Map.of("whatsappOptIn", false)), "dono@loja", "200.1.2.3");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<MapSqlParameterSource> cap = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).update(sql.capture(), cap.capture());
        assertEquals(false, cap.getValue().getValue("g"));
        assertEquals(true, cap.getValue().getValue("r"));
        assertTrue(sql.getValue().contains("whatsapp_opt_out_at = case when :g then null when :r then now()"));
        assertTrue(sql.getValue().contains("whatsapp_opt_in_at = case when :g then now() else ai_copilot_prefs.whatsapp_opt_in_at end"),
            "revogar mantém a data do último aceite");
        verify(audit).logAction(eq("MARKET"), eq(market), eq("WHATSAPP_CONSENT_REVOKED"), eq(true), anyMap());
    }

    @Test
    void aceiteSemOTextoAtualNaTelaEhRecusado() {
        current(new Prefs(Q1, Q2, null, false));
        Map<String, Object> body = new HashMap<>(Map.of("whatsappPhone", "42999998888", "whatsappOptIn", true));

        assertThrows(IllegalArgumentException.class, () -> settings.savePrefs(market, body, "dono@loja", "200.1.2.3"));
        verify(jdbc, never()).update(anyString(), any(MapSqlParameterSource.class));
    }

    @Test
    void mudarSoOHorarioNaoMexeNoConsentimento() {
        current(new Prefs(Q1, Q2, "5542999998888", true));

        settings.savePrefs(market, new HashMap<>(Map.of("quietStart", "22:00")), "dono@loja", "200.1.2.3");

        MapSqlParameterSource p = savedParams();
        assertEquals(false, p.getValue("g"));
        assertEquals(false, p.getValue("r"));
        verify(audit, never()).logAction(anyString(), any(), anyString(), anyBoolean(), anyMap());
    }
}
