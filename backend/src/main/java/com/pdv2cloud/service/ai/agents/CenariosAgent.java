package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.service.seasonal.SeasonalCalendarService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Agente de Cenários: "e se" calculado pelo motor, sem IA. Quando uma data forte
 * do calendário (Dia das Mães, Natal, Páscoa…) se aproxima, compara a venda por
 * dia dessa mesma temporada no ano passado com as 4 semanas anteriores a ela e
 * lista o que mais vendeu, para a loja reforçar o estoque a tempo.
 */
@Component
public class CenariosAgent implements CopilotAgent {

    /** Avisa entre 21 e 3 dias antes: dá tempo de comprar. */
    static final int FROM_DAYS = 3;
    static final int TO_DAYS = 21;
    /** Só vale avisar se a temporada vendeu pelo menos isso a mais por dia. */
    static final BigDecimal MIN_UPLIFT = BigDecimal.valueOf(10);

    private final NamedParameterJdbcTemplate jdbc;
    private final SeasonalCalendarService calendar;

    public CenariosAgent(NamedParameterJdbcTemplate jdbc, SeasonalCalendarService calendar) {
        this.jdbc = jdbc;
        this.calendar = calendar;
    }

    @Override
    public String name() {
        return "CENARIOS";
    }

    @Override
    public List<AgentSignal> signals(UUID marketId) {
        return signals(marketId, LocalDate.now(CopilotSettingsService.ZONE));
    }

    List<AgentSignal> signals(UUID marketId, LocalDate today) {
        List<AgentSignal> out = new ArrayList<>();
        for (SeasonalCalendarService.SeasonalWindow w : calendar.resolveDisplayWindows(today)) {
            if (!"UPCOMING".equals(w.status()) || w.distanceDays() < FROM_DAYS || w.distanceDays() > TO_DAYS) {
                continue;
            }
            // A janela analisada é a do ano passado (temporada já concluída).
            LocalDate start = w.analysisStart();
            LocalDate end = w.analysisEnd();
            long seasonDays = Math.max(1, ChronoUnit.DAYS.between(start, end) + 1);
            BigDecimal season = revenue(marketId, start, end.plusDays(1));
            BigDecimal before = revenue(marketId, start.minusDays(28), start);
            if (season.signum() <= 0 || before.signum() <= 0) {
                continue;
            }
            BigDecimal perDaySeason = season.divide(BigDecimal.valueOf(seasonDays), 2, RoundingMode.HALF_UP);
            BigDecimal perDayBefore = before.divide(BigDecimal.valueOf(28), 2, RoundingMode.HALF_UP);
            BigDecimal uplift = perDaySeason.subtract(perDayBefore).multiply(BigDecimal.valueOf(100))
                .divide(perDayBefore, 0, RoundingMode.HALF_UP);
            if (uplift.compareTo(MIN_UPLIFT) < 0) {
                continue;
            }
            List<Map<String, Object>> top = jdbc.queryForList(
                "select coalesce(p.name, max(ii.descricao)) as produto, sum(ii.quantidade) as qtd from invoice_items ii "
                    + "join invoices i on i.id = ii.invoice_id left join products p on p.id = ii.product_id "
                    + "where i.market_id = :m and i.data_emissao >= :a and i.data_emissao < :b "
                    + "group by ii.product_id, p.name order by sum(ii.valor_total) desc limit 5",
                new MapSqlParameterSource().addValue("m", marketId).addValue("a", Timestamp.valueOf(start.atStartOfDay()))
                    .addValue("b", Timestamp.valueOf(end.plusDays(1).atStartOfDay())));
            StringBuilder body = new StringBuilder(w.title()).append(' ').append(w.proximityLabel().toLowerCase())
                .append(". No ano passado, nessa temporada, a loja vendeu ").append(ComprasAgent.money(perDaySeason))
                .append(" por dia, ").append(uplift).append("% acima das 4 semanas anteriores (")
                .append(ComprasAgent.money(perDayBefore)).append(" por dia).");
            if (!top.isEmpty()) {
                body.append("\nO que mais vendeu nesse período:");
                for (Map<String, Object> t : top) {
                    body.append("\n• ").append(t.get("produto")).append(": ")
                        .append(ComprasAgent.integer(ComprasAgent.decimal(t.get("qtd")))).append(" un.");
                }
            }
            body.append("\nVale conferir o estoque desses itens e o pedido dos próximos dias.");
            Map<String, Object> numbers = new LinkedHashMap<>();
            numbers.put("diasParaComecar", w.distanceDays());
            numbers.put("vendaPorDiaNaTemporada", perDaySeason);
            numbers.put("vendaPorDiaAntes", perDayBefore);
            numbers.put("altaPercent", uplift);
            BigDecimal extra = perDaySeason.subtract(perDayBefore).multiply(BigDecimal.valueOf(seasonDays));
            out.add(new AgentSignal(name(), "CENARIO", w.key(), w.title() + ": venda costuma subir " + uplift + "%",
                body.toString(), numbers, Map.of("temporada", w.key()), extra.signum() > 0 ? extra : null, false,
                w.key() + "|" + start.getYear()));
        }
        return out;
    }

    private BigDecimal revenue(UUID marketId, LocalDate from, LocalDate toExclusive) {
        BigDecimal v = jdbc.queryForObject("select coalesce(sum(valor_total), 0) from invoices where market_id = :m "
                + "and data_emissao >= :a and data_emissao < :b",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", Timestamp.valueOf(from.atStartOfDay()))
                .addValue("b", Timestamp.valueOf(toExclusive.atStartOfDay())), BigDecimal.class);
        return v == null ? BigDecimal.ZERO : v;
    }
}
