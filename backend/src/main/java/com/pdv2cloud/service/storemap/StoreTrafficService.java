package com.pdv2cloud.service.storemap;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mapa de calor das câmeras: guarda e resume os segundos de presença por célula
 * que o app MercadoFlow Câmeras envia. Só números agregados; nenhuma imagem.
 */
@Service
public class StoreTrafficService {

    /** Lado da célula, em metros. */
    public static final double CELL_SIZE = 0.5;
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final int MAX_CELLS = 20_000;
    private static final int MAX_CELL_INDEX = 400; // loja de até 200 m
    private static final int KEEP_DAYS = 400;

    public record Cell(int x, int y, double seconds) {}
    public record Bucket(String start, List<Cell> cells) {}

    private final NamedParameterJdbcTemplate jdbc;

    public StoreTrafficService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Grava o acumulado de cada hora: reenvio substitui, não soma. Devolve as células gravadas. */
    @Transactional
    public int ingest(UUID marketId, String rawCamera, List<Bucket> buckets) {
        String camera = rawCamera == null ? "" : rawCamera.trim();
        if (!camera.matches("[A-Za-z0-9_-]{1,40}")) {
            throw new IllegalArgumentException("Identificador de câmera inválido.");
        }
        if (buckets == null) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now(ZONE);
        List<SqlParameterSource> rows = new ArrayList<>();
        for (Bucket b : buckets) {
            LocalDateTime hour = hourOf(b.start(), now);
            for (Cell c : b.cells() == null ? List.<Cell>of() : b.cells()) {
                if (c.x() < 0 || c.y() < 0 || c.x() > MAX_CELL_INDEX || c.y() > MAX_CELL_INDEX) {
                    throw new IllegalArgumentException("Célula fora da loja.");
                }
                // Uma câmera vê várias pessoas na mesma célula, mas nunca mais que algumas por vez.
                if (!(c.seconds() >= 0) || c.seconds() > 3600 * 20) {
                    throw new IllegalArgumentException("Tempo de presença inválido.");
                }
                rows.add(new MapSqlParameterSource().addValue("m", marketId).addValue("c", camera)
                    .addValue("b", Timestamp.valueOf(hour)).addValue("x", c.x()).addValue("y", c.y()).addValue("s", c.seconds()));
            }
        }
        if (rows.size() > MAX_CELLS) {
            throw new IllegalArgumentException("Envio grande demais. Divida em partes menores.");
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("insert into store_traffic_cells (market_id, camera_id, bucket_start, cell_x, cell_y, seconds) "
                + "values (:m, :c, :b, :x, :y, :s) on conflict (market_id, camera_id, bucket_start, cell_x, cell_y) "
                + "do update set seconds = excluded.seconds, received_at = now()", rows.toArray(new SqlParameterSource[0]));
            jdbc.update("delete from store_traffic_cells where market_id = :m and bucket_start < :cut",
                new MapSqlParameterSource().addValue("m", marketId).addValue("cut", Timestamp.valueOf(now.minusDays(KEEP_DAYS))));
        }
        return rows.size();
    }

    /** Hora local da loja. Recusa futuro (relógio errado) e dados velhos demais. */
    static LocalDateTime hourOf(String raw, LocalDateTime now) {
        LocalDateTime hour;
        try {
            hour = LocalDateTime.parse(raw).truncatedTo(ChronoUnit.HOURS);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Hora inválida.");
        }
        if (hour.isAfter(now.plusHours(1)) || hour.isBefore(now.minusDays(45))) {
            throw new IllegalArgumentException("Hora fora do período aceito. Confira o relógio do computador.");
        }
        return hour;
    }

    /** Resumo para a planta: células somadas no período e na faixa de horas, e o total por hora do dia. */
    @Transactional(readOnly = true)
    public Map<String, Object> report(UUID marketId, int days, int hourFrom, int hourTo) {
        int d = Math.max(1, Math.min(365, days));
        int from = Math.max(0, Math.min(23, hourFrom));
        int to = Math.max(from, Math.min(23, hourTo));
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", marketId)
            .addValue("since", Timestamp.valueOf(LocalDate.now(ZONE).minusDays(d - 1L).atStartOfDay()))
            .addValue("from", from).addValue("to", to);
        List<Map<String, Object>> cells = jdbc.query(
            "select cell_x, cell_y, sum(seconds) as s from store_traffic_cells where market_id = :m and bucket_start >= :since "
                + "and extract(hour from bucket_start) between :from and :to group by cell_x, cell_y", p,
            (rs, i) -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("x", rs.getInt("cell_x"));
                c.put("y", rs.getInt("cell_y"));
                c.put("seconds", rs.getDouble("s"));
                return c;
            });
        double[] byHour = new double[24];
        jdbc.query("select extract(hour from bucket_start)::int as h, sum(seconds) as s from store_traffic_cells "
                + "where market_id = :m and bucket_start >= :since group by 1", p,
            (org.springframework.jdbc.core.RowCallbackHandler) (rs) -> byHour[rs.getInt("h")] = rs.getDouble("s"));
        Map<String, Object> last = jdbc.queryForMap("select max(received_at) as at, count(distinct camera_id) as cameras "
            + "from store_traffic_cells where market_id = :m and bucket_start >= :since", p);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cellSize", CELL_SIZE);
        out.put("days", d);
        out.put("cells", cells);
        out.put("byHour", byHour);
        out.put("cameras", last.get("cameras"));
        out.put("lastAt", last.get("at"));
        return out;
    }
}
