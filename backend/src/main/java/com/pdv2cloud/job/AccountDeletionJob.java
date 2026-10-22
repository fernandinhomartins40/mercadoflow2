package com.pdv2cloud.job;

import com.pdv2cloud.service.account.AccountAnonymizer;
import com.pdv2cloud.tenancy.TenantContext;
import java.time.LocalDateTime;
import java.time.ZoneId;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Toda madrugada: anonimiza as contas cujo pedido de exclusão venceu (30 dias)
 * e não teve desistência (LGPD-03). Notas e registros financeiros ficam, sem
 * os dados pessoais; a decisão de cada tabela está no AccountAnonymizer.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class AccountDeletionJob {

    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    private final AccountAnonymizer anonymizer;

    public AccountDeletionJob(AccountAnonymizer anonymizer) {
        this.anonymizer = anonymizer;
    }

    // 01:15, antes da retenção (01:30) e da agregação (02:00).
    @Scheduled(cron = "0 15 1 * * *", zone = "America/Sao_Paulo")
    public void run() {
        TenantContext.runAsSystem(() -> run(LocalDateTime.now(ZONE)));
    }

    int run(LocalDateTime now) {
        int done = 0;
        for (AccountAnonymizer.Due due : anonymizer.due(now)) {
            try {
                // CPF das notas primeiro, em lotes: se falhar, o pedido segue pendente e volta amanhã.
                if ("STORE".equals(due.scope()) && due.marketId() != null) {
                    anonymizer.maskInvoices(anonymizer.network(due.marketId()));
                }
                if (anonymizer.anonymize(due.id(), now)) {
                    done++;
                }
            } catch (Exception e) {
                // Um pedido com problema não impede os outros.
                log.error("Exclusão de conta: pedido {} falhou; tenta de novo na próxima noite", due.id(), e);
            }
        }
        if (done > 0) {
            log.info("Exclusão de conta: {} pedido(s) anonimizado(s)", done);
        }
        return done;
    }
}
