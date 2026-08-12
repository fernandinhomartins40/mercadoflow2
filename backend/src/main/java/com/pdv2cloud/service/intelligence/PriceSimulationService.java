package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.dto.ProductPromoEffectivenessDTO;
import com.pdv2cloud.service.PromoEffectivenessService;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Simulação de preço: "se eu baixar 8%, o que acontece?".
 *
 * A auditoria (§19) registrou a elasticidade como "calculada e não usada para
 * recomendação de preço". O {@code PromoEffectivenessService} já mede
 * Δquantidade% ÷ Δpreço% a partir das promoções que a loja de fato fez — este
 * serviço projeta o efeito de um desconto novo usando essa medida.
 *
 * <b>O que separa isto de um chute:</b> a elasticidade vem do histórico REAL do
 * produto naquela loja, não de uma tabela de categoria. Um produto que nunca
 * entrou em promoção não tem elasticidade medida, e a simulação diz isso em vez
 * de inventar um número.
 *
 * <b>Três limites assumidos e informados na resposta:</b>
 *
 * <ol>
 *   <li>a elasticidade é local — vale perto dos descontos já praticados, não
 *       para extrapolação (simular −50% num produto que só teve −10% de
 *       histórico é sair da faixa observada);</li>
 *   <li>não há canibalização: o modelo não sabe que o concorrente da prateleira
 *       ao lado vai perder venda;</li>
 *   <li>a margem depende do custo cadastrado. Sem custo, a projeção de margem
 *       não é calculada — nunca estimada.</li>
 * </ol>
 */
@Service
@Slf4j
public class PriceSimulationService {

    /** Janela de apuração da elasticidade. A mesma da tela de efetividade. */
    private static final int WINDOW_DAYS = 180;

    /**
     * Além disto, o desconto simulado está longe do que a loja já praticou e a
     * elasticidade medida deixa de valer. Não impede simular — sinaliza.
     */
    private static final double EXTRAPOLATION_FACTOR = 2.0;

    /** Elasticidade abaixo (em módulo) disto: o produto quase não reage. */
    private static final double INELASTIC_THRESHOLD = 0.5;

    private final PromoEffectivenessService promoEffectivenessService;
    private final CapitalMetricsReader capitalMetricsReader;

    public PriceSimulationService(
        PromoEffectivenessService promoEffectivenessService,
        CapitalMetricsReader capitalMetricsReader
    ) {
        this.promoEffectivenessService = promoEffectivenessService;
        this.capitalMetricsReader = capitalMetricsReader;
    }

    /**
     * O resultado de uma simulação.
     *
     * @param confiavel      há elasticidade medida no histórico do produto
     * @param extrapolando   o desconto pedido está fora da faixa já praticada
     * @param ressalvas      o que o lojista precisa saber antes de decidir
     */
    public record PriceSimulation(
        UUID productId,
        String productName,
        BigDecimal precoAtual,
        BigDecimal precoSimulado,
        BigDecimal descontoPercent,
        BigDecimal elasticidade,
        BigDecimal descontoMedioJaPraticado,
        BigDecimal quantidadeDiariaAtual,
        BigDecimal quantidadeDiariaProjetada,
        BigDecimal variacaoQuantidadePercent,
        BigDecimal receitaDiariaAtual,
        BigDecimal receitaDiariaProjetada,
        BigDecimal variacaoReceitaPercent,
        BigDecimal margemDiariaAtual,
        BigDecimal margemDiariaProjetada,
        BigDecimal variacaoMargemPercent,
        boolean confiavel,
        boolean extrapolando,
        String veredito,
        List<String> ressalvas
    ) { }

