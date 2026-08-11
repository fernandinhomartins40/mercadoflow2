package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mede se a previsão de demanda acertou.
 *
 * PROBLEMA QUE RESOLVE (auditoria §15 e §21): o `MLPredictionJob` roda
 * Holt-Winters desde sempre e o erro do modelo **nunca foi medido**. Isso é
 * mais grave do que parece: desde a Fase 2 a sugestão de compra usa a previsão
 * no lugar da média — se o modelo erra sistematicamente, toda recomendação
 * construída sobre ele erra junto, e ninguém teria como saber.
 *
 * A métrica é o MAPE (erro percentual absoluto médio), padrão para previsão de
 * demanda no varejo. Guardamos o erro POR OBSERVAÇÃO em vez do agregado, para
 * permitir cortes depois — por produto, por classe, por dia da semana. É assim
 * que se descobre QUE tipo de item o modelo erra, em vez de só saber que erra.
 *
 * Duas decisões de método que mudam o resultado:
 *
 *  1. Dias com venda REAL zero são excluídos do MAPE. |previsto − 0| / 0 é
 *     indefinido, não infinito; incluí-los como erro de 100% inflaria a métrica
 *     e faria um modelo bom parecer ruim numa loja com muitos itens de cauda.
 *  2. Medimos também a cobertura do intervalo de confiança. Um modelo calibrado
 *     acerta a faixa de 90% em ~90% das vezes; muito acima disso significa
 *     intervalo largo demais para ser útil na decisão de compra.
 */
@Service
@Slf4j
public class ForecastAccuracyService {

    /** Só avalia previsões já vencidas, com esta folga para a nota chegar. */
    private static final int SETTLE_DAYS = 2;

    /** Janela de previsões avaliadas por rodada. */
    private static final int LOOKBACK_DAYS = 45;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public ForecastAccuracyService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Compara as previsões vencidas com a venda real e persiste o erro.
     *
     * @return quantas observações foram avaliadas
     */
    @Transactional
    public int evaluate(UUID marketId) {
        LocalDate until = LocalDate.now().minusDays(SETTLE_DAYS);
        LocalDate from = until.minusDays(LOOKBACK_DAYS);

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("from", from)
            .addValue("until", until);

        /*
         * Junta previsão com venda real do mesmo dia. LEFT JOIN em vendas
         * porque "não vendeu" é informação legítima: o modelo previu 10 e saiu
         * 0 é justamente o erro que interessa detectar.
         */
        String sql =
            "insert into forecast_accuracy ( " +
            "    market_id, product_id, forecast_date, predicted_quantity, actual_quantity, " +
            "    absolute_error, percent_error, within_confidence, measured_at) " +
            "select f.market_id, f.product_id, f.forecast_date, " +
            "       f.predicted_quantity, " +
            "       coalesce(v.qty, 0) as actual_quantity, " +
            "       abs(f.predicted_quantity - coalesce(v.qty, 0)) as absolute_error, " +
            // Erro percentual indefinido quando o real e zero — ver Javadoc.
            "       case when coalesce(v.qty, 0) > 0 " +
            "            then round(abs(f.predicted_quantity - v.qty) / v.qty * 100, 2) " +
            "       end as percent_error, " +
            "       case when f.confidence_low is not null and f.confidence_high is not null " +
            "            then coalesce(v.qty, 0) between f.confidence_low and f.confidence_high " +
            "       end as within_confidence, " +
            "       now() " +
            "from demand_forecasts f " +
            "left join ( " +
            "    select it.product_id, cast(i.data_emissao as date) as d, sum(it.quantidade) as qty " +
            "    from invoice_items it join invoices i on i.id = it.invoice_id " +
            "    where i.market_id = :marketId " +
            "      and i.data_emissao >= :from and i.data_emissao < :until + 1 " +
            "      and it.product_id is not null " +
            "    group by it.product_id, cast(i.data_emissao as date) " +
            ") v on v.product_id = f.product_id and v.d = f.forecast_date " +
            "where f.market_id = :marketId " +
            "  and f.forecast_date between :from and :until " +
            "  and f.predicted_quantity is not null " +
            "on conflict (market_id, product_id, forecast_date) do update set " +
            "    predicted_quantity = excluded.predicted_quantity, " +
            "    actual_quantity = excluded.actual_quantity, " +
            "    absolute_error = excluded.absolute_error, " +
            "    percent_error = excluded.percent_error, " +
            "    within_confidence = excluded.within_confidence, " +
            "    measured_at = excluded.measured_at";

        return jdbcTemplate.update(sql, params);
    }

