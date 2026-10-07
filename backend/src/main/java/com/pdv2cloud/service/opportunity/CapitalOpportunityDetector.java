package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Capital parado e excesso de estoque.
 *
 * Migra para o modelo de oportunidade os vereditos REDUZIR e LIQUIDAR do
 * WorkingCapitalService. INVEST e MANTER não viram oportunidade: são o estado
 * saudável e não pedem decisão — um feed que lista o que está certo esconde o
 * que está errado.
 *
 * Também detecta OPORTUNIDADE_DE_COMPRA: produto saudável cuja cobertura caiu
 * abaixo do ponto de reposição. Essa é a face positiva do mesmo cálculo e a que
 * mais se aproxima do propósito do produto — orientar a compra.
 */
@Component
public class CapitalOpportunityDetector implements OpportunityDetector {

    private static final int WINDOW_DAYS = 90;

    /** Abaixo disso a cobertura é curta o bastante para virar urgência. */
    private static final double LOW_COVERAGE_DAYS = 7.0;

    /** Sem esta confiança no estoque, não se afirma excesso, parado nem quanto comprar. */
    static final double MIN_STOCK_CONFIDENCE = 0.30;

    private final CapitalMetricsReader capitalMetricsReader;
    private final org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc;

    public CapitalOpportunityDetector(CapitalMetricsReader capitalMetricsReader,
                                      org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc) {
        this.capitalMetricsReader = capitalMetricsReader;
        this.jdbc = jdbc;
    }

    /** Maior quantidade das últimas compras de cada produto: base do teto de bom senso. */
    private java.util.Map<UUID, BigDecimal> lastPurchases(UUID marketId) {
        java.util.Map<UUID, BigDecimal> out = new java.util.HashMap<>();
        jdbc.query("select product_id, max(quantity_purchased) as q from ( "
                + "  select product_id, quantity_purchased, row_number() over (partition by product_id order by purchased_at desc) as n "
                + "  from purchase_price_history where market_id = :m and quantity_purchased > 0) x where n <= 3 group by product_id",
            new org.springframework.jdbc.core.namedparam.MapSqlParameterSource("m", marketId),
            rs -> { out.put(rs.getObject("product_id", UUID.class), rs.getBigDecimal("q")); });
        return out;
    }

    @Override
    public String name() {
        return "capital";
    }

    @Override
    public List<DetectedOpportunity> detect(UUID marketId) {
        List<CapitalMetric> portfolio = capitalMetricsReader.portfolio(marketId, WINDOW_DAYS);
        List<DetectedOpportunity> out = new ArrayList<>();
        java.util.Map<UUID, BigDecimal> last = lastPurchases(marketId);

        for (CapitalMetric m : portfolio) {
            boolean stockKnown = m.inventoryUnits() != null && m.inventoryConfidence() != null
                && m.inventoryConfidence().doubleValue() >= MIN_STOCK_CONFIDENCE;
            if (!stockKnown) {
                // Sem estoque conhecido não há excesso, parado nem quantidade a comprar
                // para afirmar (F0, 07/10/2026: 466 "reduzir compra" com certeza 0).
                // A desaceleração continua visível no Giro do Início, como informação.
                continue;
            }
            if (m.capitalStatus() == CapitalStatus.LIQUIDAR && m.inventoryUnits() == null) {
                // "Liquidar" afirma mercadoria parada; sem estoque conhecido isso
                // seria inventar (auditoria 06/10/2026). Fica só o sinal de giro.
                continue;
            }
            boolean relevant = "A".equals(m.abcClass()) || "B".equals(m.abcClass()) || m.inventoryUnits() != null;
            if ((m.capitalStatus() == CapitalStatus.LIQUIDAR || m.capitalStatus() == CapitalStatus.REDUZIR) && !relevant) {
                // Cauda (curva C) sem estoque conhecido: "comprar menos" de milhares
                // de itens de venda esporádica é ruído, não decisão.
                continue;
            }
            if (m.capitalStatus() == CapitalStatus.LIQUIDAR
                || m.capitalStatus() == CapitalStatus.REDUZIR) {
                out.add(frozenCapital(m));
            } else if (needsReplenishment(m)) {
                out.add(replenishment(m, last.get(m.productId())));
            }
        }
        return out;
    }

    /**
     * Vale comprar quando o produto gira, o capital não está sobrando e a
     * cobertura já caiu abaixo do ponto de reposição.
     *
     * A checagem de coverageDays não-nula importa: sem estoque estimado
     * confiável, sugerir compra seria chutar.
     */
    private boolean needsReplenishment(CapitalMetric m) {
        return m.suggestedOrderUnits() != null
            && m.suggestedOrderUnits().compareTo(BigDecimal.ONE) >= 0
            && m.suggestedOrderUnits().signum() > 0
            && m.coverageDays() != null
            && m.coverageDays().doubleValue() <= LOW_COVERAGE_DAYS
            && m.dailyVelocity() != null
            && m.dailyVelocity().signum() > 0;
    }

