package com.pdv2cloud.service.ai.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Date;
import java.text.NumberFormat;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Resumo do dia do Copiloto, em texto pronto (proposta, seção 5.3): as vendas
 * de ontem contra o mesmo dia da semana anterior, os 3 assuntos que mais
 * merecem atenção (pela prioridade que o motor já calcula) e as decisões
 * pendentes. Nenhum modelo de linguagem: custo zero, gerado toda manhã e lido
 * em voz alta pelo celular.
 */
@Service
public class DailyBriefService {

    private static final Locale BR = Locale.forLanguageTag("pt-BR");

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    public DailyBriefService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Brief(LocalDate day, String text, List<Map<String, Object>> items) {}

    /** Resumo de hoje: devolve o guardado ou gera agora. */
    public Brief today(UUID marketId) {
        LocalDate day = LocalDate.now();
        List<Brief> saved = jdbc.query("select day, text, items from ai_daily_briefs where market_id = :m and day = :d",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", Date.valueOf(day)), (rs, i) -> new Brief(
                rs.getDate("day").toLocalDate(), rs.getString("text"), readItems(rs.getString("items"))));
        return saved.isEmpty() ? generate(marketId, day) : saved.get(0);
    }

    /** Gera (ou refaz) o resumo do dia; idempotente por (mercado, dia). */
    public Brief generate(UUID marketId, LocalDate day) {
        LocalDate yesterday = day.minusDays(1);
        Map<String, Object> y = sales(marketId, yesterday);
        Map<String, Object> w = sales(marketId, yesterday.minusWeeks(1));
        double revenue = number(y.get("receita"));
        double previous = number(w.get("receita"));
        String weekday = yesterday.getDayOfWeek().getDisplayName(TextStyle.FULL, BR);

        StringBuilder sb = new StringBuilder(greeting());
        if (revenue > 0) {
            sb.append(" Ontem, ").append(weekday).append(", você vendeu ").append(money(revenue))
                .append(" em ").append(integer(number(y.get("cupons")))).append(" cupons");
            if (previous > 0) {
                double pct = (revenue - previous) / previous * 100;
                sb.append(", ").append(percent(Math.abs(pct))).append(pct >= 0 ? " acima" : " abaixo")
                    .append(sameWeekday(yesterday.getDayOfWeek())).append(" anterior");
            }
            sb.append('.');
        } else {
            sb.append(" Não chegaram vendas de ontem ao sistema.");
        }

        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> opps = jdbc.queryForList(
            "select id, title, expected_impact_value from opportunities where market_id = :m and status in ('NOVA', 'VISTA', 'EM_ACAO') "
                + "order by priority_score desc, last_detected_at desc limit 3", Map.of("m", marketId));
        if (!opps.isEmpty()) {
            sb.append(opps.size() == 1 ? " Hoje merece atenção: " : " Hoje merecem atenção: ");
            for (int i = 0; i < opps.size(); i++) {
                Map<String, Object> o = opps.get(i);
                sb.append(i == 0 ? "" : i == opps.size() - 1 ? " e " : "; ").append(o.get("title"));
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("tipo", "oportunidade");
                item.put("id", String.valueOf(o.get("id")));
                item.put("titulo", o.get("title"));
                item.put("impacto", o.get("expected_impact_value"));
                items.add(item);
            }
            sb.append('.');
        }
        Map<String, Object> recs = jdbc.queryForMap(
            "select count(*) as total, coalesce(sum(expected_impact_value), 0) as impacto from recommendations "
                + "where market_id = :m and status = 'PROPOSTA' and exists (select 1 from opportunities op where op.id = recommendations.opportunity_id and op.status in ('NOVA', 'VISTA', 'EM_ACAO'))", Map.of("m", marketId));
        long pending = ((Number) recs.get("total")).longValue();
        if (pending > 0) {
            sb.append(' ').append(pending == 1 ? "Há 1 recomendação esperando" : "Há " + pending + " recomendações esperando")
                .append(" sua decisão");
            double impact = number(recs.get("impacto"));
            if (impact > 0) {
                sb.append(", com retorno esperado de ").append(money(impact));
            }
            sb.append('.');
        }
        // O que os agentes prepararam e espera o sim (caixa de decisões do Copiloto).
        List<Map<String, Object>> decisions = jdbc.queryForList(
            "select id, title, level, urgent from ai_decisions where market_id = :m and status = 'PENDENTE' "
                + "order by urgent desc, created_at desc limit 1", Map.of("m", marketId));
        if (!decisions.isEmpty()) {
            Map<String, Object> top = decisions.get(0);
            sb.append(" O Copiloto preparou: ").append(top.get("title")).append('.');
            if (((Number) top.get("level")).intValue() >= 2) {
                sb.append(" Diga \"aprova\" para confirmar.");
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("tipo", "decisao");
            item.put("id", String.valueOf(top.get("id")));
            item.put("titulo", top.get("title"));
            item.put("impacto", null);
            item.put("nivel", ((Number) top.get("level")).intValue());
            item.put("urgente", Boolean.TRUE.equals(top.get("urgent")));
            items.add(item);
        }
        // Os números do texto, para a tela montar o painel sem reler a frase.
        Map<String, Object> numbers = new LinkedHashMap<>();
        numbers.put("tipo", "numeros");
        numbers.put("id", "numeros");
        numbers.put("titulo", weekday);
        numbers.put("impacto", null);
        numbers.put("receitaOntem", revenue);
        numbers.put("cuponsOntem", Math.round(number(y.get("cupons"))));
        numbers.put("variacao", revenue > 0 && previous > 0 ? (revenue - previous) / previous * 100 : null);
        numbers.put("pendentes", pending);
        numbers.put("impactoPendente", number(recs.get("impacto")));
        items.add(numbers);
        String text = sb.toString();
        jdbc.update("insert into ai_daily_briefs (market_id, day, text, items) values (:m, :d, :t, cast(:i as jsonb)) "
                + "on conflict (market_id, day) do update set text = excluded.text, items = excluded.items, created_at = now()",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", Date.valueOf(day)).addValue("t", text)
                .addValue("i", json(items)));
        return new Brief(day, text, items);
    }

    private Map<String, Object> sales(UUID marketId, LocalDate day) {
        return jdbc.queryForMap("select coalesce(sum(valor_total), 0) as receita, count(*) as cupons from invoices "
                + "where market_id = :m and data_emissao >= :a and data_emissao < :b",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", day.atStartOfDay())
                .addValue("b", day.plusDays(1).atStartOfDay()));
    }

    private static String greeting() {
        int h = java.time.LocalTime.now(java.time.ZoneId.of("America/Sao_Paulo")).getHour();
        return h < 12 ? "Bom dia!" : h < 18 ? "Boa tarde!" : "Boa noite!";
    }

    /** " do sábado", " da segunda-feira": sábado e domingo são masculinos. */
    static String sameWeekday(DayOfWeek d) {
        String name = d.getDisplayName(TextStyle.FULL, BR);
        return (d == DayOfWeek.SATURDAY || d == DayOfWeek.SUNDAY ? " do " : " da ") + name;
    }

    static String money(double v) {
        return NumberFormat.getCurrencyInstance(BR).format(v).replace(' ', ' ');
    }

    static String integer(double v) {
        return NumberFormat.getIntegerInstance(BR).format(Math.round(v));
    }

    static String percent(double v) {
        NumberFormat f = NumberFormat.getNumberInstance(BR);
        f.setMaximumFractionDigits(0);
        return f.format(v) + "%";
    }

    private static double number(Object v) {
        return v instanceof Number n ? n.doubleValue() : v == null ? 0 : new BigDecimal(String.valueOf(v)).doubleValue();
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "[]";
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readItems(String json) {
        try {
            return json == null ? List.of() : mapper.readValue(json, List.class);
        } catch (Exception e) {
            return List.of();
        }
    }
}
