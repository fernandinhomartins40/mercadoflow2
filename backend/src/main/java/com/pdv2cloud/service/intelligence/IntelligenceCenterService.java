package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.AlertService;
import com.pdv2cloud.service.PromoIntelligenceService;
import com.pdv2cloud.service.WorkingCapitalService;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Central de Inteligência v0 — a porta de entrada orientada a decisão.
 *
 * PROBLEMA QUE RESOLVE (auditoria §21.1): hoje a inteligência do Mercadoflow
 * está espalhada em quatro telas com nomes que não sugerem inteligência — o
 * capital de giro vive dentro de "Lista de Compras", os produtos tracionadores
 * dentro de "Promoções", a previsão dentro de "Produtos". Não existe um lugar
 * que responda "o que está acontecendo e o que devo fazer hoje?".
 *
 * O QUE ESTA VERSÃO FAZ: agrega o que JÁ é calculado — alertas, candidatos a
 * promoção e vereditos de capital — num modelo único de oportunidade, com
 * prioridade comparável entre fontes diferentes. Nenhum motor novo, nenhuma
 * tabela nova, nenhum número novo: é a mesma inteligência, num lugar só.
 *
 * O QUE ELA NÃO FAZ (fica para a Fase 3, o Opportunity Engine): persistir as
 * oportunidades, dar-lhes ciclo de vida (NOVA→VISTA→EM_AÇÃO→CONCLUÍDA) e
 * registrar a decisão do usuário. Por isso o feed é recalculado a cada request
 * e nada aqui tem memória.
 */
@Service
public class IntelligenceCenterService {

    /** Quantas oportunidades o feed devolve por padrão. */
    private static final int DEFAULT_FEED_LIMIT = 30;

    /** Janela padrão de análise, alinhada com o resto da inteligência. */
    private static final int DEFAULT_WINDOW_DAYS = 90;

    private final AlertService alertService;
    private final CapitalMetricsReader capitalMetricsReader;
    private final PromoIntelligenceService promoIntelligenceService;
    private final SalesAnomalyDetector salesAnomalyDetector;
    private final MarketPriceComparisonDetector priceComparisonDetector;

    public IntelligenceCenterService(
        AlertService alertService,
        CapitalMetricsReader capitalMetricsReader,
        PromoIntelligenceService promoIntelligenceService,
        SalesAnomalyDetector salesAnomalyDetector,
        MarketPriceComparisonDetector priceComparisonDetector
    ) {
        this.alertService = alertService;
        this.capitalMetricsReader = capitalMetricsReader;
        this.promoIntelligenceService = promoIntelligenceService;
        this.salesAnomalyDetector = salesAnomalyDetector;
        this.priceComparisonDetector = priceComparisonDetector;
    }

    /**
     * Feed priorizado de oportunidades da loja.
     *
     * Cada fonte é tolerante a falha: se a inteligência de promoção estiver
     * indisponível, o feed ainda entrega alertas e capital em vez de devolver
     * erro — uma central que quebra inteira por causa de um pedaço não serve
     * como porta de entrada.
     */
    public IntelligenceFeed getFeed(UUID marketId, int limit) {
        int cap = limit > 0 ? limit : DEFAULT_FEED_LIMIT;
        List<Opportunity> opportunities = new ArrayList<>();

        opportunities.addAll(fromAlerts(marketId));
        opportunities.addAll(fromCapital(marketId));
        opportunities.addAll(fromPromotions(marketId));
        opportunities.addAll(fromAnomalies(marketId));
        opportunities.addAll(fromPriceComparison(marketId));

        opportunities.sort(Comparator.comparing(Opportunity::priorityScore).reversed());

        List<Opportunity> top = opportunities.stream().limit(cap).toList();
        return new IntelligenceFeed(top, buildSummary(opportunities), opportunities.size());
    }

    // ── Alertas ──────────────────────────────────────────────────────────────

