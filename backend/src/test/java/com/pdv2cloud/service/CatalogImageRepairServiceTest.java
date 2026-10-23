package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.CatalogImageRepairResponseDTO;
import com.pdv2cloud.repository.CatalogImageRepairStore;
import com.pdv2cloud.repository.CatalogImageRepairStore.Candidate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** Reparo de fotos do catálogo: paginação por chave, teto por execução e projeção leve. */
class CatalogImageRepairServiceTest {

    private CatalogImageRepairStore store;
    private CatalogImageStorageService storage;
    private CatalogImageRepairService service;
    private final AtomicLong sequence = new AtomicLong(1);

    @BeforeEach
    void setUp() {
        store = mock(CatalogImageRepairStore.class);
        storage = mock(CatalogImageStorageService.class);
        when(storage.hasStoredImage(anyString())).thenReturn(true);
        when(store.loadCursor(anyString())).thenReturn(Optional.empty());

        service = new CatalogImageRepairService();
        ReflectionTestUtils.setField(service, "catalogImageRepairStore", store);
        ReflectionTestUtils.setField(service, "catalogImageStorageService", storage);
        ReflectionTestUtils.setField(service, "defaultBatchSize", 10);
        ReflectionTestUtils.setField(service, "defaultMaxItems", 1000);
        ReflectionTestUtils.setField(service, "defaultProvider", "");
    }

    private List<Candidate> batch(int size) {
        List<Candidate> rows = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            long n = sequence.getAndIncrement();
            rows.add(new Candidate(new UUID(0L, n), "https://x/" + n + ".jpg", "catalog/" + n + ".jpg"));
        }
        return rows;
    }

    @Test
    void paginaPorChaveUsandoOUltimoProductIdDoLote() {
        List<Candidate> first = batch(10);
        List<Candidate> second = batch(4);
        UUID lastOfFirst = first.get(9).productId();
        when(store.findCandidatesAfter(isNull(), eq(""), eq(10))).thenReturn(first);
        when(store.findCandidatesAfter(eq(lastOfFirst), eq(""), eq(10))).thenReturn(second);

        CatalogImageRepairResponseDTO result = service.runManualRepair("", 100, 10, null);

        assertEquals(14, result.getScannedEnrichments());
        assertEquals(14, result.getAlreadyPresent());
        assertTrue(result.isCompleted());
        verify(store).findCandidatesAfter(eq(lastOfFirst), eq(""), eq(10));
        // Lote menor que o pedido = fim da tabela: não há terceira consulta.
        verify(store, times(2)).findCandidatesAfter(any(), anyString(), anyInt());
        // O manual não mexe no cursor do agendado.
        verify(store, never()).saveCursor(anyString(), any(), any(), anyInt());
    }

    @Test
    void agendadoRespeitaOTetoMesmoComMaxItemsDeProducao() {
        // A VPS usa CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN=250000 e lote de 1000.
        ReflectionTestUtils.setField(service, "defaultMaxItems", 250000);
        ReflectionTestUtils.setField(service, "defaultBatchSize", 1000);
        when(store.findCandidatesAfter(any(), anyString(), anyInt()))
            .thenAnswer(invocation -> batch(invocation.getArgument(2)));

        CatalogImageRepairResponseDTO result = service.runScheduledRepairIfIdle();

        int cap = CatalogImageRepairService.SCHEDULED_MAX_ITEMS_CAP;
        assertEquals(cap, result.getScannedEnrichments());
        assertFalse(result.isCompleted());
        verify(store, times(cap / 1000)).findCandidatesAfter(any(), anyString(), anyInt());
        ArgumentCaptor<UUID> last = ArgumentCaptor.forClass(UUID.class);
        verify(store).saveCursor(eq(CatalogImageRepairService.SCHEDULED_JOB_NAME), last.capture(), any(), eq(cap));
        assertEquals(new UUID(0L, cap), last.getValue());
    }

    @Test
    void ultimoLotePedeSoOQueFaltaParaOTeto() {
        when(store.findCandidatesAfter(any(), anyString(), anyInt()))
            .thenAnswer(invocation -> batch(invocation.getArgument(2)));

        CatalogImageRepairResponseDTO result = service.runManualRepair("", 25, 10, null);

        assertEquals(25, result.getScannedEnrichments());
        assertFalse(result.isCompleted());
        verify(store, times(2)).findCandidatesAfter(any(), anyString(), eq(10));
        verify(store).findCandidatesAfter(any(), anyString(), eq(5));
    }

    @Test
    void agendadoRetomaDoCursorEZeraAoChegarAoFim() {
        UUID saved = new UUID(0L, 500L);
        LocalDateTime passStarted = LocalDateTime.now().minusDays(1);
        when(store.loadCursor(CatalogImageRepairService.SCHEDULED_JOB_NAME))
            .thenReturn(Optional.of(new CatalogImageRepairStore.Cursor(saved, passStarted)));
        when(store.findCandidatesAfter(eq(saved), anyString(), anyInt())).thenReturn(batch(3));

        CatalogImageRepairResponseDTO result = service.runScheduledRepairIfIdle();

        assertTrue(result.isCompleted());
        assertEquals(3, result.getScannedEnrichments());
        verify(store).findCandidatesAfter(eq(saved), eq(""), eq(10));
        // Volta completa: cursor nulo, a próxima execução começa do início.
        verify(store).saveCursor(eq(CatalogImageRepairService.SCHEDULED_JOB_NAME), isNull(), isNull(), eq(3));
    }

    @Test
    void baixaDeNovoSoOQueSumiuDoDisco() {
        List<Candidate> rows = batch(3);
        Candidate missing = rows.get(1);
        when(store.findCandidatesAfter(any(), anyString(), anyInt())).thenReturn(rows);
        when(storage.hasStoredImage(missing.imageStorageKey())).thenReturn(false, true);
        when(storage.ensureManagedImageAvailable(missing.imageUrl(), missing.imageStorageKey())).thenReturn(true);

        CatalogImageRepairResponseDTO result = service.runManualRepair("dia", 100, 10, "teste");

        assertEquals(2, result.getAlreadyPresent());
        assertEquals(1, result.getAttemptedRepairs());
        assertEquals(1, result.getRepairedImages());
        verify(store).findCandidatesAfter(isNull(), eq("DIA"), eq(10));
        verify(storage, times(1)).ensureManagedImageAvailable(anyString(), anyString());
    }

    @Test
    void consultaDeCandidatosEhLeveEPorChave() {
        String sql = CatalogImageRepairStore.CANDIDATES_SQL.toLowerCase(Locale.ROOT);
        assertFalse(sql.contains("raw_payload"));
        assertFalse(sql.contains("attributes_json"));
        assertFalse(sql.contains("*"));
        assertFalse(sql.contains("offset"));
        assertFalse(sql.contains("distinct"));
        assertTrue(sql.contains("select pe.product_id, pe.image_url, pe.image_storage_key"));
        assertTrue(sql.contains("pe.product_id > :afterproductid"));
        assertTrue(sql.contains("order by pe.product_id"));
        assertTrue(sql.contains("limit :limit"));
    }
}
