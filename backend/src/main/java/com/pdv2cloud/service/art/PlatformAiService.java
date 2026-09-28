package com.pdv2cloud.service.art;

import com.pdv2cloud.service.ai.AiCredentialCipher;
import com.pdv2cloud.service.ai.LlmClient;
import com.pdv2cloud.service.ai.LlmClient.LlmResponse;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Chave de IA da plataforma para o criador de temas (DeepSeek).
 *
 * Diferente do BYOK dos mercados: esta chave é do dono da plataforma, entra
 * pelo formulário do superadmin e só é usada em telas do superadmin. Mesma
 * regra de custódia — cifrada com a chave mestra, nunca devolvida, nunca em log.
 */
@Service
public class PlatformAiService {

    public static final String PURPOSE_ART = "ART_THEMES";
    public static final String PROVIDER = "DEEPSEEK";
    /** Endpoint fixo: o formulário não aceita URL, o que fecha a porta para SSRF. */
    public static final String BASE_URL = "https://api.deepseek.com";
    /** Modelo com visão (ago/2026). O formulário deixa trocar quando sair outro. */
    public static final String DEFAULT_MODEL = "deepseek-flash";

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final LlmClient llm;

    public PlatformAiService(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, LlmClient llm) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.llm = llm;
    }

    public record Settings(
        String provider, String model, boolean configured, String keyHint,
        boolean encryptionReady, LocalDateTime updatedAt, String updatedBy) {}

    public Settings get() {
        List<Settings> rows = jdbc.query(
            "select model, encrypted_api_key, key_hint, updated_at, updated_by from platform_ai_settings where purpose = :p",
            Map.of("p", PURPOSE_ART),
            (rs, i) -> new Settings(
                PROVIDER,
                rs.getString("model"),
                rs.getString("encrypted_api_key") != null,
                rs.getString("key_hint"),
                cipher.isConfigured(),
                rs.getTimestamp("updated_at") == null ? null : rs.getTimestamp("updated_at").toLocalDateTime(),
                rs.getString("updated_by")));
        return rows.isEmpty()
            ? new Settings(PROVIDER, DEFAULT_MODEL, false, null, cipher.isConfigured(), null, null)
            : rows.get(0);
    }

    /**
     * @param apiKey vazio mantém a chave atual (o formulário nunca a recebe de
     *               volta, então "não mexi no campo" chega vazio)
     */
    public Settings save(String apiKey, String model, String actor) {
        String cleanModel = model == null || model.isBlank() ? DEFAULT_MODEL : model.trim();
        if (cleanModel.length() > 120 || !cleanModel.matches("[A-Za-z0-9._:/-]+")) {
            throw new IllegalArgumentException("Nome de modelo inválido");
        }
        String key = apiKey == null ? "" : apiKey.trim();
        if (!key.isEmpty()) {
            if (!cipher.isConfigured()) {
                throw new IllegalArgumentException(
                    "A chave mestra de criptografia (AI_ENCRYPTION_KEY) não está configurada no servidor");
            }
            if (key.length() < 16 || key.length() > 300 || key.chars().anyMatch(Character::isWhitespace)) {
                throw new IllegalArgumentException("Essa chave não parece uma chave de API do DeepSeek");
            }
        }

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("p", PURPOSE_ART)
            .addValue("provider", PROVIDER)
            .addValue("model", cleanModel)
            .addValue("enc", key.isEmpty() ? null : cipher.encrypt(key))
            .addValue("hint", key.isEmpty() ? null : cipher.hint(key))
            .addValue("now", Timestamp.valueOf(LocalDateTime.now()))
            .addValue("actor", actor);
        jdbc.update(
            "insert into platform_ai_settings (purpose, provider, model, encrypted_api_key, key_hint, updated_at, updated_by) " +
            "values (:p, :provider, :model, :enc, :hint, :now, :actor) " +
            "on conflict (purpose) do update set model = excluded.model, updated_at = excluded.updated_at, " +
            "updated_by = excluded.updated_by, " +
            "encrypted_api_key = coalesce(excluded.encrypted_api_key, platform_ai_settings.encrypted_api_key), " +
            "key_hint = coalesce(excluded.key_hint, platform_ai_settings.key_hint)",
            params);
        return get();
    }

    public Settings removeKey(String actor) {
        jdbc.update(
            "update platform_ai_settings set encrypted_api_key = null, key_hint = null, updated_at = now(), updated_by = :actor where purpose = :p",
            Map.of("p", PURPOSE_ART, "actor", actor == null ? "" : actor));
        return get();
    }

    public boolean isReady() {
        Settings s = get();
        return s.configured() && s.encryptionReady();
    }

    /** Pergunta curta só para validar chave e modelo. */
    public LlmResponse test() {
        Credentials c = credentials();
        return llm.chat(BASE_URL, c.key(), c.model(),
            "Responda apenas com a palavra OK.", "Teste de conexão.", 5, 0);
    }

    public LlmResponse askWithImage(String system, String user, String imageDataUrl, int maxTokens) {
        Credentials c = credentials();
        return llm.chatWithImage(BASE_URL, c.key(), c.model(), system, user, imageDataUrl, maxTokens, 0.2);
    }

    public LlmResponse ask(String system, String user, int maxTokens) {
        Credentials c = credentials();
        return llm.chat(BASE_URL, c.key(), c.model(), system, user, maxTokens, 0.3);
    }

    private record Credentials(String key, String model) {}

    private Credentials credentials() {
        List<Credentials> rows = jdbc.query(
            "select encrypted_api_key, model from platform_ai_settings where purpose = :p and encrypted_api_key is not null",
            Map.of("p", PURPOSE_ART),
            (rs, i) -> new Credentials(rs.getString("encrypted_api_key"), rs.getString("model")));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Cadastre a chave do DeepSeek no painel antes de usar a IA");
        }
        if (!cipher.isConfigured()) {
            throw new IllegalArgumentException("A chave mestra de criptografia não está configurada no servidor");
        }
        return new Credentials(cipher.decrypt(rows.get(0).key()), rows.get(0).model());
    }
}