    private DetectedOpportunity frozenCapital(CapitalMetric m) {
        boolean liquidar = m.capitalStatus() == CapitalStatus.LIQUIDAR;

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("classeAbc", m.abcClass());
        evidence.put("classeXyz", m.xyzClass());
        evidence.put("giroDiario", m.dailyVelocity());
        evidence.put("coberturaDias", m.coverageDays());
        evidence.put("gmroi", m.gmroi());
        evidence.put("riscoEstagnacao", m.stagnationRisk());
        evidence.put("valorEstoque", m.inventoryValue());
        evidence.put("confiancaEstoque", m.inventoryConfidence());

        return new DetectedOpportunity(
            "CAPITAL:" + m.productId(),
            liquidar ? "CAPITAL_PARADO" : "EXCESSO_DE_ESTOQUE",
            "CAPITAL",
            m.productId(),
            (liquidar ? "Liquidar: " : "Reduzir compra: ") + m.name(),
            m.capitalReason(),
            evidence,
            m.inventoryValue(),
            m.inventoryConfidence(),
            normalizePriority(m.priorityScore())
        );
    }

    /**
     * Teto de bom senso: no máximo o maior entre 2x a maior das últimas compras
     * e 30 dias de venda. Acima disso a conta está se apoiando em estoque que
     * não confere (o "635 un. de arroz 5 kg" da auditoria de 07/10/2026).
     */
    static BigDecimal capQuantity(BigDecimal suggested, BigDecimal lastPurchase, BigDecimal dailyVelocity) {
        if (suggested == null) return null;
        BigDecimal byPurchase = lastPurchase == null ? BigDecimal.ZERO : lastPurchase.multiply(BigDecimal.valueOf(2));
        BigDecimal byDemand = dailyVelocity == null ? BigDecimal.ZERO : dailyVelocity.multiply(BigDecimal.valueOf(30));
        BigDecimal cap = byPurchase.max(byDemand);
        BigDecimal q = cap.signum() > 0 ? suggested.min(cap) : suggested;
        return q.setScale(0, RoundingMode.CEILING);
    }

    private DetectedOpportunity replenishment(CapitalMetric m, BigDecimal lastPurchase) {
        BigDecimal qty = capQuantity(m.suggestedOrderUnits(), lastPurchase, m.dailyVelocity());
        boolean capped = m.suggestedOrderUnits() != null && qty != null
            && qty.compareTo(m.suggestedOrderUnits().setScale(0, RoundingMode.CEILING)) < 0;
        BigDecimal cost = m.unitCost();
        BigDecimal price = m.unitPrice();
        // Gasto (o que sai do caixa) e ganho (a margem que a compra traz ao vender) separados:
        // a fila ordena por ganho, não pelo tamanho do pedido.
        BigDecimal spend = cost != null && qty != null ? qty.multiply(cost).setScale(2, RoundingMode.HALF_UP) : m.suggestedOrderValue();
        BigDecimal margin = cost != null && price != null && qty != null && price.compareTo(cost) > 0
            ? qty.multiply(price.subtract(cost)).setScale(2, RoundingMode.HALF_UP) : null;

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("giroDiario", m.dailyVelocity());
        evidence.put("coberturaDias", m.coverageDays());
        evidence.put("pontoReposicao", m.reorderPointUnits());
        evidence.put("quantidadeSugerida", qty);
        evidence.put("quantidadeCalculada", m.suggestedOrderUnits());
        evidence.put("limitadaPeloBomSenso", capped);
        evidence.put("ultimaCompraMaior", lastPurchase);
        evidence.put("valorSugerido", spend);
        evidence.put("margemEsperada", margin);
        evidence.put("custoEstimado", "MARGIN_ESTIMATE".equals(m.costSource()));
        evidence.put("precoVenda", price);
        evidence.put("custoUnitario", cost);
        evidence.put("classeAbc", m.abcClass());
        evidence.put("confiancaEstoque", m.inventoryConfidence());

        String descricao = String.format(java.util.Locale.forLanguageTag("pt-BR"),
            "Estoque para %.0f dia(s) com venda de %.1f un. por dia.",
            m.coverageDays().doubleValue(), m.dailyVelocity().doubleValue());

        // Produto de classe A com pouca cobertura é o que dói mais deixar
        // faltar: concentra receita e a ruptura aparece no caixa no mesmo dia.
        double priority = 60.0
            + ("A".equals(m.abcClass()) ? 25.0 : "B".equals(m.abcClass()) ? 12.0 : 0.0)
            + Math.max(0, (LOW_COVERAGE_DAYS - m.coverageDays().doubleValue()) * 2);

        return new DetectedOpportunity(
            "COMPRA:" + m.productId(),
            "OPORTUNIDADE_DE_COMPRA",
            "CAPITAL",
            m.productId(),
            "Repor estoque: " + m.name(),
            descricao,
            evidence,
            margin,
            m.inventoryConfidence(),
            BigDecimal.valueOf(Math.min(100, priority)).setScale(2, RoundingMode.HALF_UP)
        );
    }

    /** priorityScore do capital é 0–100+; o feed compara tudo em 0–100. */
    private BigDecimal normalizePriority(BigDecimal raw) {
        if (raw == null) return BigDecimal.valueOf(50);
        return raw.min(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
    }
}
