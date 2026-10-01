package com.pdv2cloud.service.ai.platform;

import com.pdv2cloud.service.ai.AiCredentialCipher;
import com.pdv2cloud.service.ai.LlmClient;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configuração da IA da plataforma, editada no painel "IA e APIs" do superadmin.
 *
 * Chaves: cifradas com a chave mestra (AI_ENCRYPTION_KEY), nunca voltam pela
 * API (só os 4 últimos dígitos) e nunca vão para log. O endereço de cada
 * provedor vem de uma lista fixa: o formulário não aceita URL livre, então uma
 * chave não pode ser mandada para um servidor falso.
 */
@Service
public class AiPlatformConfig {

    /** Endereços aceitos por provedor. O primeiro é o padrão. */
    public static final Map<String, List<String>> ALLOWED_BASE_URLS = Map.of(
        "DEEPSEEK", List.of("https://api.deepseek.com"),
        "OPENROUTER", List.of("https://openrouter.ai/api/v1"),
        "JEV", List.of("https://api.typesafe.ai", "https://api.apimodels.app"),
        "DEEPGRAM", List.of("https://api.deepgram.com"),
        "WHATSAPP", List.of("https://graph.facebook.com"));

    public static final Set<String> LAYERS = Set.of("TEMPLATE", "JEV", "FLASH", "PRO", "VOZ", "CANAL");

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final LlmClient llm;
    private final JevClient jev;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    public AiPlatformConfig(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, LlmClient llm, JevClient jev) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.llm = llm;
        this.jev = jev;
    }

    // ── Provedores ─────────────────────────────────────────────────────────

    public record Provider(String provider, String baseUrl, List<String> allowedBaseUrls, boolean configured,
                           String keyHint, boolean enabled, int priority, String defaultModel,
                           LocalDateTime lastCheckAt, Boolean lastCheckOk, String lastCheckError, Integer lastCheckMs,
                           LocalDateTime updatedAt, String updatedBy) {}

    public List<Provider> providers() {
        return jdbc.query("select * from ai_platform_providers order by priority, provider", Map.of(), (rs, i) -> new Provider(
            rs.getString("provider"), rs.getString("base_url"),
            ALLOWED_BASE_URLS.getOrDefault(rs.getString("provider"), List.of()),
            rs.getString("encrypted_api_key") != null, rs.getString("key_hint"), rs.getBoolean("enabled"),
            rs.getInt("priority"), rs.getString("default_model"), ts(rs.getTimestamp("last_check_at")),
            (Boolean) rs.getObject("last_check_ok"), rs.getString("last_check_error"), (Integer) rs.getObject("last_check_ms"),
            ts(rs.getTimestamp("updated_at")), rs.getString("updated_by")));
    }

    /**
     * Salva um provedor.
     *
     * @param apiKey vazio mantém a chave atual (a tela nunca recebe a chave de volta)
     */
    @Transactional
    public List<Provider> saveProvider(String provider, String apiKey, String baseUrl, String model,
                                       Boolean enabled, Integer priority, String actor) {
        List<String> allowed = ALLOWED_BASE_URLS.get(provider);
        if (allowed == null) {
            throw new IllegalArgumentException("Provedor desconhecido");
        }
        String url = baseUrl == null || baseUrl.isBlank() ? null : baseUrl.trim().replaceAll("/+$", "");
        if (url != null && !allowed.contains(url)) {
            throw new IllegalArgumentException("Endereço não permitido para " + provider);
        }
        if (model != null && !model.isBlank() && (model.length() > 120 || !model.trim().matches("[A-Za-z0-9._:/-]+"))) {
            throw new IllegalArgumentException("Nome de modelo inválido");
        }
        String key = apiKey == null ? "" : apiKey.trim();
        if (!key.isEmpty()) {
            if (!cipher.isConfigured()) {
                throw new IllegalArgumentException("A chave mestra de criptografia (AI_ENCRYPTION_KEY) não está configurada no servidor");
            }
            if (key.length() < 12 || key.length() > 400 || key.chars().anyMatch(Character::isWhitespace)) {
                throw new IllegalArgumentException("Essa chave não parece uma chave de API válida");
            }
        }
        jdbc.update("update ai_platform_providers set "
                + "encrypted_api_key = coalesce(:enc, encrypted_api_key), key_hint = coalesce(:hint, key_hint), "
                + "base_url = coalesce(:url, base_url), default_model = coalesce(:model, default_model), "
                + "enabled = coalesce(:enabled, enabled), priority = coalesce(:priority, priority), "
                + "updated_at = now(), updated_by = :actor where provider = :p",
            new MapSqlParameterSource().addValue("p", provider)
                .addValue("enc", key.isEmpty() ? null : cipher.encrypt(key))
                .addValue("hint", key.isEmpty() ? null : cipher.hint(key))
                .addValue("url", url).addValue("model", model == null || model.isBlank() ? null : model.trim())
                .addValue("enabled", enabled).addValue("priority", priority).addValue("actor", actor));
        audit(actor, "PROVIDER_SAVE", provider + (key.isEmpty() ? "" : " (chave nova)")
            + (enabled == null ? "" : enabled ? " ligado" : " desligado"));
        return providers();
    }

    @Transactional
    public List<Provider> removeKey(String provider, String actor) {
        jdbc.update("update ai_platform_providers set encrypted_api_key = null, key_hint = null, enabled = false, "
            + "updated_at = now(), updated_by = :a where provider = :p", Map.of("p", provider, "a", actor == null ? "" : actor));
        audit(actor, "PROVIDER_KEY_REMOVE", provider);
        return providers();
    }

    /** Chave em claro de um provedor ligado e configurado. Nunca devolver por API nem logar. */
    public record Key(String provider, String baseUrl, String apiKey, String defaultModel) {}

    public Optional<Key> key(String provider) {
        if (!cipher.isConfigured()) {
            return Optional.empty();
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select base_url, encrypted_api_key, default_model from ai_platform_providers "
                + "where provider = :p and enabled and encrypted_api_key is not null", Map.of("p", provider));
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        try {
            Map<String, Object> r = rows.get(0);
            return Optional.of(new Key(provider, effectiveBase(provider, (String) r.get("base_url")),
                cipher.decrypt((String) r.get("encrypted_api_key")), (String) r.get("default_model")));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public record TestResult(boolean ok, String message, long latencyMs, String balance) {}

    /** Chamada mínima ao provedor; guarda o resultado para a tela mostrar. */
    public TestResult test(String provider, String actor) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select base_url, encrypted_api_key, default_model from ai_platform_providers where provider = :p",
            Map.of("p", provider));
        if (rows.isEmpty() || rows.get(0).get("encrypted_api_key") == null) {
            throw new IllegalArgumentException("Cadastre a chave antes de testar");
        }
        String base = effectiveBase(provider, (String) rows.get(0).get("base_url"));
        String apiKey = cipher.decrypt((String) rows.get(0).get("encrypted_api_key"));
        String model = (String) rows.get(0).get("default_model");
        TestResult result = switch (provider) {
            case "DEEPSEEK", "OPENROUTER" -> {
                LlmClient.LlmResponse r = llm.chat(base, apiKey, model, "Responda apenas com a palavra OK.", "Teste de conexão.", 5, 0);
                yield new TestResult(r.success(), r.success() ? "Respondeu: " + clip(r.content()) : r.errorMessage(), r.latencyMs(),
                    "DEEPSEEK".equals(provider) && r.success() ? deepSeekBalance(base, apiKey) : null);
            }
            case "JEV" -> {
                JevClient.Result r = jev.decide(base, apiKey, model, "O cliente perguntou quanto vendeu ontem.",
                    Map.of("assunto", JevClient.Question.choice("Sobre o que é a pergunta?",
                        Map.of("vendas", "faturamento, vendas, cupons", "estoque", "estoque, compras, reposição", "outro", "outro assunto"))));
                yield new TestResult(r.success(), r.success()
                    ? "Decidiu: " + r.answers().get("assunto").answer() + String.format(" (confiança %.0f%%)", r.answers().get("assunto").confidence() * 100)
                    : r.error(), r.latencyMs(), null);
            }
            default -> simpleGet(provider, base, apiKey);
        };
        jdbc.update("update ai_platform_providers set last_check_at = now(), last_check_ok = :ok, last_check_error = :err, "
                + "last_check_ms = :ms where provider = :p",
            new MapSqlParameterSource().addValue("p", provider).addValue("ok", result.ok())
                .addValue("err", result.ok() ? null : clip(result.message())).addValue("ms", (int) result.latencyMs()));
        audit(actor, "PROVIDER_TEST", provider + (result.ok() ? " ok" : " falhou"));
        return result;
    }

    /** Endereço usado de fato: o do cadastro, ou o simulador em teste local (ver {@link AiDevMock}). */
    static String effectiveBase(String provider, String base) {
        String mock = AiDevMock.baseUrl();
        return mock != null && ("DEEPSEEK".equals(provider) || "OPENROUTER".equals(provider) || "JEV".equals(provider)
            || "DEEPGRAM".equals(provider) || "WHATSAPP".equals(provider)) ? mock : base;
    }

    /** Saldo da conta DeepSeek (GET /user/balance), para o alerta de saldo baixo. */
    String deepSeekBalance(String base, String apiKey) {
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder().uri(URI.create(base + "/user/balance"))
                .timeout(Duration.ofSeconds(8)).header("Authorization", "Bearer " + apiKey).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                return null;
            }
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.body()).path("balance_infos");
            if (node.isArray() && node.size() > 0) {
                return node.get(0).path("total_balance").asText() + " " + node.get(0).path("currency").asText();
            }
        } catch (Exception ignored) {
            // saldo é informativo
        }
        return null;
    }

    private TestResult simpleGet(String provider, String base, String apiKey) {
        long started = System.currentTimeMillis();
        String path = "DEEPGRAM".equals(provider) ? "/v1/projects" : "/v21.0/me";
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create(base + path)).timeout(Duration.ofSeconds(8)).GET();
            b.header("Authorization", ("DEEPGRAM".equals(provider) ? "Token " : "Bearer ") + apiKey);
            HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            boolean ok = r.statusCode() >= 200 && r.statusCode() < 300;
            return new TestResult(ok, ok ? "Chave aceita" : "Recusada (HTTP " + r.statusCode() + ")",
                System.currentTimeMillis() - started, null);
        } catch (Exception e) {
            return new TestResult(false, "Falha de comunicação", System.currentTimeMillis() - started, null);
        }
    }

    // ── Configurações gerais ───────────────────────────────────────────────

    public record Settings(boolean enabled, boolean pilotOnly, BigDecimal dailyBudgetUsd, BigDecimal lowBalanceAlertUsd,
                           int defaultMonthlyCapCredits, BigDecimal usdBrl, int pilotGrantCredits, boolean encryptionReady,
                           LocalDateTime updatedAt, String updatedBy) {}

    public Settings settings() {
        return jdbc.queryForObject("select * from ai_platform_settings where id = 'default'", Map.of(), (rs, i) -> new Settings(
            rs.getBoolean("enabled"), rs.getBoolean("pilot_only"), rs.getBigDecimal("daily_budget_usd"),
            rs.getBigDecimal("low_balance_alert_usd"), rs.getInt("default_monthly_cap_credits"), rs.getBigDecimal("usd_brl"),
            rs.getInt("pilot_grant_credits"), cipher.isConfigured(), ts(rs.getTimestamp("updated_at")), rs.getString("updated_by")));
    }

    @Transactional
    public Settings saveSettings(Map<String, Object> body, String actor) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("actor", actor)
            .addValue("enabled", bool(body.get("enabled")))
            .addValue("pilot", bool(body.get("pilotOnly")))
            .addValue("budget", decimal(body.get("dailyBudgetUsd"), BigDecimal.ZERO, new BigDecimal("10000")))
            .addValue("alert", decimal(body.get("lowBalanceAlertUsd"), BigDecimal.ZERO, new BigDecimal("100000")))
            .addValue("cap", integer(body.get("defaultMonthlyCapCredits"), 0, 1_000_000))
            .addValue("fx", decimal(body.get("usdBrl"), new BigDecimal("1"), new BigDecimal("20")))
            .addValue("grant", integer(body.get("pilotGrantCredits"), 0, 100_000));
        jdbc.update("update ai_platform_settings set enabled = coalesce(:enabled, enabled), pilot_only = coalesce(:pilot, pilot_only), "
            + "daily_budget_usd = coalesce(:budget, daily_budget_usd), low_balance_alert_usd = coalesce(:alert, low_balance_alert_usd), "
            + "default_monthly_cap_credits = coalesce(:cap, default_monthly_cap_credits), usd_brl = coalesce(:fx, usd_brl), "
            + "pilot_grant_credits = coalesce(:grant, pilot_grant_credits), updated_at = now(), updated_by = :actor where id = 'default'", p);
        audit(actor, "SETTINGS_SAVE", String.valueOf(body.keySet()));
        return settings();
    }

    // ── Roteamento por tarefa ──────────────────────────────────────────────

    public record Route(String task, String label, String layer, String provider, String model, int maxContextTokens,
                        int maxOutputTokens, double temperature, double jevThreshold, int creditsPerUse,
                        BigDecimal inputPriceUsdM, BigDecimal outputPriceUsdM, boolean shadow, boolean enabled, String notes,
                        LocalDateTime updatedAt, String updatedBy) {}

    public List<Route> routes() {
        return jdbc.query("select * from ai_task_routes order by task", Map.of(), (rs, i) -> mapRoute(rs));
    }

    public Optional<Route> route(String task) {
        List<Route> r = jdbc.query("select * from ai_task_routes where task = :t", Map.of("t", task), (rs, i) -> mapRoute(rs));
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }

    @Transactional
    public List<Route> saveRoute(String task, Map<String, Object> body, String actor) {
        if (route(task).isEmpty()) {
            throw new IllegalArgumentException("Tarefa desconhecida");
        }
        String layer = body.get("layer") == null ? null : String.valueOf(body.get("layer"));
        if (layer != null && !LAYERS.contains(layer)) {
            throw new IllegalArgumentException("Camada inválida");
        }
        String provider = body.get("provider") == null ? null : String.valueOf(body.get("provider"));
        if (provider != null && !ALLOWED_BASE_URLS.containsKey(provider)) {
            throw new IllegalArgumentException("Provedor inválido");
        }
        String model = body.get("model") == null ? null : String.valueOf(body.get("model")).trim();
        if (model != null && (model.isEmpty() || model.length() > 120 || !model.matches("[A-Za-z0-9._:/-]+"))) {
            throw new IllegalArgumentException("Nome de modelo inválido");
        }
        jdbc.update("update ai_task_routes set layer = coalesce(:layer, layer), provider = coalesce(:provider, provider), "
                + "model = coalesce(:model, model), max_context_tokens = coalesce(:ctx, max_context_tokens), "
                + "max_output_tokens = coalesce(:out, max_output_tokens), temperature = coalesce(:temp, temperature), "
                + "jev_threshold = coalesce(:thr, jev_threshold), credits_per_use = coalesce(:credits, credits_per_use), "
                + "input_price_usd_m = coalesce(:pin, input_price_usd_m), output_price_usd_m = coalesce(:pout, output_price_usd_m), "
                + "shadow = coalesce(:shadow, shadow), enabled = coalesce(:enabled, enabled), updated_at = now(), updated_by = :actor "
                + "where task = :task",
            new MapSqlParameterSource().addValue("task", task).addValue("actor", actor)
                .addValue("layer", layer).addValue("provider", provider).addValue("model", model)
                .addValue("ctx", integer(body.get("maxContextTokens"), 200, 64_000))
                .addValue("out", integer(body.get("maxOutputTokens"), 0, 8_000))
                .addValue("temp", decimal(body.get("temperature"), BigDecimal.ZERO, new BigDecimal("1.5")))
                .addValue("thr", decimal(body.get("jevThreshold"), BigDecimal.ZERO, BigDecimal.ONE))
                .addValue("credits", integer(body.get("creditsPerUse"), 0, 1000))
                .addValue("pin", decimal(body.get("inputPriceUsdM"), BigDecimal.ZERO, new BigDecimal("100")))
                .addValue("pout", decimal(body.get("outputPriceUsdM"), BigDecimal.ZERO, new BigDecimal("100")))
                .addValue("shadow", bool(body.get("shadow"))).addValue("enabled", bool(body.get("enabled"))));
        audit(actor, "ROUTE_SAVE", task + " " + body);
        return routes();
    }

    // ── Mercados de teste ──────────────────────────────────────────────────

    public record PilotMarket(UUID marketId, String name, String cnpj, int balance, LocalDateTime addedAt) {}

    public List<PilotMarket> pilots() {
        return jdbc.query("select p.market_id, m.name, m.cnpj, coalesce(w.balance, 0) balance, p.added_at "
                + "from ai_pilot_markets p join markets m on m.id = p.market_id left join ai_wallets w on w.market_id = p.market_id "
                + "order by p.added_at", Map.of(),
            (rs, i) -> new PilotMarket((UUID) rs.getObject("market_id"), rs.getString("name"), rs.getString("cnpj"),
                rs.getInt("balance"), ts(rs.getTimestamp("added_at"))));
    }

    public boolean isPilot(UUID marketId) {
        Integer n = jdbc.queryForObject("select count(*) from ai_pilot_markets where market_id = :m", Map.of("m", marketId), Integer.class);
        return n != null && n > 0;
    }

    public record MarketHit(UUID id, String name, String cnpj) {}

    public List<MarketHit> searchMarkets(String q) {
        String term = q == null ? "" : q.trim();
        return jdbc.query("select id, name, cnpj from markets where (:q = '' or name ilike :like or cnpj like :digits) "
                + "order by name limit 20",
            new MapSqlParameterSource().addValue("q", term).addValue("like", "%" + term + "%")
                .addValue("digits", "%" + term.replaceAll("\\D", "") + "%"),
            (rs, i) -> new MarketHit((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("cnpj")));
    }

    /** @return true quando o mercado entrou agora (quem chama concede os créditos de teste) */
    @Transactional
    public boolean addPilot(UUID marketId, String actor) {
        int n = jdbc.update("insert into ai_pilot_markets (market_id, added_by) values (:m, :a) on conflict do nothing",
            Map.of("m", marketId, "a", actor == null ? "" : actor));
        audit(actor, "PILOT_ADD", marketId.toString());
        return n > 0;
    }

    @Transactional
    public void removePilot(UUID marketId, String actor) {
        jdbc.update("delete from ai_pilot_markets where market_id = :m", Map.of("m", marketId));
        audit(actor, "PILOT_REMOVE", marketId.toString());
    }

    // ── Auditoria ──────────────────────────────────────────────────────────

    public record AuditEntry(String actor, String action, String detail, LocalDateTime createdAt) {}

    public void audit(String actor, String action, String detail) {
        jdbc.update("insert into ai_admin_audit (actor, action, detail) values (:a, :act, :d)",
            new MapSqlParameterSource().addValue("a", actor).addValue("act", action).addValue("d", clip(detail)));
    }

    public List<AuditEntry> auditLog() {
        return jdbc.query("select * from ai_admin_audit order by created_at desc limit 100", Map.of(),
            (rs, i) -> new AuditEntry(rs.getString("actor"), rs.getString("action"), rs.getString("detail"),
                ts(rs.getTimestamp("created_at"))));
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    private Route mapRoute(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Route(rs.getString("task"), rs.getString("label"), rs.getString("layer"), rs.getString("provider"),
            rs.getString("model"), rs.getInt("max_context_tokens"), rs.getInt("max_output_tokens"),
            rs.getBigDecimal("temperature").doubleValue(), rs.getBigDecimal("jev_threshold").doubleValue(),
            rs.getInt("credits_per_use"), rs.getBigDecimal("input_price_usd_m"), rs.getBigDecimal("output_price_usd_m"),
            rs.getBoolean("shadow"), rs.getBoolean("enabled"), rs.getString("notes"), ts(rs.getTimestamp("updated_at")),
            rs.getString("updated_by"));
    }

    static Boolean bool(Object v) {
        return v == null ? null : v instanceof Boolean b ? b : Boolean.valueOf(String.valueOf(v));
    }

    static Integer integer(Object v, int min, int max) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        int n;
        try {
            n = v instanceof Number num ? num.intValue() : Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Número inválido: " + v);
        }
        if (n < min || n > max) {
            throw new IllegalArgumentException("Valor fora do limite (" + min + " a " + max + "): " + n);
        }
        return n;
    }

    static BigDecimal decimal(Object v, BigDecimal min, BigDecimal max) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        BigDecimal d;
        try {
            d = new BigDecimal(String.valueOf(v).trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Número inválido: " + v);
        }
        if (d.compareTo(min) < 0 || d.compareTo(max) > 0) {
            throw new IllegalArgumentException("Valor fora do limite: " + v);
        }
        return d;
    }

    static String clip(String s) {
        return s == null ? null : s.length() > 480 ? s.substring(0, 480) : s;
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
