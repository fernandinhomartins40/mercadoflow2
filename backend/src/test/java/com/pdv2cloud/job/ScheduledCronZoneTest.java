package com.pdv2cloud.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * PERF-09: os contêineres rodam em UTC. Cron sem zone dispara no horário UTC
 * (02:00 UTC = 23:00 em Brasília). Todo @Scheduled com cron precisa de
 * zone = "America/Sao_Paulo"; job novo sem zone quebra este teste.
 */
class ScheduledCronZoneTest {

    private static final String ZONE = "America/Sao_Paulo";

    @Test
    void todoCronDeclaraOFusoDeBrasilia() throws Exception {
        // Sem filtro de @Profile/@ConditionalOnProperty: os jobs só ligam no
        // perfil jobs, e o scanner padrão os descartaria.
        ClassPathScanningCandidateComponentProvider scanner =
            new ClassPathScanningCandidateComponentProvider(false) {
                @Override
                protected boolean isCandidateComponent(MetadataReader reader) {
                    return true;
                }
            };

        List<String> crons = new ArrayList<>();
        List<String> semZona = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.pdv2cloud")) {
            Class<?> type = Class.forName(bd.getBeanClassName(), false, getClass().getClassLoader());
            for (Method m : type.getDeclaredMethods()) {
                for (Scheduled s : m.getAnnotationsByType(Scheduled.class)) {
                    if (s.cron().isEmpty()) {
                        continue;
                    }
                    String where = type.getSimpleName() + "." + m.getName() + " (" + s.cron() + ")";
                    crons.add(where);
                    if (!ZONE.equals(s.zone())) {
                        semZona.add(where);
                    }
                }
            }
        }

        // Garante que a varredura achou os jobs (senão o teste passaria vazio).
        assertThat(crons).hasSizeGreaterThanOrEqualTo(18);
        assertThat(semZona)
            .as("@Scheduled(cron) sem zone = \"%s\"", ZONE)
            .isEmpty();
    }
}
