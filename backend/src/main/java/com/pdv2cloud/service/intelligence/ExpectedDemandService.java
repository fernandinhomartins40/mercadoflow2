package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.DemandForecast;
import com.pdv2cloud.repository.DemandForecastRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demanda esperada por produto para um horizonte de dias.
 *
 * PROBLEMA QUE RESOLVE (auditoria §13, gravidade ALTA): o `MLPredictionJob`
 * calcula Holt-Winters com tendência, fator de dia da semana e intervalo de
 * confiança de 90%, grava tudo em `demand_forecasts`… e o cálculo de compra
 * ignora completamente esse trabalho, usando a média simples da janela de 90
 * dias. O sistema mantinha DOIS números de "demanda esperada" que nunca se
 * falavam — e usava o pior dos dois para decidir compra.
 *
 * A previsão é superior à média para reposição por um motivo concreto: ela
 * enxerga tendência e sazonalidade semanal. Um produto em queda consistente tem
 * média alta e futuro baixo; comprar pela média compra estoque a mais
 * exatamente no item que está morrendo.
 *
 * DEGRADAÇÃO: quando não há previsão para o produto — item novo, fora do top-100
 * que o job cobre, ou job desligado —, o chamador usa a média como antes. O
 * forecast melhora a decisão onde existe, e nunca a impede.
 */
@Service
public class ExpectedDemandService {

    private final DemandForecastRepository forecastRepository;

    public ExpectedDemandService(DemandForecastRepository forecastRepository) {
        this.forecastRepository = forecastRepository;
    }

    /**
     * Demanda prevista por produto para os próximos {@code horizonDays} dias.
     *
     * @return mapa produto → demanda acumulada no horizonte; produtos sem
     *         previsão simplesmente não aparecem
     */
    @Transactional(readOnly = true)
    public Map<UUID, ExpectedDemand> forHorizon(UUID marketId, int horizonDays) {
        if (horizonDays <= 0) return Map.of();

        LocalDate today = LocalDate.now();
        LocalDate until = today.plusDays(horizonDays);

        List<DemandForecast> forecasts =
            forecastRepository.findByMarketIdAndForecastDateBetweenOrderByForecastDateAsc(
                marketId, today, until);

        Map<UUID, Accumulator> byProduct = new HashMap<>();
        for (DemandForecast f : forecasts) {
            if (f.getProduct() == null || f.getPredictedQuantity() == null) continue;
            byProduct
                .computeIfAbsent(f.getProduct().getId(), id -> new Accumulator())
                .add(f);
        }

        Map<UUID, ExpectedDemand> out = new HashMap<>(byProduct.size());
        byProduct.forEach((productId, acc) -> out.put(productId, acc.toExpectedDemand(horizonDays)));
        return out;
    }

    /**
     * Demanda esperada acumulada num horizonte, com a faixa do intervalo de
     * confiança do modelo.
     *
     * @param totalQuantity  soma das previsões diárias no horizonte
     * @param lowQuantity    limite inferior do IC — cenário conservador
     * @param highQuantity   limite superior do IC — usado para risco de ruptura
     * @param daysCovered    quantos dias do horizonte têm previsão de fato
     * @param dailyAverage   demanda média diária implícita na previsão
     */
    public record ExpectedDemand(
        BigDecimal totalQuantity,
        BigDecimal lowQuantity,
        BigDecimal highQuantity,
        int daysCovered,
        BigDecimal dailyAverage
    ) {
        /**
         * Cobertura do horizonte: com previsão para poucos dias do período
         * pedido, o total subestima a demanda e não deve substituir a média.
         */
        public boolean covers(int horizonDays) {
            return horizonDays > 0 && daysCovered >= horizonDays * 0.7;
        }
    }

    private static final class Accumulator {
        private BigDecimal total = BigDecimal.ZERO;
        private BigDecimal low = BigDecimal.ZERO;
        private BigDecimal high = BigDecimal.ZERO;
        private int days = 0;

        void add(DemandForecast f) {
            BigDecimal predicted = f.getPredictedQuantity();
            total = total.add(predicted);
            // Sem IC gravado, o próprio ponto previsto vale como limite: é
            // melhor do que assumir incerteza zero ou infinita.
            low = low.add(f.getConfidenceLow() != null ? f.getConfidenceLow() : predicted);
            high = high.add(f.getConfidenceHigh() != null ? f.getConfidenceHigh() : predicted);
            days++;
        }

        ExpectedDemand toExpectedDemand(int horizonDays) {
            BigDecimal dailyAverage = days > 0
                ? total.divide(BigDecimal.valueOf(days), 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
            return new ExpectedDemand(
                total.setScale(3, RoundingMode.HALF_UP),
                low.setScale(3, RoundingMode.HALF_UP),
                high.setScale(3, RoundingMode.HALF_UP),
                days,
                dailyAverage
            );
        }
    }
}
