package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.DemandForecast;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.DemandForecastRepository;
import com.pdv2cloud.service.intelligence.ExpectedDemandService.ExpectedDemand;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Regras da demanda esperada — a ponte entre o forecast (que já era calculado e
 * ignorado) e a decisão de compra.
 */
class ExpectedDemandServiceTest {

    private final DemandForecastRepository repository = mock(DemandForecastRepository.class);
    private final ExpectedDemandService service = new ExpectedDemandService(repository);

    private final UUID marketId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();

    private DemandForecast forecast(UUID productId, LocalDate date,
                                    double predicted, Double low, Double high) {
        Product product = new Product();
        product.setId(productId);

        DemandForecast f = new DemandForecast();
        f.setProduct(product);
        f.setForecastDate(date);
        f.setPredictedQuantity(BigDecimal.valueOf(predicted));
        if (low != null) f.setConfidenceLow(BigDecimal.valueOf(low));
        if (high != null) f.setConfidenceHigh(BigDecimal.valueOf(high));
        return f;
    }

    private void givenForecasts(List<DemandForecast> forecasts) {
        when(repository.findByMarketIdAndForecastDateBetweenOrderByForecastDateAsc(
            eq(marketId), any(), any())).thenReturn(forecasts);
    }

    @Test
    @DisplayName("soma as previsões diárias do horizonte")
    void sumsDailyForecasts() {
        LocalDate today = LocalDate.now();
        List<DemandForecast> forecasts = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            forecasts.add(forecast(productId, today.plusDays(i), 5.0, 3.0, 8.0));
        }
        givenForecasts(forecasts);

        Map<UUID, ExpectedDemand> result = service.forHorizon(marketId, 10);
        ExpectedDemand demand = result.get(productId);

        assertEquals(50.0, demand.totalQuantity().doubleValue(), 1e-6, "10 dias x 5 un");
        assertEquals(30.0, demand.lowQuantity().doubleValue(), 1e-6);
        assertEquals(80.0, demand.highQuantity().doubleValue(), 1e-6);
        assertEquals(5.0, demand.dailyAverage().doubleValue(), 1e-6);
        assertEquals(10, demand.daysCovered());
    }

    @Test
    @DisplayName("sem intervalo de confiança, usa o próprio ponto previsto")
    void missingConfidenceFallsBackToPoint() {
        LocalDate today = LocalDate.now();
        givenForecasts(List.of(forecast(productId, today, 7.0, null, null)));

        ExpectedDemand demand = service.forHorizon(marketId, 1).get(productId);

        assertEquals(7.0, demand.lowQuantity().doubleValue(), 1e-6);
        assertEquals(7.0, demand.highQuantity().doubleValue(), 1e-6);
    }

    @Test
    @DisplayName("previsão parcial NÃO cobre o horizonte pedido")
    void partialForecastDoesNotCover() {
        LocalDate today = LocalDate.now();
        List<DemandForecast> forecasts = new ArrayList<>();
        // Só 5 dias de previsão para um horizonte de 28: usar esse total
        // subestimaria a demanda e faria comprar de menos.
        for (int i = 0; i < 5; i++) {
            forecasts.add(forecast(productId, today.plusDays(i), 4.0, null, null));
        }
        givenForecasts(forecasts);

        ExpectedDemand demand = service.forHorizon(marketId, 28).get(productId);

        assertFalse(demand.covers(28), "5 de 28 dias nao pode substituir a media historica");
        assertTrue(demand.covers(5), "para um horizonte de 5 dias a mesma previsao serve");
    }

    @Test
    @DisplayName("cobertura aceita a partir de 70% do horizonte")
    void coverageThreshold() {
        LocalDate today = LocalDate.now();
        List<DemandForecast> forecasts = new ArrayList<>();
        for (int i = 0; i < 21; i++) {
            forecasts.add(forecast(productId, today.plusDays(i), 2.0, null, null));
        }
        givenForecasts(forecasts);

        ExpectedDemand demand = service.forHorizon(marketId, 28).get(productId);

        assertTrue(demand.covers(28), "21 de 28 dias (75%) e cobertura suficiente");
    }

    @Test
    @DisplayName("produto sem previsão não aparece no resultado")
    void productWithoutForecastIsAbsent() {
        givenForecasts(List.of());

        Map<UUID, ExpectedDemand> result = service.forHorizon(marketId, 28);

        assertTrue(result.isEmpty(), "sem previsao o chamador deve cair na media, nao receber zero");
    }

    @Test
    @DisplayName("horizonte inválido devolve vazio sem consultar o banco")
    void invalidHorizonIsSafe() {
        assertTrue(service.forHorizon(marketId, 0).isEmpty());
        assertTrue(service.forHorizon(marketId, -5).isEmpty());
    }

    @Test
    @DisplayName("separa previsões de produtos diferentes")
    void separatesProducts() {
        UUID other = UUID.randomUUID();
        LocalDate today = LocalDate.now();
        givenForecasts(List.of(
            forecast(productId, today, 5.0, null, null),
            forecast(productId, today.plusDays(1), 5.0, null, null),
            forecast(other, today, 100.0, null, null)
        ));

        Map<UUID, ExpectedDemand> result = service.forHorizon(marketId, 2);

        assertEquals(10.0, result.get(productId).totalQuantity().doubleValue(), 1e-6);
        assertEquals(100.0, result.get(other).totalQuantity().doubleValue(), 1e-6);
    }
}
