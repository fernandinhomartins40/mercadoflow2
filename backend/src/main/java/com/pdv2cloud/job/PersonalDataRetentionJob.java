package com.pdv2cloud.job;

import com.pdv2cloud.tenancy.TenantContext;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retenção de dados pessoais (LGPD-01 e LGPD-05; prazos aprovados pelo dono em 22/10/2026).
 *
 *  1. CPF/CNPJ do destinatário das notas com mais de 5 anos vira máscara
 *     ("***.***.***-NN"). A nota e os valores ficam; o perfil de cliente usa só
 *     os últimos 365 dias e ignora o que não tem 11 dígitos, então não muda.
 *  2. IP e navegador (user-agent) da trilha de auditoria somem após 12 meses
 *     (S4 do parecer LGPD); o evento continua até os 5 anos.
 *  3. Apaga tokens vencidos (senha, convite, 2FA) 90 dias após o vencimento;
 *     WhatsApp e registros de IA após 2 anos; trilha de auditoria após 5 anos.
 *
 * Nada financeiro ou fiscal é apagado (carteira, extrato de créditos, pedidos,
 * faturas, notas). Tudo em lotes pequenos, cada um na sua transação, para não
 * segurar a tabela; e idempotente: rodar de novo só pega o que sobrou.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class PersonalDataRetentionJob {

    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    static final int BATCH = 5_000;
    // Teto por tabela e por noite (1 milhão de linhas): o acúmulo antigo sai em algumas noites.
    static final int MAX_BATCHES = 200;
    static final int CPF_YEARS = 5;
    static final int AUDIT_IP_MONTHS = 12;

    /** Tabela, coluna de data e prazo contado a partir dela. */
    record Purge(String table, String dateColumn, int years, int days) {
        LocalDateTime cutoff(LocalDateTime now) {
            return now.minusYears(years).minusDays(days);
        }
    }

    static final List<Purge> PURGES = List.of(
        // Tokens e links vencidos: 90 dias depois do vencimento.
        new Purge("password_reset_tokens", "expires_at", 0, 90),
        new Purge("team_invites", "expires_at", 0, 90),
        new Purge("mfa_challenges", "expires_at", 0, 90),
        // WhatsApp e registros de IA: 2 anos.
        new Purge("ai_whatsapp_messages", "created_at", 2, 0),
        new Purge("ai_usage_log", "created_at", 2, 0),
        new Purge("ai_context_traces", "created_at", 2, 0),
        new Purge("ai_agent_runs", "created_at", 2, 0),
        new Purge("ai_shadow_decisions", "created_at", 2, 0),
        // Trilha de auditoria: 5 anos.
        new Purge("audit_logs", "created_at", 5, 0));

    // O filtro "not like '*%'" casa com o índice parcial da V102 e torna o UPDATE idempotente.
    static final String MASK_SQL =
        "update invoices i set cpf_cnpj_destinatario = case length(s.doc) "
            + "when 11 then '***.***.***-' || right(s.doc, 2) "
            + "when 14 then '**.***.***/****-' || right(s.doc, 2) "
            + "else '***' end "
            + "from (select id, regexp_replace(cpf_cnpj_destinatario, '\\D', '', 'g') as doc from invoices "
            + "where data_emissao < ? and cpf_cnpj_destinatario is not null and cpf_cnpj_destinatario not like '*%' "
            + "order by data_emissao limit ?) s "
            + "where i.id = s.id";

    // Só pega linha que ainda tem IP ou navegador: rodar de novo não regrava nada.
    static final String AUDIT_IP_SQL =
        "update audit_logs set ip_address = null, user_agent = null where id in (select id from audit_logs "
            + "where created_at < ? and (ip_address is not null or user_agent is not null) limit ?)";

    private final JdbcTemplate jdbc;

    public PersonalDataRetentionJob(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // 01:30, antes da agregação das 02:00: madrugada livre de outros jobs.
    @Scheduled(cron = "0 30 1 * * *", zone = "America/Sao_Paulo")
    public void run() {
        TenantContext.runAsSystem(() -> run(LocalDateTime.now(ZONE)));
    }

    void run(LocalDateTime now) {
        try {
            int masked = maskConsumerDocuments(now.minusYears(CPF_YEARS));
            log.info("Retenção LGPD: {} notas com CPF/CNPJ do destinatário mascarado (emitidas há mais de {} anos)",
                masked, CPF_YEARS);
        } catch (Exception e) {
            log.error("Retenção LGPD: máscara do CPF das notas falhou; os lotes já gravados ficam", e);
        }
        try {
            int cleared = clearAuditNetworkData(now.minusMonths(AUDIT_IP_MONTHS));
            log.info("Retenção LGPD: IP e navegador apagados de {} registros de auditoria (mais de {} meses)",
                cleared, AUDIT_IP_MONTHS);
        } catch (Exception e) {
            log.error("Retenção LGPD: limpeza do IP da auditoria falhou; os lotes já gravados ficam", e);
        }
        for (Purge purge : PURGES) {
            try {
                int deleted = purge(purge, now);
                log.info("Retenção LGPD: {} linhas apagadas de {} ({} anterior a {})",
                    deleted, purge.table(), purge.dateColumn(), purge.cutoff(now));
            } catch (Exception e) {
                // Uma tabela com problema não impede as outras.
                log.error("Retenção LGPD: limpeza de {} falhou", purge.table(), e);
            }
        }
    }

    int maskConsumerDocuments(LocalDateTime cutoff) {
        Timestamp before = Timestamp.valueOf(cutoff);
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = jdbc.update(MASK_SQL, before, BATCH);
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    int clearAuditNetworkData(LocalDateTime cutoff) {
        Timestamp before = Timestamp.valueOf(cutoff);
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = jdbc.update(AUDIT_IP_SQL, before, BATCH);
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    int purge(Purge purge, LocalDateTime now) {
        Timestamp before = Timestamp.valueOf(purge.cutoff(now));
        String sql = purgeSql(purge);
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = jdbc.update(sql, before, BATCH);
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    // Nomes vêm só da lista fixa acima, nunca de entrada externa.
    static String purgeSql(Purge purge) {
        return "delete from " + purge.table() + " where id in (select id from " + purge.table()
            + " where " + purge.dateColumn() + " < ? limit ?)";
    }
}
