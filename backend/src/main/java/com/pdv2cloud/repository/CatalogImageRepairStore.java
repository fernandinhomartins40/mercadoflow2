package com.pdv2cloud.repository;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Leitura leve para o reparo de fotos do catálogo.
 *
 * Só as três colunas que o reparo usa: nunca raw_payload nem attributes_json
 * (é o TOAST que faz product_enrichments ter 2,8 GB). Paginação por chave em
 * product_id, que tem índice único (uk_product_enrichments_product): cada lote
 * lê só as linhas que devolve, sem OFFSET e sem DISTINCT ON.
 */
@Repository
public class CatalogImageRepairStore {

    /** Menor UUID: ponto de partida da primeira janela. */
    public static final UUID START = new UUID(0L, 0L);

    public static final String CANDIDATES_SQL = """
        select pe.product_id, pe.image_url, pe.image_storage_key
        from product_enrichments pe
        where pe.product_id > :afterProductId
          and coalesce(pe.image_storage_key, '') <> ''
          and (:provider = '' or pe.provider = :provider)
        order by pe.product_id
        limit :limit
        """;

    public record Candidate(UUID productId, String imageUrl, String imageStorageKey) {
    }

    public record Cursor(UUID lastProductId, LocalDateTime passStartedAt) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public CatalogImageRepairStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Candidate> findCandidatesAfter(UUID afterProductId, String provider, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("afterProductId", afterProductId == null ? START : afterProductId)
            .addValue("provider", provider == null ? "" : provider)
            .addValue("limit", limit);
        return jdbc.query(CANDIDATES_SQL, params, (rs, i) -> new Candidate(
            rs.getObject("product_id", UUID.class),
            rs.getString("image_url"),
            rs.getString("image_storage_key")
        ));
    }

    public Optional<Cursor> loadCursor(String jobName) {
        List<Cursor> rows = jdbc.query(
            "select last_product_id, pass_started_at from catalog_image_repair_cursor where job_name = :job",
            new MapSqlParameterSource("job", jobName),
            (rs, i) -> {
                Timestamp started = rs.getTimestamp("pass_started_at");
                return new Cursor(
                    rs.getObject("last_product_id", UUID.class),
                    started == null ? null : started.toLocalDateTime()
                );
            }
        );
        return rows.stream().findFirst();
    }

    /** lastProductId nulo = a volta terminou; a próxima execução começa do início. */
    public void saveCursor(String jobName, UUID lastProductId, LocalDateTime passStartedAt, int scanned) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("job", jobName)
            .addValue("last", lastProductId, Types.OTHER)
            .addValue("passStartedAt", passStartedAt == null ? null : Timestamp.valueOf(passStartedAt), Types.TIMESTAMP)
            .addValue("scanned", scanned);
        jdbc.update("""
            insert into catalog_image_repair_cursor
                (job_name, last_product_id, pass_started_at, last_run_at, last_run_scanned, updated_at)
            values (:job, :last, :passStartedAt, now(), :scanned, now())
            on conflict (job_name) do update set
                last_product_id = excluded.last_product_id,
                pass_started_at = excluded.pass_started_at,
                last_run_at = excluded.last_run_at,
                last_run_scanned = excluded.last_run_scanned,
                updated_at = excluded.updated_at
            """, params);
    }
}
