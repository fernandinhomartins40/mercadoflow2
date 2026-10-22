package com.pdv2cloud.service.account;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** LGPD art. 18 II/V: o arquivo traz só os dados da própria pessoa, sem segredo, e no máximo um a cada 10 minutos. */
class PersonalDataExportServiceTest {

    private NamedParameterJdbcTemplate jdbc;
    private MutableClock clock;
    private PersonalDataExportService service;
    private final UUID me = UUID.randomUUID();
    private final UUID other = UUID.randomUUID();
    private final UUID market = UUID.randomUUID();
    private final ObjectMapper json = new ObjectMapper();

    /** Relógio que o teste avança. */
    static class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-22T12:00:00Z"));

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }

        void plusMinutes(long m) {
            now.set(now.get().plusSeconds(m * 60));
        }
    }

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        clock = new MutableClock();
        service = new PersonalDataExportService(jdbc, clock);

        Map<String, Object> user = new HashMap<>();
        user.put("id", me);
        user.put("name", "Maria Dona");
        user.put("email", "maria@loja.com");
        user.put("role", "MARKET_OWNER");
        user.put("team_role", "OWNER");
        user.put("market_id", market);
        user.put("is_active", true);
        user.put("totp_enabled", true);
        user.put("created_at", Timestamp.valueOf(LocalDateTime.of(2026, 1, 5, 9, 0)));
        user.put("last_login_at", Timestamp.valueOf(LocalDateTime.of(2026, 10, 21, 8, 30)));
        // Só a consulta da própria pessoa responde; a de outro id não existe neste banco simulado.
        when(jdbc.queryForMap(contains("from users"), argThat((Map<String, ?> p) -> me.equals(p.get("u"))))).thenReturn(user);
        when(jdbc.queryForList(anyString(), anyMap())).thenReturn(List.of());
        when(jdbc.queryForList(contains("from audit_logs"), argThat((Map<String, ?> p) -> p != null && me.equals(p.get("u")))))
            .thenReturn(List.of(Map.of("action", "LOGIN", "ip_address", "200.1.2.3", "user_agent", "Chrome",
                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 10, 21, 8, 30)))));
        when(jdbc.queryForList(contains("from ai_copilot_prefs"), anyMap()))
            .thenReturn(List.of(Map.of("whatsapp_phone", "5542999990000", "whatsapp_opt_in", true)));
        when(jdbc.queryForList(contains("from ai_whatsapp_messages"), anyMap()))
            .thenReturn(List.of(Map.of("direction", "OUT", "kind", "AVISO", "status", "ENVIADA")));
        // Aceites legais existentes e com colunas "perigosas" (select *): o filtro tem de tirá-las.
        when(jdbc.queryForObject(contains("legal_acceptances"), anyMap(), eq(Boolean.class))).thenReturn(true);
        Map<String, Object> acceptance = new HashMap<>();
        acceptance.put("document", "TERMOS");
        acceptance.put("version", "2026-10");
        acceptance.put("token_hash", "abc123");
        when(jdbc.queryForList(contains("from legal_acceptances"), anyMap())).thenReturn(List.of(acceptance));
    }

    @Test
    void exportNaoTemCamposSensiveis() throws Exception {
        String out = json.writeValueAsString(service.export(me)).toLowerCase();
        for (String bad : List.of("password", "senha\"", "hash", "token", "totp", "secret", "recovery", "api_key", "apikey")) {
            assertFalse(out.contains(bad), "campo sensível no arquivo: " + bad + " -> " + out);
        }
        // Nenhuma consulta pede coluna de segredo.
        org.mockito.Mockito.verify(jdbc, org.mockito.Mockito.never())
            .queryForMap(argThat((String sql) -> sql.contains("password") || sql.contains("totp_secret")), anyMap());
    }

    @Test
    @SuppressWarnings("unchecked")
    void exportTrazDadosDaPropriaPessoa() {
        Map<String, Object> out = service.export(me);
        Map<String, Object> profile = (Map<String, Object>) out.get("profile");
        assertEquals("maria@loja.com", profile.get("email"));
        assertEquals(me.toString(), profile.get("id"));
        assertEquals("2026-10-21T08:30", profile.get("lastLoginAt"));
        assertEquals(Map.of("enabled", true), out.get("twoFactor"));
        List<Map<String, Object>> audit = (List<Map<String, Object>>) out.get("auditLog");
        assertEquals("200.1.2.3", audit.get(0).get("ip_address"));
        assertEquals(1, ((List<?>) out.get("whatsappMessages")).size());
        Map<String, Object> accepted = ((List<Map<String, Object>>) out.get("legalAcceptances")).get(0);
        assertEquals("TERMOS", accepted.get("document"));
        assertFalse(accepted.containsKey("token_hash"));
    }

    @Test
    void exportNaoServeDadosDeOutraPessoa() throws Exception {
        String out = json.writeValueAsString(service.export(me));
        assertFalse(out.contains(other.toString()));
        // As consultas são todas pelo id da pessoa logada: outro id não acha usuário.
        assertThrows(RuntimeException.class, () -> service.build(other, clock.instant()));
    }

    @Test
    void aceitesLegaisAusentesNaoQuebram() {
        when(jdbc.queryForObject(contains("legal_acceptances"), anyMap(), eq(Boolean.class))).thenReturn(false);
        assertEquals(List.of(), service.export(me).get("legalAcceptances"));
    }

    @Test
    void limiteDeUmaExportacaoACada10Minutos() {
        assertDoesNotThrow(() -> service.export(me));
        clock.plusMinutes(9);
        PersonalDataExportService.TooSoonException e =
            assertThrows(PersonalDataExportService.TooSoonException.class, () -> service.export(me));
        assertEquals(60, e.retryAfterSeconds());
        clock.plusMinutes(1);
        assertDoesNotThrow(() -> service.export(me));
    }

    @Test
    void falhaNaMontagemDevolveAVez() {
        UUID broken = UUID.randomUUID();
        // Sem usuário: a montagem falha e a próxima tentativa não fica bloqueada pelo limite.
        assertThrows(RuntimeException.class, () -> service.export(broken));
        RuntimeException again = assertThrows(RuntimeException.class, () -> service.export(broken));
        assertTrue(!(again instanceof PersonalDataExportService.TooSoonException));
    }
}
