package com.pdv2cloud.service.partner;

import com.pdv2cloud.security.PartnerPrincipal;
import com.pdv2cloud.tenancy.TenantContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Credenciais dos ERPs parceiros: client_id + client_secret trocados por um
 * token de acesso de 1 hora (OAuth2 client credentials). Segredo e token são
 * guardados só como hash. Limite de requisições por parceiro e por minuto.
 */
@Service
@org.springframework.context.annotation.Profile("!jobs")
public class PartnerAuthService {

    public static final int TOKEN_TTL_MINUTES = 60;
    public static final int REQUESTS_PER_MINUTE = 120;
    public static final String TOKEN_PREFIX = "mfp_";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final NamedParameterJdbcTemplate jdbc;
    // Encoder próprio: o do SecurityConfig criaria um ciclo (config → filtro → este serviço → config).
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private final Map<UUID, Window> windows = new ConcurrentHashMap<>();

    private record Window(long minute, AtomicInteger count) { }

    public PartnerAuthService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Issued(String access_token, String token_type, int expires_in) { }

    public static String randomToken(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public String hashSecret(String secret) {
        return encoder.encode(secret);
    }

    /** Troca client_id + client_secret por um token. Null quando inválido ou suspenso. */
    public Issued issue(String clientId, String clientSecret) {
        if (clientId == null || clientSecret == null) return null;
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, secret_hash, status from integration_partners where client_id = :c",
                new MapSqlParameterSource("c", clientId));
            if (rows.isEmpty() || "SUSPENSO".equals(rows.get(0).get("status"))
                || !encoder.matches(clientSecret, String.valueOf(rows.get(0).get("secret_hash")))) {
                return null;
            }
            String token = TOKEN_PREFIX + randomToken(32);
            jdbc.update("delete from partner_tokens where expires_at < now()", Map.of());
            jdbc.update("insert into partner_tokens (token_hash, partner_id, expires_at) values (:h, :p, :e)",
                new MapSqlParameterSource("h", sha256(token)).addValue("p", rows.get(0).get("id"))
                    .addValue("e", Timestamp.valueOf(LocalDateTime.now().plusMinutes(TOKEN_TTL_MINUTES))));
            return new Issued(token, "Bearer", TOKEN_TTL_MINUTES * 60);
        });
    }

    public PartnerPrincipal authenticate(String token) {
        return TenantContext.runAsSystem(() -> {
            List<PartnerPrincipal> found = jdbc.query(
                "select p.id, p.name, p.status from partner_tokens t join integration_partners p on p.id = t.partner_id " +
                "where t.token_hash = :h and t.expires_at > now() and p.status <> 'SUSPENSO'",
                new MapSqlParameterSource("h", sha256(token)),
                (rs, n) -> new PartnerPrincipal(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("status")));
            return found.isEmpty() ? null : found.get(0);
        });
    }

    /** A loja autorizou este parceiro (e não revogou)? Devolve os escopos, ou null. */
    public List<String> scopesFor(UUID partnerId, UUID marketId) {
        return TenantContext.runAsSystem(() -> {
            List<List<String>> found = jdbc.query(
                "select scopes from partner_market_links where partner_id = :p and market_id = :m and status = 'ATIVO'",
                new MapSqlParameterSource("p", partnerId).addValue("m", marketId),
                (rs, n) -> List.of((String[]) rs.getArray("scopes").getArray()));
            return found.isEmpty() ? null : found.get(0);
        });
    }

    public boolean allowRequest(UUID partnerId) {
        long minute = System.currentTimeMillis() / 60_000;
        Window w = windows.compute(partnerId,
            (k, cur) -> cur == null || cur.minute() != minute ? new Window(minute, new AtomicInteger()) : cur);
        return w.count().incrementAndGet() <= REQUESTS_PER_MINUTE;
    }
}
