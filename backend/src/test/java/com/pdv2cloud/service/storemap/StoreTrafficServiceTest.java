package com.pdv2cloud.service.storemap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class StoreTrafficServiceTest {

    private final StoreTrafficService service = new StoreTrafficService(mock(NamedParameterJdbcTemplate.class));
    private final UUID market = UUID.randomUUID();
    private final String thisHour = LocalDateTime.now(java.time.ZoneId.of("America/Sao_Paulo")).withMinute(0).withSecond(0).withNano(0).toString();

    private StoreTrafficService.Bucket bucket(int x, int y, double seconds) {
        return new StoreTrafficService.Bucket(thisHour, List.of(new StoreTrafficService.Cell(x, y, seconds)));
    }

    @Test
    void horaEhTruncadaERecusaRelogioErrado() {
        LocalDateTime now = LocalDateTime.of(2026, 11, 7, 10, 30);
        assertEquals(LocalDateTime.of(2026, 11, 7, 9, 0), StoreTrafficService.hourOf("2026-11-07T09:42:10", now));
        assertThrows(IllegalArgumentException.class, () -> StoreTrafficService.hourOf("2026-11-07T13:00:00", now));
        assertThrows(IllegalArgumentException.class, () -> StoreTrafficService.hourOf("2026-08-01T10:00:00", now));
        assertThrows(IllegalArgumentException.class, () -> StoreTrafficService.hourOf("ontem", now));
    }

    @Test
    void recusaDadosForaDoPadrao() {
        assertThrows(IllegalArgumentException.class, () -> service.ingest(market, "../x", List.of(bucket(1, 1, 1))));
        assertThrows(IllegalArgumentException.class, () -> service.ingest(market, "cam1", List.of(bucket(-1, 1, 1))));
        assertThrows(IllegalArgumentException.class, () -> service.ingest(market, "cam1", List.of(bucket(1, 401, 1))));
        assertThrows(IllegalArgumentException.class, () -> service.ingest(market, "cam1", List.of(bucket(1, 1, -5))));
        assertThrows(IllegalArgumentException.class, () -> service.ingest(market, "cam1", List.of(bucket(1, 1, Double.NaN))));
    }

    @Test
    void contaAsCelulasGravadas() {
        assertEquals(1, service.ingest(market, "cam-1", List.of(bucket(3, 4, 12.5))));
        assertEquals(0, service.ingest(market, "cam-1", null));
    }
}