    /**
     * Simula um desconto sobre o preço atual de um produto.
     *
     * @param discountPercent desconto positivo em pontos percentuais (8 = −8%)
     */
    public Optional<PriceSimulation> simulate(
        UUID marketId, UUID productId, BigDecimal discountPercent
    ) {
        if (productId == null || discountPercent == null) {
            return Optional.empty();
        }
        double discount = discountPercent.doubleValue();
        if (discount <= 0 || discount >= 90) {
            return Optional.empty();
        }

        ProductPromoEffectivenessDTO promo = promoEffectivenessService
            .analyzeMarket(marketId, WINDOW_DAYS).stream()
            .filter(p -> productId.equals(p.getProductId()))
            .findFirst()
            .orElse(null);

        CapitalMetric capital = capitalMetricsReader.forProduct(marketId, productId, 90);
        if (capital == null) {
            return Optional.empty();
        }

        List<String> ressalvas = new ArrayList<>();

        BigDecimal currentPrice = capital.unitPrice();
        if (currentPrice == null || currentPrice.signum() <= 0) {
            return Optional.empty();
        }

        /*
         * A elasticidade vem do histórico REAL do produto nesta loja. Sem
         * promoção anterior não há medida — e aí a simulação assume reação
         * neutra (−1,0: cada 1% de desconto vende 1% a mais), avisando que é
         * suposição. Inventar um número específico seria pior que assumir o
         * caso neutro e dizer que é isso.
         */
        boolean measured = promo != null
            && promo.getPriceElasticity() != null
            && promo.getPriceElasticity().signum() != 0
            && !"INSUFFICIENT_DATA".equals(promo.getClassification());

        double elasticity = measured
            ? Math.abs(promo.getPriceElasticity().doubleValue())
            : 1.0;

        if (!measured) {
            ressalvas.add("Este produto não tem histórico de promoção suficiente. "
                + "A projeção assume reação média (cada 1% de desconto vende 1% a mais) "
                + "— trate como estimativa grosseira.");
        }

        // Fora da faixa já praticada, a elasticidade medida deixa de valer.
        double practiced = promo != null && promo.getAvgDiscountPercent() != null
            ? Math.abs(promo.getAvgDiscountPercent().doubleValue()) : 0;
        boolean extrapolating = measured && practiced > 0
            && discount > practiced * EXTRAPOLATION_FACTOR;
        if (extrapolating) {
            ressalvas.add(String.format(
                "A loja nunca passou de %.0f%% de desconto neste produto. "
                    + "Acima disso a reação é imprevisível — o número perde precisão.",
                practiced));
        }

        // ── Projeção ──
        double qtyChangePercent = elasticity * discount;
        BigDecimal currentQty = nz(capital.dailyVelocity());
        BigDecimal projectedQty = currentQty
            .multiply(BigDecimal.valueOf(1 + qtyChangePercent / 100));

        BigDecimal newPrice = currentPrice
            .multiply(BigDecimal.valueOf(1 - discount / 100))
            .setScale(2, RoundingMode.HALF_UP);

        BigDecimal currentRevenue = currentQty.multiply(currentPrice);
        BigDecimal projectedRevenue = projectedQty.multiply(newPrice);

        // ── Margem: só com custo cadastrado ──
        BigDecimal currentMargin = null;
        BigDecimal projectedMargin = null;
        BigDecimal marginChange = null;

        BigDecimal unitCost = capital.unitCost();
        boolean hasRealCost = unitCost != null && unitCost.signum() > 0
            && !"MARGIN_ESTIMATE".equals(capital.costSource());

        if (hasRealCost) {
            currentMargin = currentQty.multiply(currentPrice.subtract(unitCost));
            projectedMargin = projectedQty.multiply(newPrice.subtract(unitCost));
            marginChange = percentChange(currentMargin, projectedMargin);

            if (newPrice.compareTo(unitCost) <= 0) {
                ressalvas.add("Neste desconto o preço fica ABAIXO do custo: "
                    + "cada unidade vendida dá prejuízo.");
            }
        } else {
            ressalvas.add("Sem custo cadastrado para este produto, o efeito na margem "
                + "não pode ser calculado — só o efeito em volume e receita.");
        }

        if (elasticity < INELASTIC_THRESHOLD) {
            ressalvas.add("Este produto reage pouco a desconto: o histórico mostra que "
                + "baixar o preço quase não muda o volume vendido.");
        }
        ressalvas.add("A projeção não considera que o desconto pode roubar venda de "
            + "produtos parecidos na mesma prateleira.");

        BigDecimal revenueChange = percentChange(currentRevenue, projectedRevenue);

        return Optional.of(new PriceSimulation(
            productId,
            capital.name(),
            currentPrice.setScale(2, RoundingMode.HALF_UP),
            newPrice,
            discountPercent.setScale(1, RoundingMode.HALF_UP),
            BigDecimal.valueOf(elasticity).setScale(2, RoundingMode.HALF_UP),
            practiced > 0 ? BigDecimal.valueOf(practiced).setScale(1, RoundingMode.HALF_UP) : null,
            scale(currentQty, 2),
            scale(projectedQty, 2),
            BigDecimal.valueOf(qtyChangePercent).setScale(1, RoundingMode.HALF_UP),
            scale(currentRevenue, 2),
            scale(projectedRevenue, 2),
            revenueChange,
            scale(currentMargin, 2),
            scale(projectedMargin, 2),
            marginChange,
            measured,
            extrapolating,
            verdict(revenueChange, marginChange, hasRealCost),
            ressalvas
        ));
    }

    /**
     * O veredito em uma frase.
     *
     * A margem manda quando existe: receita subindo com margem caindo é o modo
     * de falha clássico do desconto — vende mais e ganha menos, que é
     * exatamente o que o lojista não percebe olhando só o faturamento.
     */
    private String verdict(BigDecimal revenueChange, BigDecimal marginChange, boolean hasCost) {
        if (hasCost && marginChange != null) {
            if (marginChange.signum() > 0) {
                return "Compensa: o volume extra cobre o desconto e a margem total sobe.";
            }
            if (marginChange.doubleValue() < -20) {
                return "Não compensa: a margem cai bem mais do que o volume compensa.";
            }
            return "Compensa só se o objetivo for girar estoque: a margem total cai, "
                + "mas você vende mais unidades.";
        }
        if (revenueChange == null) {
            return "Sem dados suficientes para um veredito.";
        }
        return revenueChange.signum() > 0
            ? "A receita tende a subir. Sem o custo cadastrado, não dá para dizer se "
                + "a margem acompanha."
            : "A receita tende a cair: o volume extra não cobre o desconto.";
    }

    private static BigDecimal percentChange(BigDecimal from, BigDecimal to) {
        if (from == null || to == null || from.signum() == 0) {
            return null;
        }
        return to.subtract(from)
            .multiply(BigDecimal.valueOf(100))
            .divide(from.abs(), 1, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal scale(BigDecimal v, int scale) {
        return v == null ? null : v.setScale(scale, RoundingMode.HALF_UP);
    }
}
