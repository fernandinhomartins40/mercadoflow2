package com.pdv2cloud.service.metric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Testes de paridade da Metric Layer.
 *
 * Dois objetivos:
 *  1. Congelar as fórmulas canônicas (EMA/SMA/health score foram COPIADAS do
 *     AdvancedAnalyticsService — estes testes provam que a cópia é fiel).
 *  2. Documentar em código a divergência que motivou a consolidação.
 */
class MetricDefinitionsTest {

    private static final double EPS = 1e-9;

    @Nested
    @DisplayName("dailyVelocity")
    class Velocity {

        @Test
        @DisplayName("divide pelos dias da janela, não pelos dias com venda")
        void dividesByWindowDays() {
            // O caso concreto citado no código do WorkingCapitalService:
            // 10 unidades vendidas em 2 dias de uma janela de 90.
            BigDecimal v = MetricDefinitions.dailyVelocity(BigDecimal.valueOf(10), 90);

            assertEquals(0.1111, v.doubleValue(), 1e-4,
                "10 un / 90 dias = 0,11/dia");

            // A definição antiga (10/2 = 5,0) era 45x maior. Se alguém reverter
            // para dias-com-venda, este teste quebra.
            assertTrue(v.doubleValue() < 1.0,
                "velocity nao pode usar dias-com-venda como divisor");
        }

        @Test
        @DisplayName("janela inválida devolve zero em vez de estourar")
        void zeroWindowIsSafe() {
            assertEquals(0.0, MetricDefinitions.dailyVelocity(BigDecimal.TEN, 0).doubleValue(), EPS);
            assertEquals(0.0, MetricDefinitions.dailyVelocity(null, 90).doubleValue(), EPS);
            assertEquals(0.0, MetricDefinitions.dailyVelocity(5.0, 0), EPS);
        }

        @Test
        @DisplayName("variantes BigDecimal e double concordam")
        void variantsAgree() {
            assertEquals(
                MetricDefinitions.dailyVelocity(BigDecimal.valueOf(180), 90).doubleValue(),
                MetricDefinitions.dailyVelocity(180.0, 90),
                1e-4);
        }
    }

    @Nested
    @DisplayName("momentum")
    class Momentum {

        @Test
        @DisplayName("série acelerando devolve momentum > 1")
        void acceleratingSeries() {
            List<Double> series = new ArrayList<>();
            for (int i = 0; i < 28; i++) series.add(10.0);
            for (int i = 0; i < 7; i++) series.add(40.0);

            assertTrue(MetricDefinitions.momentum(series) > 1.0,
                "vendas subindo no fim da serie devem acelerar o momentum");
        }

        @Test
        @DisplayName("série desacelerando devolve momentum < 1")
        void deceleratingSeries() {
            List<Double> series = new ArrayList<>();
            for (int i = 0; i < 28; i++) series.add(40.0);
            for (int i = 0; i < 7; i++) series.add(5.0);

            assertTrue(MetricDefinitions.momentum(series) < 1.0,
                "vendas caindo no fim da serie devem desacelerar o momentum");
        }

        @Test
        @DisplayName("série constante fica próxima de 1 (neutro)")
        void flatSeries() {
            List<Double> series = new ArrayList<>();
            for (int i = 0; i < 40; i++) series.add(20.0);

            assertEquals(1.0, MetricDefinitions.momentum(series), 0.01,
                "serie sem variacao nao acelera nem desacelera");
        }

        @Test
        @DisplayName("respeita o teto de 3,0")
        void respectsCap() {
            List<Double> series = new ArrayList<>();
            for (int i = 0; i < 28; i++) series.add(0.01);
            for (int i = 0; i < 7; i++) series.add(10000.0);

            assertTrue(MetricDefinitions.momentum(series) <= MetricDefinitions.MOMENTUM_CAP + EPS,
                "explosao de venda nao pode passar do teto");
        }

        @Test
        @DisplayName("série vazia ou nula devolve neutro, não zero")
        void emptyIsNeutral() {
            assertEquals(MetricDefinitions.MOMENTUM_NEUTRAL, MetricDefinitions.momentum(List.of()), EPS);
            assertEquals(MetricDefinitions.MOMENTUM_NEUTRAL, MetricDefinitions.momentum(null), EPS);
        }
    }

    @Nested
    @DisplayName("EMA e SMA (paridade com o cálculo original)")
    class MovingAverages {

        /** Réplica literal do computeEma original do AdvancedAnalyticsService. */
        private double legacyEma(List<Double> series, int period) {
            if (series.isEmpty()) return 0;
            double k = 2.0 / (period + 1);
            double ema = series.get(0);
            int start = Math.max(0, series.size() - period * 3);
            for (int i = start; i < series.size(); i++) {
                ema = series.get(i) * k + ema * (1 - k);
            }
            return ema;
        }

        /** Réplica literal do computeSma original do AdvancedAnalyticsService. */
        private double legacySma(List<Double> series, int period) {
            if (series.isEmpty()) return 0;
            int from = Math.max(0, series.size() - period);
            double sum = 0;
            int count = 0;
            for (int i = from; i < series.size(); i++) {
                sum += series.get(i);
                count++;
            }
            return count > 0 ? sum / count : 0;
        }

