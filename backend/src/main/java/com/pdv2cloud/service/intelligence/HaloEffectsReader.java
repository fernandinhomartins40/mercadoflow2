package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.ProductHaloEffect;
import com.pdv2cloud.repository.ProductHaloEffectRepository;
import com.pdv2cloud.service.PromoIntelligenceService;
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
 * Leitura do efeito halo, preferindo a versão MATERIALIZADA.
 *
 * O cálculo on-line do halo era o mais caro do sistema: para cada um de até 40
 * drivers, um SQL com 5 CTEs, sem cache, a cada abertura da aba de inteligência
 * de promoções. Além do custo, o ranking podia mudar entre dois cliques, o que
 * mina a confiança em uma recomendação.
 *
 * Agora o caminho normal é ler `product_halo_effects`, gravada de madrugada pelo
 * ProductIntelligenceJob. O fallback para o cálculo on-line permanece, pelo
 * mesmo motivo do capital: loja nova ou job desligado devem deixar a tela lenta,
 * nunca vazia.
 */
@Service
@Slf4j
public class HaloEffectsReader {

    /** Quantos alvos acompanham cada driver no ranking. */
    private static final int MAX_TARGETS_PER_DRIVER = 5;

    /** Janela materializada — ver ProductIntelligenceMaterializer. */
    private static final int MATERIALIZED_WINDOW_DAYS = 180;

    private final ProductHaloEffectRepository repository;
    private final PromoIntelligenceService promoIntelligenceService;

    public HaloEffectsReader(
        ProductHaloEffectRepository repository,
        PromoIntelligenceService promoIntelligenceService
    ) {
        this.repository = repository;
        this.promoIntelligenceService = promoIntelligenceService;
    }

    /** Efeitos halo do mercado (driver → target). */
    @Transactional(readOnly = true)
    public List<HaloEffect> haloEffects(UUID marketId, int windowDays) {
        if (windowDays > 0 && windowDays != MATERIALIZED_WINDOW_DAYS) {
            return promoIntelligenceService.computeHaloEffects(marketId, windowDays);
        }

        List<ProductHaloEffect> rows = repository.findPositiveByMarket(marketId);
        if (rows.isEmpty()) {
            log.debug("Sem halo materializado para o mercado {}; calculando on-line", marketId);
            return promoIntelligenceService.computeHaloEffects(marketId, windowDays);
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
        if (windowDays > 0 && windowDays != MATERIALIZED_WINDOW_DAYS) {
            return promoIntelligenceService.rankTrafficDrivers(marketId, windowDays);
        }

        List<ProductHaloEffect> rows = repository.findPositiveByMarket(marketId);
        if (rows.isEmpty()) {
            log.debug("Sem halo materializado para o mercado {}; ranqueando on-line", marketId);
            return promoIntelligenceService.rankTrafficDrivers(marketId, windowDays);
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
