package com.pdv2cloud.service.ai.mcp;

import com.pdv2cloud.tenancy.TenantContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Chaves do servidor MCP do MercadoFlow: uma por integração, do próprio
 * mercado, só leitura. O banco guarda só o hash; a chave aparece uma vez, na
 * criação, e pode ser revogada a qualquer momento.
 */
@Service
public class McpKeyService {

    static final String PREFIX = "mfmcp_";
    static final int MAX_ACTIVE = 10;

    private final NamedParameterJdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public McpKeyService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record KeyRow(UUID id, String name, String keyPrefix, LocalDateTime createdAt, String createdBy,
                         LocalDateTime lastUsedAt, long calls, LocalDateTime revokedAt) {}

    public record Created(KeyRow key, String secret) {}

    public record Resolved(UUID keyId, UUID marketId) {}

    public List<KeyRow> list(UUID marketId) {
        return jdbc.query("select * from ai_mcp_keys where market_id = :m order by revoked_at nulls first, created_at desc",
            Map.of("m", marketId), (rs, i) -> new KeyRow((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("key_prefix"),
                ts(rs.getTimestamp("created_at")), rs.getString("created_by"), ts(rs.getTimestamp("last_used_at")),
                rs.getLong("calls"), ts(rs.getTimestamp("revoked_at"))));
    }

    public Created create(UUID marketId, String name, String actor) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || clean.length() > 80) {
            throw new IllegalArgumentException("Dê um nome à integração (até 80 caracteres), ex.: Claude do escritório.");
        }
        Integer active = jdbc.queryForObject("select count(*) from ai_mcp_keys where market_id = :m and revoked_at is null",
            Map.of("m", marketId), Integer.class);
        if (active != null && active >= MAX_ACTIVE) {
            throw new IllegalArgumentException("Limite de " + MAX_ACTIVE + " chaves ativas: revogue uma antes de criar outra.");
        }
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String secret = PREFIX + HexFormat.of().formatHex(bytes);
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ai_mcp_keys (id, market_id, name, key_hash, key_prefix, created_by) values (:id, :m, :n, :h, :p, :u)",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("n", clean)
                .addValue("h", hash(secret)).addValue("p", secret.substring(0, 12)).addValue("u", actor));
        KeyRow row = list(marketId).stream().filter(k -> k.id().equals(id)).findFirst().orElseThrow();
        return new Created(row, secret);
    }

    public List<KeyRow> revoke(UUID marketId, UUID id) {
        jdbc.update("update ai_mcp_keys set revoked_at = now() where market_id = :m and id = :id and revoked_at is null",
            Map.of("m", marketId, "id", id));
        return list(marketId);
    }

    /** Chave válida e não revogada → mercado. Busca global (a requisição ainda não tem mercado). */
    public Optional<Resolved> resolve(String secret) {
        if (secret == null || !secret.startsWith(PREFIX) || secret.length() > 100) {
            return Optional.empty();
        }
        return TenantContext.runAsSystem(() -> {
            List<Resolved> r = jdbc.query("update ai_mcp_keys set last_used_at = now(), calls = calls + 1 "
                    + "where key_hash = :h and revoked_at is null returning id, market_id",
                Map.of("h", hash(secret)), (rs, i) -> new Resolved((UUID) rs.getObject("id"), (UUID) rs.getObject("market_id")));
            return r.isEmpty() ? Optional.<Resolved>empty() : Optional.of(r.get(0));
        });
    }

    static String hash(String secret) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static LocalDateTime ts(java.sql.Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
