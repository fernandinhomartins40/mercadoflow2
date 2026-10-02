package com.pdv2cloud.service.team;

import com.pdv2cloud.service.ai.AiCredentialCipher;
import com.pdv2cloud.service.confere.PixCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Verificação em duas etapas (opcional para o dono e o financeiro): código do
 * aplicativo autenticador no login, com 8 códigos de recuperação de uso único.
 */
@Service
public class TwoFactorService {

    public record Setup(String secret, String otpauthUri, String qrPng) {}

    public record Challenge(UUID userId, boolean keep) {}

    private static final SecureRandom RANDOM = new SecureRandom();

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final PasswordEncoder passwords;

    public TwoFactorService(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.passwords = passwords;
    }

    /** Gera o segredo (ainda desligado) e o QR para o aplicativo. */
    @Transactional
    public Setup setup(UUID userId, String email, TeamRole role) {
        if (role == null || !role.canUseTwoFactor()) {
            throw new IllegalArgumentException("A verificação em duas etapas é para o dono e o financeiro.");
        }
        if (!cipher.isConfigured()) {
            throw new IllegalStateException("A chave mestra de criptografia não está configurada no servidor.");
        }
        if (enabled(userId)) {
            throw new IllegalStateException("A verificação em duas etapas já está ligada.");
        }
        String secret = Totp.newSecret();
        jdbc.update("update users set totp_secret_enc = :s where id = :id", Map.of("s", cipher.encrypt(secret), "id", userId));
        String uri = Totp.uri(secret, email);
        return new Setup(secret, uri, PixCode.qrPngBase64(uri));
    }

    /** Liga com o primeiro código certo; devolve os códigos de recuperação (mostrados uma vez). */
    @Transactional
    public List<String> enable(UUID userId, String code) {
        String secret = secret(userId);
        if (secret == null) {
            throw new IllegalArgumentException("Comece pela leitura do QR.");
        }
        if (!Totp.verify(secret, code, System.currentTimeMillis() / 1000)) {
            throw new IllegalArgumentException("Código não confere. Veja o código atual no aplicativo e tente de novo.");
        }
        List<String> codes = new ArrayList<>();
        List<String> hashes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String c = String.format("%04d-%04d", RANDOM.nextInt(10_000), RANDOM.nextInt(10_000));
            codes.add(c);
            hashes.add(sha256(c));
        }
        jdbc.update("update users set totp_enabled = true, totp_recovery_hashes = :h where id = :id",
            Map.of("h", String.join(",", hashes), "id", userId));
        return codes;
    }

    /** Desliga com a senha e um código (ou código de recuperação). */
    @Transactional
    public void disable(UUID userId, String password, String code) {
        String hash = jdbc.queryForObject("select password from users where id = :id", Map.of("id", userId), String.class);
        if (password == null || !passwords.matches(password, hash)) {
            throw new IllegalArgumentException("Senha incorreta.");
        }
        if (!checkCode(userId, code)) {
            throw new IllegalArgumentException("Código não confere.");
        }
        jdbc.update("update users set totp_enabled = false, totp_secret_enc = null, totp_recovery_hashes = null where id = :id",
            Map.of("id", userId));
    }

    public boolean enabled(UUID userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select totp_enabled from users where id = :id", Map.of("id", userId), Boolean.class));
    }

    // ── Login ────────────────────────────────────────────────────────────

    /** Desafio de 5 minutos depois da senha certa. Devolve o token (só aqui em claro). */
    public String challenge(UUID userId, boolean keep) {
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        jdbc.update("insert into mfa_challenges (user_id, token_hash, keep, expires_at) values (:u, :h, :k, :e)",
            new MapSqlParameterSource().addValue("u", userId).addValue("h", sha256(token)).addValue("k", keep)
                .addValue("e", Timestamp.valueOf(LocalDateTime.now().plusMinutes(5))));
        return token;
    }

    /** Confere o código do desafio; até 5 tentativas, uso único. */
    @Transactional
    public Challenge complete(String token, String code) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Entre de novo com e-mail e senha.");
        }
        List<Map<String, Object>> rows = jdbc.queryForList("select id, user_id, keep, attempts from mfa_challenges where token_hash = :h "
            + "and used_at is null and expires_at > now() for update", Map.of("h", sha256(token)));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("O tempo para digitar o código acabou. Entre de novo com e-mail e senha.");
        }
        Map<String, Object> r = rows.get(0);
        UUID id = (UUID) r.get("id");
        UUID userId = (UUID) r.get("user_id");
        if (((Number) r.get("attempts")).intValue() >= 5) {
            jdbc.update("update mfa_challenges set used_at = now() where id = :id", Map.of("id", id));
            throw new IllegalArgumentException("Muitas tentativas. Entre de novo com e-mail e senha.");
        }
        if (!checkCode(userId, code)) {
            jdbc.update("update mfa_challenges set attempts = attempts + 1 where id = :id", Map.of("id", id));
            throw new IllegalArgumentException("Código não confere.");
        }
        jdbc.update("update mfa_challenges set used_at = now() where id = :id", Map.of("id", id));
        return new Challenge(userId, Boolean.TRUE.equals(r.get("keep")));
    }

    /** Código do aplicativo ou um código de recuperação (que é gasto). */
    boolean checkCode(UUID userId, String code) {
        if (code == null) {
            return false;
        }
        String c = code.trim();
        String secret = secret(userId);
        if (secret != null && Totp.verify(secret, c, System.currentTimeMillis() / 1000)) {
            return true;
        }
        if (c.matches("\\d{4}-?\\d{4}")) {
            String normalized = c.length() == 8 ? c.substring(0, 4) + "-" + c.substring(4) : c;
            String h = sha256(normalized);
            String stored = jdbc.queryForObject("select totp_recovery_hashes from users where id = :id", Map.of("id", userId), String.class);
            if (stored != null && List.of(stored.split(",")).contains(h)) {
                List<String> rest = new ArrayList<>(List.of(stored.split(",")));
                rest.remove(h);
                jdbc.update("update users set totp_recovery_hashes = :h where id = :id", Map.of("h", String.join(",", rest), "id", userId));
                return true;
            }
        }
        return false;
    }

    private String secret(UUID userId) {
        String enc = jdbc.queryForObject("select totp_secret_enc from users where id = :id", Map.of("id", userId), String.class);
        return enc == null ? null : cipher.decrypt(enc);
    }

    static String sha256(String v) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