    /** Resumo da acurácia do modelo para a loja. */
    @Transactional(readOnly = true)
    public AccuracySummary summarize(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);

        return jdbcTemplate.queryForObject(
            "select count(*) as observacoes, " +
            "       count(distinct product_id) as produtos, " +
            "       round(avg(percent_error) filter (where percent_error is not null), 2) as mape, " +
            "       round(avg(absolute_error), 3) as mae, " +
            "       round(avg(case when within_confidence then 1.0 else 0.0 end) " +
            "             filter (where within_confidence is not null) * 100, 2) as cobertura_ic " +
            "from forecast_accuracy where market_id = :marketId",
            params,
            (rs, rowNum) -> new AccuracySummary(
                rs.getLong("observacoes"),
                rs.getInt("produtos"),
                rs.getBigDecimal("mape"),
                rs.getBigDecimal("mae"),
                rs.getBigDecimal("cobertura_ic"),
                interpret(rs.getBigDecimal("mape"), rs.getLong("observacoes"))
            )
        );
    }

    /** Produtos em que o modelo mais erra — onde a compra sugerida é menos confiável. */
    @Transactional(readOnly = true)
    public List<ProductAccuracy> worstProducts(UUID marketId, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("limit", limit > 0 ? limit : 20);

        List<ProductAccuracy> out = new ArrayList<>();
        jdbcTemplate.query(
            "select a.product_id, p.name, count(*) as observacoes, " +
            "       round(avg(a.percent_error), 2) as mape, " +
            "       round(avg(a.predicted_quantity), 2) as media_prevista, " +
            "       round(avg(a.actual_quantity), 2) as media_real " +
            "from forecast_accuracy a join products p on p.id = a.product_id " +
            "where a.market_id = :marketId and a.percent_error is not null " +
            "group by a.product_id, p.name " +
            // Menos de 5 observações não caracteriza tendência de erro.
            "having count(*) >= 5 " +
            "order by avg(a.percent_error) desc " +
            "limit :limit",
            params,
            rs -> {
                out.add(new ProductAccuracy(
                    UUID.fromString(rs.getString("product_id")),
                    rs.getString("name"),
                    rs.getInt("observacoes"),
                    rs.getBigDecimal("mape"),
                    rs.getBigDecimal("media_prevista"),
                    rs.getBigDecimal("media_real")
                ));
            });
        return out;
    }

    /**
     * Traduz o MAPE para linguagem de decisão.
     *
     * Os cortes seguem a convenção de previsão de demanda em varejo, e o
     * critério de sucesso do próprio plano (MAPE < 35% nos produtos classe A).
     */
    private String interpret(BigDecimal mape, long observations) {
        if (observations < 30 || mape == null) {
            return "Ainda não há observações suficientes para julgar o modelo. "
                + "A avaliação precisa de algumas semanas de previsões vencidas.";
        }
        double v = mape.doubleValue();
        if (v < 20) {
            return String.format(
                "Erro médio de %.0f%%: a previsão está boa e sustenta bem a sugestão de compra.", v);
        }
        if (v < 35) {
            return String.format(
                "Erro médio de %.0f%%: aceitável para varejo. A sugestão de compra é confiável "
                    + "para produtos de giro estável.", v);
        }
        if (v < 60) {
            return String.format(
                "Erro médio de %.0f%%: alto. A previsão ajuda nos itens regulares, mas para os "
                    + "de demanda irregular vale conferir a sugestão antes de comprar.", v);
        }
        return String.format(
            "Erro médio de %.0f%%: a previsão não está acompanhando a realidade desta loja. "
                + "Trate as sugestões de compra como ponto de partida, não como número final.", v);
    }

    public record AccuracySummary(
        long observations,
        int products,
        BigDecimal mape,
        BigDecimal mae,
        BigDecimal confidenceIntervalCoverage,
        String interpretation
    ) {}

    public record ProductAccuracy(
        UUID productId,
        String name,
        int observations,
        BigDecimal mape,
        BigDecimal averagePredicted,
        BigDecimal averageActual
    ) {}
}
