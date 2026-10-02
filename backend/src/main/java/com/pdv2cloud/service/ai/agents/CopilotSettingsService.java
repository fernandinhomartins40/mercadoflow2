package com.pdv2cloud.service.ai.agents;

import java.math.BigDecimal;
import java.sql.Time;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** O que o lojista escolhe para os agentes: ligado, nível de autonomia, limite de avisos e silêncio. */
@Service
public class CopilotSettingsService {

    public static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    /** Agentes desta fase, na ordem da tela. */
    public static final Map<String, String> AGENTS = new LinkedHashMap<>();

    static {
        AGENTS.put("GERENTE", "Gerente: o que merece atenção hoje");
        AGENTS.put("COMPRAS", "Compras: pedido do que vai acabar");
        AGENTS.put("RECEBIMENTO", "Recebimento: aviso ao fornecedor quando a entrega vem errada");
        AGENTS.put("CAPITAL", "Capital parado: liquidar o que não gira");
        AGENTS.put("PRECO", "Preço: produtos acima do mercado");
        AGENTS.put("PROMOCOES", "Promoções: encarte pronto com as ofertas sugeridas");
        AGENTS.put("CENARIOS", "Cenários: datas fortes chegando, com o que vendeu no ano passado");
    }

    private final NamedParameterJdbcTemplate jdbc;

