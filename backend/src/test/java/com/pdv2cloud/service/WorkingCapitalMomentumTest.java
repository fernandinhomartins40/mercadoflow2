package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.service.metric.MetricDefinitions;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A unificação do momentum, que era divergência aberta desde a Fase 1.
 *
 * O {@code WorkingCapitalService} usava avg(7d)/avg(28d) de QUANTIDADE enquanto
 * a tela de produto usava EMA(7)/SMA(28) de RECEITA. O mesmo produto exibia
 * dois momentums diferentes — e o do capital aparece no texto de
 * {@code buildReason}, que o lojista lê.
 *
 * O que destravou foi trazer a série diária junto do agregado via
 * {@code array_agg}. Estes testes fixam a conversão do array do Postgres, que é
 * a parte nova e a que quebraria silenciosamente se o tipo da coluna mudasse.
 */
class WorkingCapitalMomentumTest {

    /**
     * O Postgres devolve {@code numeric[]}, que o JDBC materializa como
     * {@code BigDecimal[]}. Verificado contra um PostgreSQL 16 real com o
     * schema das 50 migrations.
     */
    @Test
    void converteArrayDeNumericDoPostgres() throws Exception {
        List<Double> series = invokeReadDailySeries(new BigDecimal[] {
            BigDecimal.valueOf(10.5), BigDecimal.valueOf(20), BigDecimal.valueOf(30.25)
        });

        assertEquals(List.of(10.5, 20.0, 30.25), series);
    }

    /**
     * Array nulo acontece de verdade: produto sem nenhuma venda na janela. Tem
     * de virar lista vazia, não null — o momentum canônico trata vazio como
     * neutro, mas um null viraria NPE no cálculo de todo produto parado.
     */
    @Test
    void arrayNuloViraListaVaziaNaoNull() throws Exception {
        List<Double> series = invokeReadDailySeries(null);

        assertNotNull(series);
        assertTrue(series.isEmpty());
        assertEquals(MetricDefinitions.MOMENTUM_NEUTRAL,
            MetricDefinitions.momentum(series), 0.0001);
    }

    /** Entradas nulas dentro do array são descartadas, não viram zero. */
    @Test
    void elementosNulosNoArraySaoIgnorados() throws Exception {
        List<Double> series = invokeReadDailySeries(new BigDecimal[] {
            BigDecimal.valueOf(10), null, BigDecimal.valueOf(30)
        });

        assertEquals(List.of(10.0, 30.0), series);
    }

    /**
     * A ordem da série importa: EMA pesa os pontos finais. Invertê-la trocaria
     * "acelerando" por "desacelerando".
     *
     * O SQL usa {@code array_agg(... order by sale_date)}; este teste prova que
     * a fórmula de fato reage à ordem, para que remover aquele {@code order by}
     * não passe despercebido.
     */
    @Test
    void aOrdemDaSerieMudaOMomentum() {
        List<Double> subindo = List.of(10.0, 10.0, 10.0, 10.0, 30.0, 40.0, 50.0);
        List<Double> descendo = List.of(50.0, 40.0, 30.0, 10.0, 10.0, 10.0, 10.0);

        assertTrue(MetricDefinitions.momentum(subindo)
            > MetricDefinitions.momentum(descendo));
    }

    /** Venda estável dá momentum ~1: nem acelerando nem desacelerando. */
    @Test
    void vendaEstavelDaMomentumNeutro() {
        List<Double> estavel = java.util.Collections.nCopies(30, 100.0);

        assertEquals(1.0, MetricDefinitions.momentum(estavel), 0.05);
    }

    private List<Double> invokeReadDailySeries(BigDecimal[] values) throws Exception {
        Method method = WorkingCapitalService.class
            .getDeclaredMethod("readDailySeries", java.sql.Array.class);
        method.setAccessible(true);

        java.sql.Array array = values == null ? null : new FakeArray(values);
        @SuppressWarnings("unchecked")
        List<Double> result = (List<Double>) method.invoke(null, array);
        return result;
    }

    /** java.sql.Array mínimo: só getArray() é usado pela conversão. */
    private static class FakeArray implements java.sql.Array {
        private final Object[] values;

        FakeArray(Object[] values) {
            this.values = values;
        }

        @Override
        public Object getArray() {
            return values;
        }

        @Override public String getBaseTypeName() { return "numeric"; }
        @Override public int getBaseType() { return java.sql.Types.NUMERIC; }
        @Override public Object getArray(java.util.Map<String, Class<?>> map) { return values; }
        @Override public Object getArray(long index, int count) { return values; }
        @Override public Object getArray(long i, int c, java.util.Map<String, Class<?>> m) {
            return values;
        }
        @Override public java.sql.ResultSet getResultSet() { return null; }
        @Override public java.sql.ResultSet getResultSet(java.util.Map<String, Class<?>> m) {
            return null;
        }
        @Override public java.sql.ResultSet getResultSet(long index, int count) { return null; }
        @Override public java.sql.ResultSet getResultSet(
            long i, int c, java.util.Map<String, Class<?>> m) {
            return null;
        }
        @Override public void free() { }
    }
}
