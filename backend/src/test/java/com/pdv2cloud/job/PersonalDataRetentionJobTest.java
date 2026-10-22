package com.pdv2cloud.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.job.PersonalDataRetentionJob.Purge;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class PersonalDataRetentionJobTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 22, 1, 30);

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PersonalDataRetentionJob job = new PersonalDataRetentionJob(jdbc);

    private static Purge purgeOf(String table) {
        return PersonalDataRetentionJob.PURGES.stream().filter(p -> p.table().equals(table)).findFirst().orElseThrow();
    }

    @Test
    void mascaraSoNotasComMaisDeCincoAnosAindaEmClaroEmLotesLimitados() {
        String sql = PersonalDataRetentionJob.MASK_SQL;
        assertTrue(sql.contains("data_emissao < ?"));
        assertTrue(sql.contains("cpf_cnpj_destinatario not like '*%'"), "idempotente: não remascara");
        assertTrue(sql.contains("limit ?"));
        assertTrue(sql.contains("'***.***.***-' || right(s.doc, 2)"));
        assertFalse(sql.contains("delete"), "a nota fiscal nunca é apagada");

        when(jdbc.update(eq(sql), any(Timestamp.class), anyInt())).thenReturn(PersonalDataRetentionJob.BATCH, 7);

        assertEquals(PersonalDataRetentionJob.BATCH + 7, job.maskConsumerDocuments(NOW.minusYears(5)));

        verify(jdbc, times(2)).update(sql, Timestamp.valueOf(LocalDateTime.of(2021, 10, 22, 1, 30)),
            PersonalDataRetentionJob.BATCH);
    }

    @Test
    void segundaRodadaSemPendenciaFazUmaConsultaSo() {
        when(jdbc.update(anyString(), any(Timestamp.class), anyInt())).thenReturn(0);

        assertEquals(0, job.maskConsumerDocuments(NOW.minusYears(5)));

        verify(jdbc, times(1)).update(eq(PersonalDataRetentionJob.MASK_SQL), any(Timestamp.class), anyInt());
    }

    @Test
    void cadaRodadaTemTetoDeLotes() {
        when(jdbc.update(anyString(), any(Timestamp.class), anyInt())).thenReturn(PersonalDataRetentionJob.BATCH);

        int total = job.purge(purgeOf("audit_logs"), NOW);

        assertEquals(PersonalDataRetentionJob.BATCH * PersonalDataRetentionJob.MAX_BATCHES, total);
        verify(jdbc, times(PersonalDataRetentionJob.MAX_BATCHES)).update(anyString(), any(Timestamp.class), anyInt());
    }

    @Test
    void prazosAprovados() {
        assertEquals(LocalDateTime.of(2026, 7, 24, 1, 30), purgeOf("password_reset_tokens").cutoff(NOW));
        assertEquals(LocalDateTime.of(2026, 7, 24, 1, 30), purgeOf("team_invites").cutoff(NOW));
        assertEquals(LocalDateTime.of(2024, 10, 22, 1, 30), purgeOf("ai_whatsapp_messages").cutoff(NOW));
        assertEquals(LocalDateTime.of(2024, 10, 22, 1, 30), purgeOf("ai_usage_log").cutoff(NOW));
        assertEquals(LocalDateTime.of(2021, 10, 22, 1, 30), purgeOf("audit_logs").cutoff(NOW));
        assertEquals("expires_at", purgeOf("password_reset_tokens").dateColumn());
        assertEquals("expires_at", purgeOf("team_invites").dateColumn());
    }

    @Test
    void sqlDeLimpezaApagaPorFaixaComLimite() {
        assertEquals("delete from audit_logs where id in (select id from audit_logs where created_at < ? limit ?)",
            PersonalDataRetentionJob.purgeSql(purgeOf("audit_logs")));
    }

    @Test
    void nadaFinanceiroOuFiscalEntraNaLimpeza() {
        Set<String> tables = PersonalDataRetentionJob.PURGES.stream().map(Purge::table).collect(Collectors.toSet());
        for (String proibida : List.of("ai_wallets", "ai_ledger", "ai_orders", "ai_plans", "invoices", "invoice_items",
                "nfe_documents", "confere_ledger", "confere_orders", "network_invoices", "subscriptions")) {
            assertFalse(tables.contains(proibida), proibida);
        }
    }

    @Test
    void falhaNumaTabelaNaoImpedeAsOutras() {
        String auditSql = PersonalDataRetentionJob.purgeSql(purgeOf("audit_logs"));
        String tokensSql = PersonalDataRetentionJob.purgeSql(purgeOf("password_reset_tokens"));
        when(jdbc.update(anyString(), any(Timestamp.class), anyInt())).thenReturn(0);
        when(jdbc.update(eq(PersonalDataRetentionJob.MASK_SQL), any(Timestamp.class), anyInt())).thenThrow(new IllegalStateException("boom"));
        when(jdbc.update(eq(tokensSql), any(Timestamp.class), anyInt())).thenThrow(new IllegalStateException("boom"));

        job.run(NOW);

        verify(jdbc).update(eq(auditSql), eq(Timestamp.valueOf(LocalDateTime.of(2021, 10, 22, 1, 30))),
            eq(PersonalDataRetentionJob.BATCH));
        verify(jdbc, never()).update(eq(auditSql), eq(Timestamp.valueOf(NOW)), anyInt());
    }
}