    /** O que cada plano dá vem do catálogo (plan_features). */
    private com.pdv2cloud.service.billing.Entitlements entitlements;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setEntitlements(@org.springframework.context.annotation.Lazy com.pdv2cloud.service.billing.Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    public CopilotSettingsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Agentes que podem agir sozinhos (nível 3): só onde a ação continua revisável e não distorce a medição. */
    public static final java.util.Set<String> AUTONOMOUS = java.util.Set.of("COMPRAS");

    public record AgentSettings(String agent, String label, boolean enabled, int level, int dailyLimit, BigDecimal minImpact,
                                Autonomy autonomy) {}

    /** Limites do nível 3: teto por ação e por dia, fornecedores permitidos e quando o lojista aceitou. */
    public record Autonomy(boolean available, BigDecimal cap, BigDecimal dailyCap, List<String> allowedSuppliers,
                           java.time.LocalDateTime acceptedAt, String acceptedBy) {}

    public record AutonomyConfig(boolean enabled, BigDecimal maxActionCap) {}

    public record Prefs(LocalTime quietStart, LocalTime quietEnd, String whatsappPhone, boolean whatsappOptIn) {}

    public List<AgentSettings> agents(UUID marketId) {
        Map<String, AgentSettings> saved = new LinkedHashMap<>();
        jdbc.query("select agent, enabled, level, daily_limit, min_impact, autonomy_cap, autonomy_daily_cap, allowed_suppliers::text as sup, "
                + "autonomy_accepted_at, autonomy_accepted_by from ai_agent_settings where market_id = :m",
            Map.of("m", marketId), rs -> {
                String a = rs.getString("agent");
                java.sql.Timestamp acc = rs.getTimestamp("autonomy_accepted_at");
                saved.put(a, new AgentSettings(a, AGENTS.getOrDefault(a, a), rs.getBoolean("enabled"), rs.getInt("level"),
                    rs.getInt("daily_limit"), rs.getBigDecimal("min_impact"), new Autonomy(AUTONOMOUS.contains(a),
                        rs.getBigDecimal("autonomy_cap"), rs.getBigDecimal("autonomy_daily_cap"), suppliers(rs.getString("sup")),
                        acc == null ? null : acc.toLocalDateTime(), rs.getString("autonomy_accepted_by"))));
            });
        List<AgentSettings> out = new ArrayList<>();
        AGENTS.forEach((a, label) -> out.add(saved.getOrDefault(a, new AgentSettings(a, label, true, a.equals("GERENTE") || a.equals("CENARIOS") ? 1 : 2, 5,
            BigDecimal.ZERO, new Autonomy(AUTONOMOUS.contains(a), null, null, List.of(), null, null)))));
        return out;
    }

    public AgentSettings agent(UUID marketId, String agent) {
        return agents(marketId).stream().filter(s -> s.agent().equals(agent)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Agente desconhecido"));
    }

    @Transactional
    public List<AgentSettings> save(UUID marketId, String agent, Map<String, Object> body, String actor) {
        if (!AGENTS.containsKey(agent)) {
            throw new IllegalArgumentException("Agente desconhecido");
        }
        AgentSettings cur = agent(marketId, agent);
        boolean enabled = body.get("enabled") == null ? cur.enabled() : Boolean.parseBoolean(String.valueOf(body.get("enabled")));
        int level = body.get("level") instanceof Number n ? n.intValue() : cur.level();
        if (level < 0 || level > 3) {
            throw new IllegalArgumentException("Nível de 0 a 3.");
        }
        BigDecimal cap = body.containsKey("autonomyCap") ? money(body.get("autonomyCap")) : cur.autonomy().cap();
        BigDecimal dailyCap = body.containsKey("autonomyDailyCap") ? money(body.get("autonomyDailyCap")) : cur.autonomy().dailyCap();
        List<String> allowed = body.get("allowedSuppliers") instanceof List<?> l
            ? l.stream().map(String::valueOf).map(String::trim).filter(x -> x.matches("[0-9a-fA-F-]{36}")).distinct().toList()
            : cur.autonomy().allowedSuppliers();
        boolean accepting = Boolean.parseBoolean(String.valueOf(body.get("autonomyAccepted")));
        if (level == 3) {
            if (entitlements != null && !entitlements.has(marketId, "copilot_autonomy")) {
                throw new IllegalArgumentException("O Copiloto fazer sozinho faz parte do plano Profissional.");
            }
            if (!AUTONOMOUS.contains(agent)) {
                throw new IllegalArgumentException("Este agente não age sozinho: a ação dele depende da loja (preço no caixa, liquidação).");
            }
            AutonomyConfig platform = autonomyConfig();
            if (!platform.enabled()) {
                throw new IllegalArgumentException("A autonomia ainda não foi liberada pelo MercadoFlow para a sua loja.");
            }
            if (cap == null || cap.signum() <= 0 || cap.compareTo(platform.maxActionCap()) > 0) {
                throw new IllegalArgumentException("Teto por pedido entre R$ 1 e " + platform.maxActionCap().toPlainString().replace('.', ',') + ".");
            }
            if (dailyCap == null || dailyCap.compareTo(cap) < 0) {
                throw new IllegalArgumentException("O teto do dia não pode ser menor que o teto por pedido.");
            }
            if (allowed.isEmpty()) {
                throw new IllegalArgumentException("Escolha pelo menos um fornecedor permitido.");
            }
            if (!accepting && cur.autonomy().acceptedAt() == null) {
                throw new IllegalArgumentException("Confirme que aceita o Copiloto agir sozinho dentro desses limites.");
            }
        }
        int limit = body.get("dailyLimit") instanceof Number n ? n.intValue() : cur.dailyLimit();
        if (limit < 0 || limit > 50) {
            throw new IllegalArgumentException("Limite de avisos por dia: de 0 a 50.");
        }
        BigDecimal min = body.get("minImpact") instanceof Number n ? new BigDecimal(n.toString()) : cur.minImpact();
        if (min.signum() < 0) {
            throw new IllegalArgumentException("Valor mínimo não pode ser negativo.");
        }
        // O aceite vale enquanto o nível 3 continuar; sair do nível 3 apaga o aceite (voltar exige aceitar de novo).
        boolean keepAccept = level == 3 && (accepting || cur.autonomy().acceptedAt() != null);
        jdbc.update("insert into ai_agent_settings (market_id, agent, enabled, level, daily_limit, min_impact, autonomy_cap, "
                + "autonomy_daily_cap, allowed_suppliers, autonomy_accepted_at, autonomy_accepted_by, updated_by) "
                + "values (:m, :a, :e, :l, :d, :v, :c, :dc, cast(:s as jsonb), case when :k then now() end, case when :k then :u end, :u) "
                + "on conflict (market_id, agent) do update set enabled = excluded.enabled, "
                + "level = excluded.level, daily_limit = excluded.daily_limit, min_impact = excluded.min_impact, "
                + "autonomy_cap = excluded.autonomy_cap, autonomy_daily_cap = excluded.autonomy_daily_cap, "
                + "allowed_suppliers = excluded.allowed_suppliers, "
                + "autonomy_accepted_at = case when :k then coalesce(ai_agent_settings.autonomy_accepted_at, now()) end, "
                + "autonomy_accepted_by = case when :k then coalesce(ai_agent_settings.autonomy_accepted_by, :u) end, "
                + "updated_at = now(), updated_by = excluded.updated_by",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", agent).addValue("e", enabled)
                .addValue("l", level).addValue("d", limit).addValue("v", min).addValue("c", cap).addValue("dc", dailyCap)
                .addValue("s", toJson(allowed)).addValue("k", keepAccept).addValue("u", actor));
        return agents(marketId);
    }

    // ── Autonomia: liberação da plataforma e botão de pausar tudo ─────────────

    public AutonomyConfig autonomyConfig() {
        List<AutonomyConfig> r = jdbc.query("select enabled, max_action_cap from ai_autonomy_config where id = 1", Map.of(),
            (rs, i) -> new AutonomyConfig(rs.getBoolean("enabled"), rs.getBigDecimal("max_action_cap")));
        return r.isEmpty() ? new AutonomyConfig(false, BigDecimal.ZERO) : r.get(0);
    }

    @Transactional
    public AutonomyConfig saveAutonomyConfig(Map<String, Object> body, String actor) {
        AutonomyConfig cur = autonomyConfig();
        boolean enabled = body.get("enabled") == null ? cur.enabled() : Boolean.parseBoolean(String.valueOf(body.get("enabled")));
        BigDecimal max = body.containsKey("maxActionCap") ? money(body.get("maxActionCap")) : cur.maxActionCap();
        if (max == null || max.signum() <= 0) {
            throw new IllegalArgumentException("Teto máximo por ação maior que zero.");
        }
        jdbc.update("update ai_autonomy_config set enabled = :e, max_action_cap = :x, updated_at = now(), updated_by = :u where id = 1",
            new MapSqlParameterSource().addValue("e", enabled).addValue("x", max).addValue("u", actor));
        return autonomyConfig();
    }

    public boolean autonomyPaused(UUID marketId) {
        List<Boolean> r = jdbc.queryForList("select autonomy_paused from ai_copilot_prefs where market_id = :m", Map.of("m", marketId), Boolean.class);
        return !r.isEmpty() && Boolean.TRUE.equals(r.get(0));
    }

    @Transactional
    public boolean setAutonomyPaused(UUID marketId, boolean paused, String actor) {
        jdbc.update("insert into ai_copilot_prefs (market_id, autonomy_paused, autonomy_paused_at, autonomy_paused_by, updated_by) "
                + "values (:m, :p, case when :p then now() end, case when :p then :u end, :u) on conflict (market_id) do update set "
                + "autonomy_paused = :p, autonomy_paused_at = case when :p then now() end, autonomy_paused_by = case when :p then :u end, "
                + "updated_at = now(), updated_by = :u",
            new MapSqlParameterSource().addValue("m", marketId).addValue("p", paused).addValue("u", actor));
        return autonomyPaused(marketId);
    }

    private static BigDecimal money(Object v) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(v)).setScale(2, java.math.RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Valor em reais inválido.");
        }
    }

