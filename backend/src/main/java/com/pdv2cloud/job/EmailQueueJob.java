package com.pdv2cloud.job;

import com.pdv2cloud.service.notify.EmailService;
import com.pdv2cloud.tenancy.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Reenvia, aos poucos, os e-mails que o VeloMail recusou por limite ou instabilidade. */
@Component
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class EmailQueueJob {

    private final EmailService email;

    public EmailQueueJob(EmailService email) {
        this.email = email;
    }

    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void run() {
        TenantContext.runAsSystem(email::flushQueue);
    }
}
