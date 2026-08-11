package com.pdv2cloud.service.metric;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Fórmulas canônicas das métricas de inteligência comercial do Mercadoflow.
 *
 * MOTIVO DE EXISTIR: antes desta classe, a mesma métrica era calculada de duas
 * formas diferentes em serviços diferentes, e o supermercadista via números
 * conflitantes para o mesmo produto em telas diferentes:
 *
 *   - velocity: AdvancedAnalyticsService dividia por DIAS COM VENDA, enquanto
 *     WorkingCapitalService dividia por DIAS DA JANELA. Um produto que vendeu
 *     10 unidades em 2 dias de uma janela de 90 aparecia como 5,0/dia numa tela
 *     e 0,11/dia na outra — 45× de diferença.
 *   - momentum: um usava EMA(7)/SMA(28) sobre RECEITA, o outro média simples
 *     de 7/28 dias sobre QUANTIDADE.
 *
 * Toda métrica nova deve nascer aqui. Serviços não devem reimplementar fórmula.
 *
 * As definições vencedoras foram escolhidas pelo critério de correção, não de
 * antiguidade — cada uma está justificada no Javadoc do método.
 */
public final class MetricDefinitions {

    private MetricDefinitions() {
    }

    // ── Velocity ─────────────────────────────────────────────────────────────

    /**
     * Velocidade de venda em unidades/dia sobre a JANELA INTEIRA.
     *
     * Definição canônica (herdada do WorkingCapitalService): dividir pelos dias
     * da janela, não pelos dias com venda. Um produto que vendeu 10 unidades em
     * 2 dias de 90 gira 0,11/dia — não 5/dia. Dividir por dias-com-venda mede
     * "intensidade quando vende", que não serve para reposição: é justamente o
     * produto de venda esporádica que pareceria girar rápido.
     *
     * @param quantitySold quantidade total vendida na janela
     * @param windowDays   duração da janela em dias
     */
    public static BigDecimal dailyVelocity(BigDecimal quantitySold, long windowDays) {
        if (quantitySold == null || windowDays <= 0) {
            return BigDecimal.ZERO.setScale(4, RoundingMode.HALF_UP);
        }
        return quantitySold.divide(BigDecimal.valueOf(windowDays), 4, RoundingMode.HALF_UP);
    }

    /** Variante primitiva, para os caminhos que já trabalham em double. */
    public static double dailyVelocity(double quantitySold, long windowDays) {
        return windowDays > 0 ? quantitySold / windowDays : 0.0;
    }

    // ── Momentum ─────────────────────────────────────────────────────────────

    /** Teto do momentum: acima disso o número vira ruído de série curta. */
    public static final double MOMENTUM_CAP = 3.0;

    /** Momentum neutro, usado quando não há base de comparação. */
    public static final double MOMENTUM_NEUTRAL = 1.0;

    /**
     * Momentum = EMA(7) / SMA(28) da série diária, limitado a [0, 3].
     *
     * Definição canônica (herdada do AdvancedAnalyticsService): a média
     * exponencial responde mais rápido à virada recente do que a média simples
     * de 7 dias usada pelo WorkingCapitalService, que é o ponto da métrica.
     *
     * &gt; 1 significa aceleração; &lt; 1, desaceleração.
     *
     * A série deve estar ordenada por data crescente e conter um ponto por dia
     * COM VENDA (dias sem venda não aparecem) — é assim que ambos os serviços
     * já a montavam.
     */
    public static double momentum(List<Double> dailySeries) {
        if (dailySeries == null || dailySeries.isEmpty()) {
            return MOMENTUM_NEUTRAL;
        }
        double ema7 = ema(dailySeries, 7);
        double sma28 = sma(dailySeries, 28);
        return sma28 > 0 ? Math.min(MOMENTUM_CAP, ema7 / sma28) : MOMENTUM_NEUTRAL;
    }

