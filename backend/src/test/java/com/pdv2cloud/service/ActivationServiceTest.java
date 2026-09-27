package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.dto.ActivationStatusDTO;
import com.pdv2cloud.model.dto.ActivationStatusDTO.StepKey;
import com.pdv2cloud.service.ActivationService.Snapshot;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class ActivationServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 9, 27, 14, 0);
    private static final LocalDateTime KEY_AT = NOW.minusHours(3);
    private static final LocalDateTime INGEST_AT = NOW.minusHours(2);
    private static final LocalDateTime ANALYSIS_AT = NOW.minusHours(1);

    private static Snapshot snapshot(int keys, LocalDateTime heartbeat, LocalDateTime ingest,
                                     LocalDateTime analysis, int salesDays, int rejected) {
        return new Snapshot(keys, keys > 0 ? KEY_AT : null, heartbeat, keys, ingest, analysis,
            ingest == null ? 0 : 42, salesDays, rejected);
    }

    @Test
    void mercadoNovoComecaNoPrimeiroPasso() {
        ActivationStatusDTO s = ActivationService.build(snapshot(0, null, null, null, 0, 0), NOW);

        assertFalse(s.complete());
        assertEquals(3, s.steps().size());
        assertEquals(StepKey.CONNECT_AGENT, s.steps().get(0).key());
        assertTrue(s.steps().stream().noneMatch(ActivationStatusDTO.Step::done));
        assertFalse(s.agent().online());
        assertEquals(0, s.agent().pairedPdvs());
    }

    @Test
    void agenteConectadoEOnline() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW.minusMinutes(5), null, null, 0, 0), NOW);

        assertTrue(s.steps().get(0).done());
        assertEquals(ActivationService.withZone(KEY_AT), s.steps().get(0).doneAt());
        assertTrue(s.agent().online());
        assertFalse(s.steps().get(1).done());
    }

    @Test
    void heartbeatAntigoMarcaAgenteForaDoAr() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW.minusHours(2), null, null, 0, 0), NOW);

        assertTrue(s.steps().get(0).done());
        assertFalse(s.agent().online());
        assertEquals(ActivationService.withZone(NOW.minusHours(2)), s.agent().lastHeartbeatAt());
    }

    @Test
    void primeiraNotaSemAnaliseInformaProximaAnalise() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW, INGEST_AT, null, 1, 0), NOW);

        assertTrue(s.steps().get(1).done());
        assertEquals(ActivationService.withZone(INGEST_AT), s.steps().get(1).doneAt());
        assertFalse(s.steps().get(2).done());
        assertEquals(ActivationService.withZone(LocalDateTime.of(2026, 9, 28, 3, 30)), s.nextAnalysisAt());
    }

    @Test
    void datasSaemComFuso() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW, INGEST_AT, null, 1, 0), NOW);

        // Sem o offset o navegador leria a hora do container (UTC) como local.
        assertEquals(INGEST_AT, s.steps().get(1).doneAt().toLocalDateTime());
        assertEquals(java.time.ZoneId.systemDefault().getRules().getOffset(INGEST_AT),
            s.steps().get(1).doneAt().getOffset());
    }

    @Test
    void proximaAnaliseAntesDas0330EHoje() {
        assertEquals(LocalDateTime.of(2026, 9, 27, 3, 30),
            ActivationService.nextAnalysisAfter(LocalDateTime.of(2026, 9, 27, 1, 0)));
        assertEquals(LocalDateTime.of(2026, 9, 28, 3, 30),
            ActivationService.nextAnalysisAfter(LocalDateTime.of(2026, 9, 27, 3, 30)));
    }

    @Test
    void tresPassosComPoucosDiasAindaColeta() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW, INGEST_AT, ANALYSIS_AT, 3, 0), NOW);

        assertTrue(s.steps().stream().allMatch(ActivationStatusDTO.Step::done));
        assertFalse(s.complete());
        assertEquals(3, s.invoices().salesDays());
        assertEquals(7, s.invoices().targetDays());
        assertNull(s.nextAnalysisAt());
    }

    @Test
    void completoComDiasSuficientes() {
        // A consulta devolve no máximo 8 dias; o DTO não passa do alvo.
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW, INGEST_AT, ANALYSIS_AT, 8, 0), NOW);

        assertTrue(s.complete());
        assertEquals(7, s.invoices().salesDays());
    }

    @Test
    void notasRecusadasAparecem() {
        ActivationStatusDTO s = ActivationService.build(snapshot(1, NOW, null, null, 0, 12), NOW);

        assertEquals(12, s.invoices().rejectedLast7Days());
    }

    @Test
    void chaveRevogadaNaoDevolveLojaComHistoricoAoChecklist() {
        ActivationStatusDTO s = ActivationService.build(snapshot(0, null, INGEST_AT, ANALYSIS_AT, 8, 0), NOW);

        assertTrue(s.steps().get(0).done());
        assertEquals(ActivationService.withZone(INGEST_AT), s.steps().get(0).doneAt());
        assertEquals(0, s.agent().pairedPdvs());
        assertTrue(s.complete());
    }
}
