package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compara o preço praticado na loja com as observações de preço do estado.
 *
 * PROBLEMA QUE RESOLVE (auditoria §16 e §20): `AlertType.PRICE_ABOVE_MARKET`
 * existe no enum desde sempre e **nunca foi gerado por nenhum detector**, embora
 * a V21 já colete observações de preço estaduais. O dado estava sendo coletado e
 * jogado fora.
 *
 * A comparação usa a MEDIANA das observações, não a média: uma única loja com
 * preço promocional agressivo distorce a média e faria o sistema acusar preço
 * alto onde ele está normal.
 *
 * Limitações assumidas e sinalizadas ao usuário: as observações têm origem e
 * data próprias, podem ser de outra região do estado e não consideram o
 * posicionamento da loja (um mercado de bairro com atendimento não precisa
 * bater o preço do atacado). Por isso o resultado é apresentado como sinal para
 * conferência, nunca como veredito de que o preço está errado.
 */
@Service
public class MarketPriceComparisonDetector {

    /** Acima deste desvio sobre a mediana, o preço vira sinal. */
    private static final double ABOVE_MARKET_THRESHOLD_PERCENT = 12.0;

    /** Mínimo de observações para a mediana representar o mercado. */
    private static final int MIN_OBSERVATIONS = 3;

    /** Observações mais antigas que isto não valem como referência de preço. */
    private static final int MAX_OBSERVATION_AGE_DAYS = 45;

    /** Janela de vendas usada para apurar o preço praticado. */
    private static final int SALES_WINDOW_DAYS = 30;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public MarketPriceComparisonDetector(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Produtos cujo preço praticado está acima da mediana observada no estado.
     *
     * @param limit teto de resultados, ordenados pelo maior desvio
     */
    @Transactional(readOnly = true)
    public List<PriceComparison> detectAboveMarket(UUID marketId, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("salesSince", LocalDate.now().minusDays(SALES_WINDOW_DAYS).atStartOfDay())
            .addValue("observationsSince", LocalDate.now().minusDays(MAX_OBSERVATION_AGE_DAYS).atStartOfDay())
            .addValue("minObservations", MIN_OBSERVATIONS)
            .addValue("threshold", ABOVE_MARKET_THRESHOLD_PERCENT)
            .addValue("limit", limit > 0 ? limit : 20);

        /*
         * own_price: preço médio efetivamente praticado (ponderado pela venda,
         * não simples, para que o preço do dia de maior volume pese mais).
         * market_price: mediana das observações recentes do estado.
         */
        String sql =
            "with own_price as ( " +
            "  select it.product_id, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as avg_price, " +
            "         sum(it.quantidade) as quantity_sold, " +
            "         sum(it.valor_total) as revenue " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :salesSince " +
            "    and it.product_id is not null " +
            "  group by it.product_id " +
            "  having sum(it.quantidade) > 0 " +
            "), " +
            "market_price as ( " +
            "  select o.product_id, " +
            "         percentile_cont(0.5) within group (order by o.price) as median_price, " +
            "         min(o.price) as min_price, " +
            "         count(*) as observations, " +
            "         max(o.observed_at) as last_observed_at " +
            "  from state_price_observations o " +
            "  where o.observed_at >= :observationsSince " +
            "  group by o.product_id " +
            "  having count(*) >= :minObservations " +
            ") " +
            "select p.id as product_id, p.name, p.image_url, " +
            "       op.avg_price, op.quantity_sold, op.revenue, " +
            "       mp.median_price, mp.min_price, mp.observations, mp.last_observed_at, " +
            "       ((op.avg_price - mp.median_price) / mp.median_price * 100) as above_percent " +
            "from own_price op " +
            "join market_price mp on mp.product_id = op.product_id " +
            "join products p on p.id = op.product_id " +
            "where mp.median_price > 0 " +
            "  and ((op.avg_price - mp.median_price) / mp.median_price * 100) >= :threshold " +
            "order by above_percent desc " +
            "limit :limit";

        List<PriceComparison> out = new ArrayList<>();
        jdbcTemplate.query(sql, params, rs -> {
            BigDecimal ownPrice = rs.getBigDecimal("avg_price");
            BigDecimal medianPrice = rs.getBigDecimal("median_price");
            BigDecimal abovePercent = rs.getBigDecimal("above_percent");
            BigDecimal quantitySold = rs.getBigDecimal("quantity_sold");

            // Receita que se deixaria de faturar ao igualar a mediana — o
            // "custo" de alinhar o preço, que o lojista precisa pesar contra o
            // risco de perder a venda para o concorrente.
            BigDecimal revenueAtRisk = ownPrice.subtract(medianPrice)
                .multiply(quantitySold)
                .setScale(2, RoundingMode.HALF_UP);

            out.add(new PriceComparison(
                UUID.fromString(rs.getString("product_id")),
                rs.getString("name"),
                rs.getString("image_url"),
                ownPrice.setScale(2, RoundingMode.HALF_UP),
                medianPrice.setScale(2, RoundingMode.HALF_UP),
                rs.getBigDecimal("min_price").setScale(2, RoundingMode.HALF_UP),
                abovePercent.setScale(2, RoundingMode.HALF_UP),
                rs.getInt("observations"),
                rs.getTimestamp("last_observed_at") != null
                    ? rs.getTimestamp("last_observed_at").toLocalDateTime().toLocalDate()
                    : null,
                quantitySold.setScale(3, RoundingMode.HALF_UP),
                revenueAtRisk,
                buildDescription(rs.getString("name"), ownPrice, medianPrice, abovePercent,
                    rs.getInt("observations"))
            ));
        });
        return out;
    }

    private String buildDescription(String productName, BigDecimal ownPrice,
                                    BigDecimal medianPrice, BigDecimal abovePercent,
                                    int observations) {
        return String.format(
            "%s está sendo vendido a R$ %.2f, %.0f%% acima da mediana de R$ %.2f observada em %d "
                + "ponto(s) de venda do estado. Confira se o posicionamento é intencional — "
                + "as observações podem ser de outra região e não consideram o perfil da sua loja.",
            productName, ownPrice, abovePercent, medianPrice, observations);
    }

    public record PriceComparison(
        UUID productId,
        String name,
        String imageUrl,
        BigDecimal ownPrice,
        BigDecimal marketMedianPrice,
        BigDecimal marketMinPrice,
        BigDecimal abovePercent,
        int observations,
        LocalDate lastObservedAt,
        BigDecimal quantitySold,
        BigDecimal revenueAtRisk,
        String description
    ) {}
}