    /**
     * Alertas já gerados pelos 8 detectores estatísticos.
     *
     * Só os não lidos entram: um alerta lido já foi visto pelo usuário e não é
     * mais "o que está acontecendo agora".
     */
    private List<Opportunity> fromAlerts(UUID marketId) {
        try {
            return alertService.getAlerts(marketId, null, null, true).stream()
                .map(this::alertToOpportunity)
                .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Opportunity alertToOpportunity(AlertDTO alert) {
        double base = switch (alert.getPriority() != null ? alert.getPriority() : "") {
            case "HIGH" -> 80.0;
            case "MEDIUM" -> 55.0;
            default -> 30.0;
        };

        Map<String, Object> evidence = new LinkedHashMap<>();
        if (alert.getMetadata() != null) {
            evidence.put("metrics", alert.getMetadata());
        }

        return new Opportunity(
            "ALERTA:" + alert.getId(),
            mapAlertType(alert.getType()),
            alert.getTitle(),
            alert.getMessage(),
            alert.getProductId(),
            alert.getProductName(),
            alert.getProductImage(),
            BigDecimal.valueOf(base).setScale(2, RoundingMode.HALF_UP),
            null,
            "ALERTA",
            evidence
        );
    }

    /** Traduz o tipo técnico do alerta para o vocabulário de oportunidade. */
    private String mapAlertType(String alertType) {
        if (alertType == null) return "ATENCAO";
        return switch (alertType) {
            case "ZERO_SALES", "SLOW_MOVING" -> "QUEDA_DE_VENDAS";
            case "LOW_STOCK", "DEMAND_SPIKE" -> "RISCO_DE_RUPTURA";
            case "HIGH_PERFORMING" -> "CRESCIMENTO_DE_VENDAS";
            case "PROMOTION_OPPORTUNITY" -> "OPORTUNIDADE_DE_PROMOCAO";
            case "BASKET_OPPORTUNITY" -> "OPORTUNIDADE_DE_COMBO";
            case "HEALTH_CRITICAL", "MOMENTUM_REVERSAL" -> "PRODUTO_EM_DECLINIO";
            default -> "ATENCAO";
        };
    }

    // ── Capital ──────────────────────────────────────────────────────────────

    /**
     * Vereditos de capital que exigem ação: REDUZIR e LIQUIDAR representam
     * dinheiro parado na prateleira. INVEST e MANTER não viram oportunidade
     * porque não pedem decisão — são o estado saudável.
     */
    private List<Opportunity> fromCapital(UUID marketId) {
        try {
            return capitalMetricsReader.portfolio(marketId, DEFAULT_WINDOW_DAYS).stream()
                .filter(m -> m.capitalStatus() == CapitalStatus.REDUZIR
                          || m.capitalStatus() == CapitalStatus.LIQUIDAR)
                .map(this::capitalToOpportunity)
                .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Opportunity capitalToOpportunity(CapitalMetric metric) {
        boolean liquidar = metric.capitalStatus() == CapitalStatus.LIQUIDAR;

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("classeAbc", metric.abcClass());
        evidence.put("classeXyz", metric.xyzClass());
        evidence.put("giroDiario", metric.dailyVelocity());
        evidence.put("coberturaDias", metric.coverageDays());
        evidence.put("gmroi", metric.gmroi());
        evidence.put("riscoEstagnacao", metric.stagnationRisk());
        evidence.put("confiancaEstoque", metric.inventoryConfidence());

        return new Opportunity(
            "CAPITAL:" + metric.productId(),
            liquidar ? "CAPITAL_PARADO" : "EXCESSO_DE_ESTOQUE",
            (liquidar ? "Liquidar: " : "Reduzir compra: ") + metric.name(),
            metric.capitalReason(),
            metric.productId(),
            metric.name(),
            metric.imageUrl(),
            // priorityScore do capital é 0–100+; normalizado para o feed.
            metric.priorityScore() != null
                ? metric.priorityScore().min(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.valueOf(50),
            metric.inventoryValue(),
            "CAPITAL",
            evidence
        );
    }

    // ── Promoções ────────────────────────────────────────────────────────────

    private List<Opportunity> fromPromotions(UUID marketId) {
        try {
            PromoIntelligenceService.PromoRecommendations recs =
                promoIntelligenceService.recommend(marketId, 180);

            List<Opportunity> out = new ArrayList<>();
            recs.traction().forEach(c -> out.add(promoToOpportunity(c, "PRODUTO_TRACIONADOR")));
            recs.clearance().forEach(c -> out.add(promoToOpportunity(c, "OPORTUNIDADE_DE_PROMOCAO")));
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    private Opportunity promoToOpportunity(PromoIntelligenceService.PromoCandidate candidate, String type) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("precoAtual", candidate.currentPrice());
        evidence.put("descontoSugerido", candidate.suggestedDiscountPercent());
        evidence.put("margemPercent", candidate.marginPercent());
        evidence.put("giroDiario", candidate.dailyVelocity());
        evidence.put("produtosAfetados", candidate.affectedProducts());

        return new Opportunity(
            "PROMO:" + candidate.productId(),
            type,
            "Promover: " + candidate.name(),
            candidate.reason(),
            candidate.productId(),
            candidate.name(),
            candidate.imageUrl(),
            candidate.score() != null
                ? candidate.score().setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.valueOf(50),
            candidate.expectedIncrementalRevenue(),
            "PROMOCAO",
            evidence
        );
    }

    // ── Anomalias de venda ───────────────────────────────────────────────────

    /**
     * Dias fora da curva na venda da loja.
     *
     * Diferente das demais fontes, esta não é por produto: é a loja inteira como
     * série temporal. Uma queda abrupta de faturamento costuma indicar problema
     * operacional (PDV parado, ruptura ampla) que nenhum alerta por produto pega.
     */
    private List<Opportunity> fromAnomalies(UUID marketId) {
        try {
            return salesAnomalyDetector.detect(marketId).stream()
                .map(this::anomalyToOpportunity)
                .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Opportunity anomalyToOpportunity(SalesAnomalyDetector.SalesAnomaly anomaly) {
        boolean below = "ABAIXO".equals(anomaly.direction());

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("data", anomaly.date());
        evidence.put("receitaRealizada", anomaly.actualRevenue());
        evidence.put("receitaEsperada", anomaly.expectedRevenue());
        evidence.put("desvioPercent", anomaly.deviationPercent());
        evidence.put("zScore", anomaly.zScore());
        evidence.put("transacoes", anomaly.transactions());

        // Queda pesa mais que alta: perda exige ação, alta merece entendimento.
        double base = below ? 75.0 : 45.0;
        double magnitude = Math.min(20.0, Math.abs(anomaly.zScore().doubleValue()) * 4);

        return new Opportunity(
            "ANOMALIA:" + anomaly.date(),
            "ANOMALIA_DE_VENDAS",
            below
                ? "Queda atípica de vendas em " + anomaly.date()
                : "Pico de vendas em " + anomaly.date(),
            anomaly.description(),
            null,
            null,
            null,
            BigDecimal.valueOf(base + magnitude).setScale(2, RoundingMode.HALF_UP),
            anomaly.actualRevenue().subtract(anomaly.expectedRevenue()).abs(),
            "ANOMALIA",
            evidence
        );
    }

    // ── Preço vs mercado ─────────────────────────────────────────────────────

    /**
     * Produtos com preço acima da mediana observada no estado.
     *
     * Fecha o alerta `PRICE_ABOVE_MARKET`, que existia no enum desde sempre e
     * nunca havia sido gerado, embora a coleta de preços estaduais já rodasse.
     */
    private List<Opportunity> fromPriceComparison(UUID marketId) {
        try {
            return priceComparisonDetector.detectAboveMarket(marketId, 15).stream()
                .map(this::priceToOpportunity)
                .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Opportunity priceToOpportunity(MarketPriceComparisonDetector.PriceComparison comparison) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("precoPraticado", comparison.ownPrice());
        evidence.put("medianaMercado", comparison.marketMedianPrice());
        evidence.put("menorPrecoObservado", comparison.marketMinPrice());
        evidence.put("acimaPercent", comparison.abovePercent());
        evidence.put("observacoes", comparison.observations());
        evidence.put("ultimaObservacao", comparison.lastObservedAt());

        double priority = Math.min(85.0, 45.0 + comparison.abovePercent().doubleValue());

        return new Opportunity(
            "PRECO:" + comparison.productId(),
            "PRECO_ACIMA_DO_MERCADO",
            String.format("Preço %.0f%% acima do mercado: %s",
                comparison.abovePercent(), comparison.name()),
            comparison.description(),
            comparison.productId(),
            comparison.name(),
            comparison.imageUrl(),
            BigDecimal.valueOf(priority).setScale(2, RoundingMode.HALF_UP),
            comparison.revenueAtRisk(),
            "PRECO",
            evidence
        );
    }

    // ── Resumo ───────────────────────────────────────────────────────────────

    private FeedSummary buildSummary(List<Opportunity> all) {
        Map<String, Long> byType = new LinkedHashMap<>();
        Map<String, Long> bySource = new LinkedHashMap<>();
        BigDecimal totalImpact = BigDecimal.ZERO;

        for (Opportunity o : all) {
            byType.merge(o.type(), 1L, Long::sum);
            bySource.merge(o.source(), 1L, Long::sum);
            if (o.estimatedImpactValue() != null) {
                totalImpact = totalImpact.add(o.estimatedImpactValue());
            }
        }
        return new FeedSummary(
            all.size(),
            byType,
            bySource,
            totalImpact.setScale(2, RoundingMode.HALF_UP)
        );
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    /**
     * Uma oportunidade de negócio, independente da fonte que a detectou.
     *
     * É o modelo comum que a auditoria (§22.3) apontou como ausente: hoje
     * alertas, candidatos e vereditos de capital são três formatos distintos
     * para o mesmo conceito.
     */
    public record Opportunity(
        String id,
        String type,
        String title,
        String description,
        UUID productId,
        String productName,
        String productImage,
        BigDecimal priorityScore,
        BigDecimal estimatedImpactValue,
        String source,
        Map<String, Object> evidence
    ) {}

    public record FeedSummary(
        int total,
        Map<String, Long> byType,
        Map<String, Long> bySource,
        BigDecimal totalEstimatedImpact
    ) {}

    public record IntelligenceFeed(
        List<Opportunity> opportunities,
        FeedSummary summary,
        int totalAvailable
    ) {}
}
