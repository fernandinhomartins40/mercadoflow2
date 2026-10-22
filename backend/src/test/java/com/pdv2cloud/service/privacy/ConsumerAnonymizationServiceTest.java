package com.pdv2cloud.service.privacy;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.AuditService;
import com.pdv2cloud.service.team.TeamRole;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.AccessDeniedException;

/** S5: o mercado atende o pedido de um consumidor (mascara o CPF nas notas e apaga o perfil). */
class ConsumerAnonymizationServiceTest {

    // CPF de teste válido (dígitos verificadores certos).
    private static final String CPF = "529.982.247-25";
    private static final String DIGITS = "52998224725";

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AuditService audit = mock(AuditService.class);
    private final ConsumerAnonymizationService service = new ConsumerAnonymizationService(jdbc, audit);
    private final UUID market = UUID.randomUUID();

    @Test
    void mascaraAsNotasDaLojaApagaOPerfilEDevolveAContagem() {
        when(jdbc.update(eq(ConsumerAnonymizationService.MASK_SQL), any(MapSqlParameterSource.class))).thenReturn(14);
        when(jdbc.update(eq(ConsumerAnonymizationService.PROFILE_SQL), any(MapSqlParameterSource.class))).thenReturn(1);

        ConsumerAnonymizationService.Result r = service.anonymize(market, CPF);

        assertEquals(14, r.notasAlteradas());
        assertTrue(r.perfilApagado());
        assertEquals("25", r.cpfFinal());
        ArgumentCaptor<MapSqlParameterSource> cap = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).update(eq(ConsumerAnonymizationService.MASK_SQL), cap.capture());
        assertEquals(DIGITS, cap.getValue().getValue("doc"));
        assertEquals(market, cap.getValue().getValue("m"));
    }

    @Test
    void auditoriaNaoGuardaOCpfEmClaro() {
        when(jdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(0);

        service.anonymize(market, CPF);

        verify(audit).logAction(eq("MARKET"), eq(market), eq("CONSUMER_ANONYMIZATION"), eq(true),
            argThat((Map<String, Object> d) -> "25".equals(d.get("cpfFinal")) && !d.toString().contains(DIGITS)
                && !d.toString().contains("529")));
    }

    @Test
    void sqlUsaAMesmaMascaraDoJobSoNaLojaEComparaSoDigitos() {
        String sql = ConsumerAnonymizationService.MASK_SQL;
        assertTrue(sql.contains("'***.***.***-' || right(:doc, 2)"));
        assertTrue(sql.contains("market_id = :m"));
        assertTrue(sql.contains("regexp_replace(cpf_cnpj_destinatario, '\\D', '', 'g') = :doc"));
        assertTrue(sql.contains("not like '*%'"), "idempotente");
        assertFalse(sql.contains("delete"), "a nota nunca é apagada");
        String profile = ConsumerAnonymizationService.PROFILE_SQL;
        assertTrue(profile.contains("encode(hmac(:doc, salt, 'sha256'), 'hex')"), "mesmo hash da materialização");
        assertTrue(profile.contains("market_customer_salts where market_id = :m"));
    }

    @Test
    void cpfInvalidoNaoMexeEmNada() {
        assertThrows(IllegalArgumentException.class, () -> service.anonymize(market, "529.982.247-26"));
        assertThrows(IllegalArgumentException.class, () -> service.anonymize(market, "111.111.111-11"));
        assertThrows(IllegalArgumentException.class, () -> service.anonymize(market, "12345"));
        assertThrows(IllegalArgumentException.class, () -> service.anonymize(market, null));
        verify(jdbc, never()).update(anyString(), any(MapSqlParameterSource.class));
    }

    @Test
    void soDonoEGerente() {
        assertDoesNotThrow(() -> ConsumerAnonymizationService.assertCanRequest(TeamRole.DONO));
        assertDoesNotThrow(() -> ConsumerAnonymizationService.assertCanRequest(TeamRole.GERENTE));
        assertDoesNotThrow(() -> ConsumerAnonymizationService.assertCanRequest(null));
        for (TeamRole r : new TeamRole[] {TeamRole.COMPRADOR, TeamRole.CONFERENTE, TeamRole.FINANCEIRO, TeamRole.LEITURA}) {
            assertThrows(AccessDeniedException.class, () -> ConsumerAnonymizationService.assertCanRequest(r), r.name());
        }
    }
}
