package com.pdv2cloud.job;

import com.pdv2cloud.service.AgentPairingService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * O backend HTTP continua atendendo o fluxo de pareamento. A expiracao fica em
 * uma unica instancia no perfil jobs para nao executar em duplicidade.
 */
@Component
@Profile("jobs")
@RequiredArgsConstructor
public class AgentPairingExpirationJob {

    private final AgentPairingService agentPairingService;

    @Scheduled(fixedDelay = 3_600_000L)
    public void expireStaleSessions() {
        agentPairingService.expireStaleSessions();
    }
}
