package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunClaimRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDTO;
import com.pdv2cloud.model.entity.CatalogCrawlerConfig;
import com.pdv2cloud.model.entity.CatalogCrawlerRun;
import com.pdv2cloud.repository.CatalogCrawlerConfigRepository;
import com.pdv2cloud.repository.CatalogCrawlerRunRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** Coleta automatica e recuperacao de execucao abandonada no claim do dispatcher. */
class CrawlerAutoScheduleTest {

    private CatalogCrawlerRunRepository runs;
    private CatalogCrawlerConfig config;
    private SuperAdminService service;

    @BeforeEach
    void setUp() {
        runs = mock(CatalogCrawlerRunRepository.class);
        CatalogCrawlerConfigRepository configs = mock(CatalogCrawlerConfigRepository.class);
        config = new CatalogCrawlerConfig();
        config.setIntervalMinutes(360);
        config.setIsEnabled(true);
        when(configs.findAll()).thenReturn(List.of(config));
        when(runs.findByStatus("RUNNING")).thenReturn(List.of());
        when(runs.findFirstByStatusOrderByRequestedAtAsc("QUEUED")).thenReturn(Optional.empty());
        when(runs.findTopByFinishedAtIsNotNullOrderByFinishedAtDesc()).thenReturn(Optional.empty());
        when(runs.findTopBySourcesJsonContainingOrderByRequestedAtDesc(anyString())).thenReturn(Optional.empty());
        when(runs.save(any(CatalogCrawlerRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service = new SuperAdminService();
        ReflectionTestUtils.setField(service, "crawlerRunRepository", runs);
        ReflectionTestUtils.setField(service, "crawlerConfigRepository", configs);
        ReflectionTestUtils.setField(service, "objectMapper", new ObjectMapper());
    }

    private SuperAdminCrawlerRunDTO claim() {
        return service.claimPendingCrawlerRun(new SuperAdminCrawlerRunClaimRequestDTO());
    }

    private CatalogCrawlerRun runOf(String provider, LocalDateTime requestedAt) {
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(requestedAt);
        run.setFinishedAt(requestedAt);
        run.setStatus("SUCCESS");
        run.setSourcesJson("[\"" + provider + "\"]");
        return run;
    }

    @Test
    void filaVaziaIniciaAPrimeiraFonteQueNuncaRodou() {
        SuperAdminCrawlerRunDTO claimed = claim();

        assertNotNull(claimed);
        assertEquals("RUNNING", claimed.getStatus());
        assertEquals("AUTO_SCHEDULER", claimed.getTriggeredBy());
        assertEquals(List.of("PAODEACUCAR_WEB_BR"), claimed.getSources());
    }

    @Test
    void fonteDesligadaNuncaEntraNaColetaAutomatica() {
        LocalDateTime longAgo = LocalDateTime.now().minusDays(30);
        when(runs.findTopBySourcesJsonContainingOrderByRequestedAtDesc(anyString()))
            .thenAnswer(invocation -> Optional.of(runOf("X", longAgo)));
        // Condor esta desligado: mesmo sendo o unico que nunca rodou, nao pode ser escolhido.
        when(runs.findTopBySourcesJsonContainingOrderByRequestedAtDesc("\"CONDOR_WEB_BR\""))
            .thenReturn(Optional.empty());
        when(runs.findTopBySourcesJsonContainingOrderByRequestedAtDesc("\"DROGAL_WEB_BR\""))
            .thenReturn(Optional.of(runOf("DROGAL_WEB_BR", longAgo.minusDays(1))));

        assertEquals(List.of("DROGAL_WEB_BR"), claim().getSources());
    }

    @Test
    void respeitaAPausaDesdeOFimDaUltimaExecucao() {
        when(runs.findTopByFinishedAtIsNotNullOrderByFinishedAtDesc())
            .thenReturn(Optional.of(runOf("X", LocalDateTime.now().minusMinutes(30))));

        assertNull(claim());
        verify(runs, never()).save(any(CatalogCrawlerRun.class));
    }

    @Test
    void coletaAutomaticaDesligadaNaoIniciaNada() {
        config.setIsEnabled(false);

        assertNull(claim());
    }

    @Test
    void disparoManualNaFilaTemPrioridade() {
        CatalogCrawlerRun queued = runOf("BISTEK_WEB_BR", LocalDateTime.now());
        queued.setStatus("QUEUED");
        queued.setFinishedAt(null);
        when(runs.findFirstByStatusOrderByRequestedAtAsc("QUEUED")).thenReturn(Optional.of(queued));

        assertEquals(List.of("BISTEK_WEB_BR"), claim().getSources());
    }

    @Test
    void execucaoRodandoNaHoraDoClaimFicouOrfaEViraFalha() {
        CatalogCrawlerRun orphan = runOf("ATACADAO_WEB_BR", LocalDateTime.now().minusDays(60));
        orphan.setStatus("RUNNING");
        orphan.setFinishedAt(null);
        when(runs.findByStatus("RUNNING")).thenReturn(List.of(orphan));
        // a execucao orfa acabou de ser encerrada, entao a pausa comeca agora
        when(runs.findTopByFinishedAtIsNotNullOrderByFinishedAtDesc()).thenAnswer(invocation -> Optional.of(orphan));

        assertNull(claim());
        assertEquals("FAILED", orphan.getStatus());
        assertNotNull(orphan.getFinishedAt());
        assertTrue(orphan.getMessage().startsWith("Execucao abandonada"));
    }
}
