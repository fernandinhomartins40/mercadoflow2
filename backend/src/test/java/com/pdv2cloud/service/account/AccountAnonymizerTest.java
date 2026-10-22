package com.pdv2cloud.service.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import static org.mockito.ArgumentMatchers.anyString;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/** LGPD-03: o job anonimiza só pedidos pendentes e vencidos. */
class AccountAnonymizerTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AccountAnonymizer anonymizer = new AccountAnonymizer(jdbc, mock(PasswordEncoder.class));
    private final LocalDateTime now = LocalDateTime.of(2026, 11, 21, 1, 15);
    private final UUID req = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    private void request(String status, LocalDateTime scheduledFor) {
        when(jdbc.queryForList(contains("for update"), anyMap())).thenReturn(List.of(Map.of("id", req, "user_id", userId,
            "scope", "USER", "status", status, "scheduled_for", Timestamp.valueOf(scheduledFor))));
        when(jdbc.queryForList(contains("select email from users"), anyMap(), eq(String.class))).thenReturn(List.of("maria@loja.com"));
    }

    @Test
    void prazoAindaNaoVencidoNaoMexeEmNada() {
        request("PENDING", now.plusDays(1));

        assertFalse(anonymizer.anonymize(req, now));
        verify(jdbc, never()).update(contains("update users"), any(MapSqlParameterSource.class));
    }

    @Test
    void pedidoDesistidoNaoEAnonimizado() {
        request("CANCELED", now.minusDays(1));

        assertFalse(anonymizer.anonymize(req, now));
        verify(jdbc, never()).update(contains("update users"), any(MapSqlParameterSource.class));
    }

    @Test
    void pedidoVencidoAnonimizaOUsuarioEMarcaComoFeito() {
        request("PENDING", now.minusMinutes(1));

        assertTrue(anonymizer.anonymize(req, now));
        verify(jdbc).update(contains("update users set name = 'Conta excluída'"),
            argThat((MapSqlParameterSource p) -> ("deleted+" + userId + "@invalid").equals(p.getValue("e"))));
        verify(jdbc).update(contains("delete from password_reset_tokens"), eq(Map.of("u", userId)));
        verify(jdbc).update(contains("status = 'DONE'"), eq(Map.of("id", req)));
        // Escopo USER: a loja não é tocada.
        verify(jdbc, never()).update(contains("update markets"), anyMap());
    }

    @Test
    void consultaDosVencidosFiltraPendenteEPrazo() {
        when(jdbc.query(anyString(), anyMap(), any(RowMapper.class))).thenReturn(List.of());

        anonymizer.due(now);

        verify(jdbc).query(argThat((String sql) -> sql.contains("status = 'PENDING'") && sql.contains("scheduled_for <= :now")),
            eq(Map.of("now", Timestamp.valueOf(now))), any(RowMapper.class));
    }

    @Test
    void regraDoVencimento() {
        Timestamp ontem = Timestamp.valueOf(now.minusDays(1));
        assertTrue(AccountAnonymizer.isDue("PENDING", ontem, now));
        assertTrue(AccountAnonymizer.isDue("PENDING", Timestamp.valueOf(now), now));
        assertFalse(AccountAnonymizer.isDue("PENDING", Timestamp.valueOf(now.plusSeconds(1)), now));
        assertFalse(AccountAnonymizer.isDue("DONE", ontem, now));
        assertEquals("deleted+" + userId + "@invalid", AccountAnonymizer.anonymousEmail(userId));
    }
}