    private static List<String> suppliers(String json) {
        if (json == null || json.isBlank() || "[]".equals(json.trim())) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[0-9a-fA-F-]{36}").matcher(json);
        while (m.find()) {
            out.add(m.group());
        }
        return out;
    }

    private static String toJson(List<String> ids) {
        return ids.stream().map(x -> "\"" + x + "\"").collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    public Prefs prefs(UUID marketId) {
        List<Prefs> r = jdbc.query("select quiet_start, quiet_end, whatsapp_phone, whatsapp_opt_in from ai_copilot_prefs where market_id = :m",
            Map.of("m", marketId), (rs, i) -> new Prefs(rs.getTime("quiet_start").toLocalTime(), rs.getTime("quiet_end").toLocalTime(),
                rs.getString("whatsapp_phone"), rs.getBoolean("whatsapp_opt_in")));
        return r.isEmpty() ? new Prefs(LocalTime.of(21, 0), LocalTime.of(7, 0), null, false) : r.get(0);
    }

    @Transactional
    public Prefs savePrefs(UUID marketId, Map<String, Object> body, String actor) {
        Prefs cur = prefs(marketId);
        LocalTime start = body.get("quietStart") != null ? LocalTime.parse(String.valueOf(body.get("quietStart"))) : cur.quietStart();
        LocalTime end = body.get("quietEnd") != null ? LocalTime.parse(String.valueOf(body.get("quietEnd"))) : cur.quietEnd();
        String phone = body.containsKey("whatsappPhone") ? normalizePhone(body.get("whatsappPhone")) : cur.whatsappPhone();
        boolean optIn = body.get("whatsappOptIn") == null ? cur.whatsappOptIn() : Boolean.parseBoolean(String.valueOf(body.get("whatsappOptIn")));
        if (optIn && phone == null) {
            throw new IllegalArgumentException("Informe o número do WhatsApp com DDD para receber os avisos.");
        }
        if (optIn && !cur.whatsappOptIn() && entitlements != null && !entitlements.has(marketId, "copilot_whatsapp")) {
            throw new IllegalArgumentException("O Copiloto no WhatsApp faz parte do plano Profissional.");
        }
        jdbc.update("insert into ai_copilot_prefs (market_id, quiet_start, quiet_end, whatsapp_phone, whatsapp_opt_in, whatsapp_opt_in_at, updated_by) "
                + "values (:m, :s, :e, :p, :o, case when :o then now() end, :u) on conflict (market_id) do update set "
                + "quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, whatsapp_phone = excluded.whatsapp_phone, "
                + "whatsapp_opt_in_at = case when excluded.whatsapp_opt_in and not ai_copilot_prefs.whatsapp_opt_in then now() "
                + "when not excluded.whatsapp_opt_in then null else ai_copilot_prefs.whatsapp_opt_in_at end, "
                + "whatsapp_opt_in = excluded.whatsapp_opt_in, updated_at = now(), updated_by = excluded.updated_by",
            new MapSqlParameterSource().addValue("m", marketId).addValue("s", Time.valueOf(start)).addValue("e", Time.valueOf(end))
                .addValue("p", phone).addValue("o", optIn).addValue("u", actor));
        return prefs(marketId);
    }

    /** Dentro do horário de silêncio (que pode virar a meia-noite)? */
    public static boolean quiet(Prefs p, LocalTime now) {
        if (p.quietStart().equals(p.quietEnd())) {
            return false;
        }
        return p.quietStart().isBefore(p.quietEnd())
            ? !now.isBefore(p.quietStart()) && now.isBefore(p.quietEnd())
            : !now.isBefore(p.quietStart()) || now.isBefore(p.quietEnd());
    }

    /** Número brasileiro só com dígitos, com 55 na frente; null quando vazio. */
    static String normalizePhone(Object raw) {
        if (raw == null) {
            return null;
        }
        String d = String.valueOf(raw).replaceAll("\\D", "");
        if (d.isEmpty()) {
            return null;
        }
        if (d.length() == 10 || d.length() == 11) {
            d = "55" + d;
        }
        if (!d.startsWith("55") || d.length() < 12 || d.length() > 13) {
            throw new IllegalArgumentException("Número de WhatsApp inválido: use DDD + número.");
        }
        return d;
    }
}