        @Test
        @DisplayName("EMA/SMA batem exatamente com a implementação anterior")
        void parityWithLegacy() {
            List<Double> series = new ArrayList<>();
            double v = 7.0;
            for (int i = 0; i < 95; i++) {
                v = (v * 37 + 11) % 100;
                series.add(v);
            }

            assertEquals(legacyEma(series, 7), MetricDefinitions.ema(series, 7), EPS,
                "EMA divergiu da formula original");
            assertEquals(legacySma(series, 28), MetricDefinitions.sma(series, 28), EPS,
                "SMA divergiu da formula original");

            double legacyMomentum = legacySma(series, 28) > 0
                ? Math.min(3.0, legacyEma(series, 7) / legacySma(series, 28))
                : 1.0;
            assertEquals(legacyMomentum, MetricDefinitions.momentum(series), EPS,
                "momentum divergiu da formula original");
        }
    }

    @Nested
    @DisplayName("turnoverBand")
    class TurnoverBand {

        @Test
        @DisplayName("classifica por percentil do portfólio, não por corte fixo")
        void relativeToPortfolio() {
            // Mercado pequeno: nenhum produto chega perto de 12 un/dia. Com os
            // cortes fixos antigos, TODOS seriam LOW e a faixa nao diria nada.
            List<Double> smallMarket = List.of(0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0);

            assertEquals("HIGH", MetricDefinitions.turnoverBand(3.0, smallMarket),
                "o produto que mais gira na loja deve ser HIGH mesmo abaixo de 12/dia");
            assertEquals("LOW", MetricDefinitions.turnoverBand(0.1, smallMarket));
        }

        @Test
        @DisplayName("MEDIUM fica na faixa do meio")
        void middleBand() {
            List<Double> portfolio = new ArrayList<>();
            for (int i = 1; i <= 100; i++) portfolio.add((double) i);

            assertEquals("MEDIUM", MetricDefinitions.turnoverBand(50.0, portfolio));
            assertEquals("HIGH", MetricDefinitions.turnoverBand(95.0, portfolio));
            assertEquals("LOW", MetricDefinitions.turnoverBand(5.0, portfolio));
        }

        @Test
        @DisplayName("portfólio vazio devolve LOW sem estourar")
        void emptyPortfolio() {
            assertEquals("LOW", MetricDefinitions.turnoverBand(5.0, List.of()));
            assertEquals("LOW", MetricDefinitions.turnoverBand(5.0, null));
        }
    }

    @Nested
    @DisplayName("healthScore")
    class HealthScore {

        @Test
        @DisplayName("produto sem venda devolve null, não zero")
        void noSalesIsNull() {
            assertNull(MetricDefinitions.healthScore(10.0, 0.0, 0, 90, 1.0),
                "sem venda o score e 'sem dado', nao 'muito ruim'");
        }

        @Test
        @DisplayName("permanece dentro de 0–100 mesmo com entradas extremas")
        void bounded() {
            Double high = MetricDefinitions.healthScore(9999, 50, 90, 90, 3.0);
            Double low = MetricDefinitions.healthScore(-9999, 0.01, 0, 90, 0.0);

            assertTrue(high != null && high <= 100.0, "score nao pode passar de 100");
            assertTrue(low != null && low >= 0.0, "score nao pode ser negativo");
        }

        @Test
        @DisplayName("produto forte pontua mais que produto fraco")
        void strongBeatsWeak() {
            Double strong = MetricDefinitions.healthScore(30.0, 5.0, 85, 90, 1.5);
            Double weak = MetricDefinitions.healthScore(-30.0, 0.5, 10, 90, 0.6);

            assertTrue(strong != null && weak != null && strong > weak);
        }

        @Test
        @DisplayName("bate com a fórmula original componente a componente")
        void parityWithLegacy() {
            double trendPct = 12.5;
            int salesDays = 47;
            int windowDays = 90;
            double momentum = 1.35;

            double trendComponent = Math.min(40, Math.max(0, (trendPct + 50) / 100.0 * 40));
            double consistencyComponent = Math.min(30, (double) salesDays / windowDays * 30);
            double momentumComponent = Math.min(20, momentum * 10);
            double bonusComponent = trendPct > 0 ? 10 : 0;
            double expected = Math.min(100, Math.max(0,
                trendComponent + consistencyComponent + momentumComponent + bonusComponent));

            Double actual = MetricDefinitions.healthScore(trendPct, 2.0, salesDays, windowDays, momentum);

            assertEquals(expected, actual, EPS, "health score divergiu da formula original");
        }
    }

    @Nested
    @DisplayName("coefficientOfVariation")
    class CoefVariation {

        @Test
        @DisplayName("média zero devolve zero em vez de dividir por zero")
        void zeroMeanIsSafe() {
            assertEquals(0.0, MetricDefinitions.coefficientOfVariation(5.0, 0.0), EPS);
        }

        @Test
        @DisplayName("dispersão relativa à média")
        void relativeDispersion() {
            assertEquals(0.5, MetricDefinitions.coefficientOfVariation(5.0, 10.0), EPS);
        }
    }
}
