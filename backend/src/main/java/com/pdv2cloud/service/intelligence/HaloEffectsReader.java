package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.ProductHaloEffect;
import com.pdv2cloud.repository.ProductHaloEffectRepository;
import com.pdv2cloud.service.PromoIntelligenceService.HaloEffect;
import com.pdv2cloud.service.PromoIntelligenceService.HaloTarget;
import com.pdv2cloud.service.PromoIntelligenceService.TrafficDriver;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura do efeito halo, SEMPRE da versão materializada.
 *
 * O cálculo on-line do halo é o mais caro do sistema: para cada um de até 40
 * drivers, um SQL com 5 CTEs sobre 180 dias. Ele só roda de madrugada, no
 * ProductIntelligenceJob, que grava `product_halo_effects`.
 *
 * Antes havia um fallback on-line para loja sem halo gravado ou janela
 * diferente de 180 dias. Em produção esse fallback rodava dentro das telas e da
 * detecção de 5 em 5 minutos e chegava a prender a conexão por minutos. Sem halo
 * gravado, a lista vem vazia até a próxima madrugada.
 */
@Service
@Slf4j
public class HaloEffectsReader {

    /** Quantos alvos acompanham cada driver no ranking. */
    private static final int MAX_TARGETS_PER_DRIVER = 5;

    /** Janela materializada — ver ProductIntelligenceMaterializer. */
    private static final int MATERIALIZED_WINDOW_DAYS = 180;

    private final ProductHaloEffectRepository repository;

    public HaloEffectsReader(ProductHaloEffectRepository repository) {
        this.repository = repository;
    }

    /** Efeitos halo do mercado (driver → target). */
    @Transactional(readOnly = true)
    public List<HaloEffect> haloEffects(UUID marketId, int windowDays) {
        List<ProductHaloEffect> rows = repository.findPositiveByMarket(marketId);
        if (rows.isEmpty()) {
            log.debug("Sem halo materializado para o mercado {}; aguarda o job noturno", marketId);
        }
        return rows.stream().map(this::toHaloEffect).toList();
    }

    /**
     * Ranking de produtos tracionadores, agregando os efeitos por driver.
     *
     * A agregação é feita aqui em vez de no SQL porque a ordenação por receita
     * incremental total precisa somar todos os alvos de cada driver — e a lista
     * já vem pequena da tabela materializada.
     */
    @Transactional(readOnly = true)
    public List<TrafficDriver> trafficDrivers(UUID marketId, int windowDays) {
        List<ProductHaloEffect> rows = repository.findPositiveByMarket(marketId);
        if (rows.isEmpty()) {
            return List.of();
        }

        Map<UUID, DriverAccumulator> byDriver = new LinkedHashMap<>();
        for (ProductHaloEffect row : rows) {
            byDriver
                .computeIfAbsent(
                    row.getDriverProduct().getId(),
                    id -> new DriverAccumulator(row.getDriverProduct().getName()))
                .add(row);
        }

        List<TrafficDriver> drivers = new ArrayList<>(byDriver.size());
        byDriver.forEach((productId, acc) -> drivers.add(acc.toTrafficDriver(productId)));
        drivers.sort(Comparator.comparing(TrafficDriver::totalIncrementalRevenue).reversed());
        return drivers;
    }

    private HaloEffect toHaloEffect(ProductHaloEffect row) {
        return new HaloEffect(
            row.getDriverProduct().getId(),
            row.getDriverProduct().getName(),
            row.getTargetProduct().getId(),
            row.getTargetProduct().getName(),
            row.getTargetPromoVelocity(),
            row.getTargetNormalVelocity(),
            row.getHaloLiftPercent(),
            row.getIncrementalRevenue(),
            row.getCoOccurrenceCount() != null ? row.getCoOccurrenceCount() : 0,
            row.getPromoDaysObserved() != null ? row.getPromoDaysObserved() : 0,
            row.getConfidence(),
            row.getWindowDays() != null ? row.getWindowDays() : MATERIALIZED_WINDOW_DAYS
        );
    }

    private static final class DriverAccumulator {
        private final String driverName;
        private final List<HaloTarget> targets = new ArrayList<>();
        private BigDecimal totalIncremental = BigDecimal.ZERO;
        private BigDecimal liftSum = BigDecimal.ZERO;
        private int liftCount = 0;

        DriverAccumulator(String driverName) {
            this.driverName = driverName;
        }

        void add(ProductHaloEffect row) {
            BigDecimal incremental = row.getIncrementalRevenue() != null
                ? row.getIncrementalRevenue()
                : BigDecimal.ZERO;
            totalIncremental = totalIncremental.add(incremental);

            if (row.getHaloLiftPercent() != null) {
                liftSum = liftSum.add(row.getHaloLiftPercent());
                liftCount++;
            }
            targets.add(new HaloTarget(
                row.getTargetProduct().getId(),
                row.getTargetProduct().getName(),
                row.getHaloLiftPercent(),
                incremental
            ));
        }

        TrafficDriver toTrafficDriver(UUID productId) {
            List<HaloTarget> top = targets.stream()
                .sorted(Comparator.comparing(
                    (HaloTarget t) -> t.incrementalRevenue() != null
                        ? t.incrementalRevenue()
                        : BigDecimal.ZERO).reversed())
                .limit(MAX_TARGETS_PER_DRIVER)
                .toList();

            BigDecimal averageLift = liftCount > 0
                ? liftSum.divide(BigDecimal.valueOf(liftCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

            return new TrafficDriver(
                productId,
                driverName,
                targets.size(),
                totalIncremental.setScale(2, RoundingMode.HALF_UP),
                averageLift,
                top
            );
        }
    }
}
