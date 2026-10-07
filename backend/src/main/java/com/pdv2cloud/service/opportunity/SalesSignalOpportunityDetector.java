package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.service.intelligence.MarketPriceComparisonDetector;
import com.pdv2cloud.service.intelligence.SalesAnomalyDetector;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Sinais de venda que não são por produto: anomalia diária da loja e preço
 * acima do mercado.
 *
 * Os dois compartilham este detector porque nenhum vem do portfólio — um olha a
 * loja como série temporal, o outro cruza com observação externa de preço.
 */
@Component
public class SalesSignalOpportunityDetector implements OpportunityDetector {

    /** Anomalia envelhece rápido: queda de ontem exige ação hoje, não semana que vem. */
    private static final int ANOMALY_VALIDITY_DAYS = 7;

    /** Teto de produtos com preço acima do mercado por rodada. */
    private static final int PRICE_LIMIT = 15;

    private final SalesAnomalyDetector salesAnomalyDetector;
    private final MarketPriceComparisonDetector priceComparisonDetector;

    public SalesSignalOpportunityDetector(
        SalesAnomalyDetector salesAnomalyDetector,
        MarketPriceComparisonDetector priceComparisonDetector
    ) {
        this.salesAnomalyDetector = salesAnomalyDetector;
        this.priceComparisonDetector = priceComparisonDetector;
    }

    @Override
    public String name() {
        return "sinais-de-venda";
    }

    @Override
    public List<DetectedOpportunity> detect(UUID marketId) {
        List<DetectedOpportunity> out = new ArrayList<>();

        for (SalesAnomalyDetector.SalesAnomaly a : salesAnomalyDetector.detect(marketId)) {
            out.add(fromAnomaly(a));
        }
        // Preço da vizinhança (só Paraná): acima da faixa, abaixo da faixa e abaixo do custo.
        for (MarketPriceComparisonDetector.PriceComparison p
                : priceComparisonDetector.detect(marketId, PRICE_LIMIT)) {
            out.add(fromPrice(p));
        }
        return out;
    }

    private DetectedOpportunity fromAnomaly(SalesAnomalyDetector.SalesAnomaly anomaly) {
        boolean below = "ABAIXO".equals(anomaly.direction());

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("data", anomaly.date().toString());
        evidence.put("receitaRealizada", anomaly.actualRevenue());
        evidence.put("receitaEsperada", anomaly.expectedRevenue());
        evidence.put("desvioPercent", anomaly.deviationPercent());
        evidence.put("zScore", anomaly.zScore());
        evidence.put("transacoes", anomaly.transactions());

        // Queda pesa mais que alta: perda exige acao, alta merece entendimento.
        double priority = (below ? 75.0 : 45.0)
            + Math.min(20.0, Math.abs(anomaly.zScore().doubleValue()) * 4);

        return new DetectedOpportunity(
            "ANOMALIA:" + anomaly.date(),
            "ANOMALIA_DE_VENDAS",
            "ANOMALIA",
            null,
            null,
            below ? "Queda atípica de vendas em " + anomaly.date()
                  : "Pico de vendas em " + anomaly.date(),
            anomaly.description(),
            evidence,
            anomaly.actualRevenue().subtract(anomaly.expectedRevenue()).abs(),
            null,
            BigDecimal.valueOf(Math.min(100, priority)).setScale(2, RoundingMode.HALF_UP),
            anomaly.date().plusDays(ANOMALY_VALIDITY_DAYS).atStartOfDay()
        );
    }

    private DetectedOpportunity fromPrice(MarketPriceComparisonDetector.PriceComparison c) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("fonte", "Menor Preço, do Nota Paraná (lojas a até 10 km)");
        evidence.put("precoPraticado", c.ownPrice());
        evidence.put("medianaMercado", c.marketMedianPrice());
        evidence.put("faixaDe", c.p25Price());
        evidence.put("faixaAte", c.p75Price());
        evidence.put("menorPrecoObservado", c.marketMinPrice());
        evidence.put("lojaMaisBarata", c.cheapestStore());
        evidence.put("distanciaKm", c.cheapestDistanceKm());
        evidence.put("acimaPercent", c.abovePercent());
        evidence.put("observacoes", c.observations());
        evidence.put("precoSugerido", c.suggestedPrice());
        evidence.put("custo", c.unitCost());
        evidence.put("quantidade30d", c.quantitySold());
        evidence.put("impacto", c.revenueAtRisk());
        if (c.lastObservedAt() != null) {
            evidence.put("ultimaObservacao", c.lastObservedAt().toString());
        }

        String type;
        String title;
        double priority;
        switch (c.direction()) {
            case ABAIXO -> {
                type = "PRECO_ABAIXO_DA_VIZINHANCA";
                title = String.format("Margem na mesa: %s está abaixo da vizinhança", c.name());
                priority = Math.min(85.0, 50.0 + Math.abs(c.abovePercent().doubleValue()));
            }
            case ABAIXO_DO_CUSTO -> {
                type = "VIZINHANCA_ABAIXO_DO_CUSTO";
                title = String.format("A vizinhança vende %s abaixo do seu custo", c.name());
                priority = 70.0;
            }
            default -> {
                type = "PRECO_ACIMA_DO_MERCADO";
                title = String.format("Preço %.0f%% acima da vizinhança: %s", c.abovePercent(), c.name());
                priority = Math.min(85.0, 45.0 + c.abovePercent().doubleValue());
            }
        }

        return new DetectedOpportunity(
            "PRECO:" + c.productId(),
            type,
            "PRECO",
            c.productId(),
            title,
            c.description(),
            evidence,
            c.revenueAtRisk(),
            null,
            BigDecimal.valueOf(priority).setScale(2, RoundingMode.HALF_UP)
        );
    }
}