    /**
     * Média móvel exponencial dos últimos {@code period * 3} pontos.
     *
     * O look-back limitado evita que um pico muito antigo continue pesando na
     * EMA por toda a janela de 90 dias.
     */
    public static double ema(List<Double> series, int period) {
        if (series == null || series.isEmpty()) return 0;
        double k = 2.0 / (period + 1);
        double ema = series.get(0);
        int start = Math.max(0, series.size() - period * 3);
        for (int i = start; i < series.size(); i++) {
            ema = series.get(i) * k + ema * (1 - k);
        }
        return ema;
    }

    /** Média móvel simples dos últimos {@code period} pontos da série. */
    public static double sma(List<Double> series, int period) {
        if (series == null || series.isEmpty()) return 0;
        int from = Math.max(0, series.size() - period);
        double sum = 0;
        int count = 0;
        for (int i = from; i < series.size(); i++) {
            sum += series.get(i);
            count++;
        }
        return count > 0 ? sum / count : 0;
    }

    // ── Turnover band ────────────────────────────────────────────────────────

    /**
     * Faixa de giro RELATIVA ao portfólio da loja (HIGH / MEDIUM / LOW).
     *
     * Substitui os cortes fixos anteriores (≥12 un/dia = HIGH, ≥4 = MEDIUM), que
     * aplicavam a mesma régua a açougue e a eletroportátil: num mercado pequeno
     * nenhum item alcançava 12/dia e tudo virava LOW, tornando a classificação
     * inútil. Percentil do portfólio é como o ABC do capital já funciona, o que
     * também torna as duas leituras coerentes entre si.
     *
     * Corte: top 20% = HIGH, 20–60% = MEDIUM, resto = LOW.
     *
     * @param velocity           velocidade do produto
     * @param portfolioVelocities velocidades de todos os produtos da janela,
     *                            em qualquer ordem
     */
    public static String turnoverBand(double velocity, List<Double> portfolioVelocities) {
        if (portfolioVelocities == null || portfolioVelocities.isEmpty()) {
            return "LOW";
        }
        long total = portfolioVelocities.size();
        long below = portfolioVelocities.stream().filter(v -> v < velocity).count();
        double percentile = (double) below / total;

        if (percentile >= 0.80) return "HIGH";
        if (percentile >= 0.40) return "MEDIUM";
        return "LOW";
    }

    // ── Health score ─────────────────────────────────────────────────────────

    /**
     * Score composto de saúde do produto, 0–100 (definição preservada):
     *   40 pts — tendência de receita, limitada a [-50%, +50%]
     *   30 pts — consistência: dias com venda / dias da janela
     *   20 pts — momentum (EMA7/SMA28), limitado a 2,0
     *   10 pts — bônus de tendência positiva
     *
     * Devolve {@code null} quando o produto não teve venda na janela: score zero
     * significaria "muito ruim", e o correto é "sem dado".
     */
    public static Double healthScore(double trendPercentage, double velocity,
                                     int salesDays, long windowDays, Double momentum) {
        if (velocity <= 0) return null;

        double trendComponent = Math.min(40, Math.max(0, (trendPercentage + 50) / 100.0 * 40));
        double consistencyComponent = windowDays > 0
            ? Math.min(30, (double) salesDays / windowDays * 30)
            : 0;
        double momentumComponent = momentum != null ? Math.min(20, momentum * 10) : 10;
        double bonusComponent = trendPercentage > 0 ? 10 : 0;

        double raw = trendComponent + consistencyComponent + momentumComponent + bonusComponent;
        return Math.min(100, Math.max(0, raw));
    }

    // ── Coeficiente de variação (XYZ) ────────────────────────────────────────

    /**
     * Coeficiente de variação: dispersão relativa à média.
     * Base da classe XYZ (X = previsível, Z = errático).
     */
    public static double coefficientOfVariation(double stddev, double mean) {
        return mean > 0 ? stddev / mean : 0.0;
    }
}
