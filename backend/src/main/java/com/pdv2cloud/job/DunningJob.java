package com.pdv2cloud.job;

import com.pdv2cloud.service.DunningService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Executa a regua diaria em uma unica instancia. O servico permanece sem
 * perfil para que as rotas administrativas continuem disponiveis no backend.
 */
@Component
@Profile("jobs")
@RequiredArgsConstructor
public class DunningJob {

    private final DunningService dunningService;

    @Scheduled(cron = "0 0 9 * * *")
    public void run() {
        dunningService.run();
    }
}
