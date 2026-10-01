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

    public CopilotSettingsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record AgentSettings(String agent, String label, boolean enabled, int level, int dailyLimit, BigDecimal minImpact) {}

    public record Prefs(LocalTime quietStart, LocalTime quietEnd, String whatsappPhone, boolean whatsappOptIn) {}

    public List<AgentSettings> agents(UUID marketId) {
        Map<String, AgentSettings> saved = new LinkedHashMap<>();
        jdbc.query("select agent, enabled, level, daily_limit, min_impact from ai_agent_settings where market_id = :m",
            Map.of("m", marketId), rs -> {
                String a = rs.getString("agent");
                saved.put(a, new AgentSettings(a, AGENTS.getOrDefault(a, a), rs.getBoolean("enabled"), rs.getInt("level"),
                    rs.getInt("daily_limit"), rs.getBigDecimal("min_impact")));
            });
        List<AgentSettings> out = new ArrayList<>();
        AGENTS.forEach((a, label) -> out.add(saved.getOrDefault(a, new AgentSettings(a, label, true, a.equals("GERENTE") || a.equals("CENARIOS") ? 1 : 2, 5,
            BigDecimal.ZERO))));
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
        if (level < 0 || level > 2) {
            throw new IllegalArgumentException("Nível de 0 a 2. Executar sozinho (nível 3) ainda não está disponível.");
        }
        int limit = body.get("dailyLimit") instanceof Number n ? n.intValue() : cur.dailyLimit();
        if (limit < 0 || limit > 50) {
            throw new IllegalArgumentException("Limite de avisos por dia: de 0 a 50.");
        }
        BigDecimal min = body.get("minImpact") instanceof Number n ? new BigDecimal(n.toString()) : cur.minImpact();
        if (min.signum() < 0) {
            throw new IllegalArgumentException("Valor mínimo não pode ser negativo.");
        }
        jdbc.update("insert into ai_agent_settings (market_id, agent, enabled, level, daily_limit, min_impact, updated_by) "
                + "values (:m, :a, :e, :l, :d, :v, :u) on conflict (market_id, agent) do update set enabled = excluded.enabled, "
                + "level = excluded.level, daily_limit = excluded.daily_limit, min_impact = excluded.min_impact, "
                + "updated_at = now(), updated_by = excluded.updated_by",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", agent).addValue("e", enabled)
                .addValue("l", level).addValue("d", limit).addValue("v", min).addValue("u", actor));
        return agents(marketId);
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
