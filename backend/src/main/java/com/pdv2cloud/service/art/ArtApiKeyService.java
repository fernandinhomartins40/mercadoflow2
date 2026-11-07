package com.pdv2cloud.service.art;

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
 * Chaves da API de temas de encarte, usadas pelo MCP do Codex para criar e
 * montar temas sozinho. São da plataforma (superadmin), guardadas só como
 * hash, e podem ser revogadas a qualquer momento.
 */
@Service
public class ArtApiKeyService {

    static final String PREFIX = "mftema_";
    static final int MAX_ACTIVE = 10;

    private final NamedParameterJdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public ArtApiKeyService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record KeyRow(UUID id, String name, String keyPrefix, LocalDateTime createdAt, String createdBy,
                         LocalDateTime lastUsedAt, long calls, LocalDateTime revokedAt) {}

    public record Created(KeyRow key, String secret) {}

    public List<KeyRow> list() {
        return TenantContext.runAsSystem(() -> jdbc.query(
            "select * from art_api_keys order by revoked_at nulls first, created_at desc", Map.of(),
            (rs, i) -> new KeyRow((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("key_prefix"),
                ts(rs.getTimestamp("created_at")), rs.getString("created_by"), ts(rs.getTimestamp("last_used_at")),
                rs.getLong("calls"), ts(rs.getTimestamp("revoked_at")))));
    }

    public Created create(String name, String actor) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || clean.length() > 80) {
            throw new IllegalArgumentException("Dê um nome à chave (até 80 caracteres), ex.: Codex do notebook.");
        }
        Integer active = TenantContext.runAsSystem(() ->
            jdbc.queryForObject("select count(*) from art_api_keys where revoked_at is null", Map.of(), Integer.class));
        if (active != null && active >= MAX_ACTIVE) {
            throw new IllegalArgumentException("Limite de " + MAX_ACTIVE + " chaves ativas: revogue uma antes de criar outra.");
        }
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String secret = PREFIX + HexFormat.of().formatHex(bytes);
        UUID id = UUID.randomUUID();
        TenantContext.runAsSystem(() -> jdbc.update(
            "insert into art_api_keys (id, name, key_hash, key_prefix, created_by) values (:id, :n, :h, :p, :u)",
            new MapSqlParameterSource().addValue("id", id).addValue("n", clean).addValue("h", hash(secret))
                .addValue("p", secret.substring(0, 13)).addValue("u", actor)));
        KeyRow row = list().stream().filter(k -> k.id().equals(id)).findFirst().orElseThrow();
        return new Created(row, secret);
    }

    public List<KeyRow> revoke(UUID id) {
        TenantContext.runAsSystem(() ->
            jdbc.update("update art_api_keys set revoked_at = now() where id = :id and revoked_at is null", Map.of("id", id)));
        return list();
    }

    /** Chave válida e não revogada → id da chave (e conta o uso). */
    public Optional<UUID> resolve(String secret) {
        if (secret == null || !secret.startsWith(PREFIX) || secret.length() > 100) {
            return Optional.empty();
        }
        List<UUID> r = TenantContext.runAsSystem(() -> jdbc.query(
            "update art_api_keys set last_used_at = now(), calls = calls + 1 where key_hash = :h and revoked_at is null returning id",
            Map.of("h", hash(secret)), (rs, i) -> (UUID) rs.getObject("id")));
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
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
