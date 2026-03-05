package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.ProductPriceEventDTO;
import com.pdv2cloud.model.dto.ProductPriceTimelineDTO;
import com.pdv2cloud.model.dto.ProductPriceTimelinePointDTO;
import com.pdv2cloud.model.dto.ProductPromotionWindowDTO;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.model.entity.PriceEventDirection;
import com.pdv2cloud.model.entity.PriceIntelligenceCheckpoint;
import com.pdv2cloud.model.entity.ProductPriceDailyStat;
import com.pdv2cloud.model.entity.ProductPriceEvent;
import com.pdv2cloud.model.entity.ProductPromotionWindow;
import com.pdv2cloud.model.entity.PromotionWindowStatus;
import com.pdv2cloud.repository.PriceIntelligenceCheckpointRepository;
import com.pdv2cloud.repository.ProductObservationRepository;
import com.pdv2cloud.repository.ProductPriceDailyStatRepository;
import com.pdv2cloud.repository.ProductPriceEventRepository;
import com.pdv2cloud.repository.ProductPromotionWindowRepository;
import com.pdv2cloud.repository.projection.ProductObservationSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PriceIntelligenceService {

    private static final BigDecimal ZERO_MONEY = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    private static final BigDecimal ZERO_PERCENT = BigDecimal.ZERO.setScale(4, RoundingMode.HALF_UP);
    private static final BigDecimal MIN_DYNAMIC_THRESHOLD_RATIO = BigDecimal.valueOf(0.08);
    private static final BigDecimal MAX_DYNAMIC_THRESHOLD_RATIO = BigDecimal.valueOf(0.60);

    @Autowired
    private ProductObservationRepository productObservationRepository;

    @Autowired
    private ProductPriceDailyStatRepository dailyStatRepository;

    @Autowired
    private ProductPriceEventRepository eventRepository;

    @Autowired
    private ProductPromotionWindowRepository promotionWindowRepository;

    @Autowired
    private PriceIntelligenceCheckpointRepository checkpointRepository;

    @Transactional
    public void syncMarket(UUID marketId) {
        LocalDateTime checkpoint = checkpointRepository.findById(marketId)
            .map(PriceIntelligenceCheckpoint::getLastObservedAt)
            .orElse(null);

        List<UUID> changedProducts = productObservationRepository
            .findDistinctProductIdsByMarketIdAndObservedAtAfter(marketId, checkpoint);
        if (changedProducts.isEmpty()) {
            return;
        }

        for (UUID productId : changedProducts) {
            recomputeProduct(marketId, productId);
        }

        LocalDateTime maxObservedAt = productObservationRepository
            .findMaxObservedAtByMarketIdAndObservedAtAfter(marketId, checkpoint);
        if (maxObservedAt != null) {
            PriceIntelligenceCheckpoint entity = checkpointRepository.findById(marketId).orElseGet(() -> {
                PriceIntelligenceCheckpoint created = new PriceIntelligenceCheckpoint();
                created.setMarketId(marketId);
                return created;
            });
            entity.setLastObservedAt(maxObservedAt);
            entity.setUpdatedAt(LocalDateTime.now());
            checkpointRepository.save(entity);
        }
    }

    @Transactional
    public int rebuildMarket(UUID marketId) {
        List<UUID> productIds = productObservationRepository
            .findDistinctProductIdsByMarketIdAndObservedAtAfter(marketId, null);
        for (UUID productId : productIds) {
            recomputeProduct(marketId, productId);
        }

        LocalDateTime maxObservedAt = productObservationRepository
            .findMaxObservedAtByMarketIdAndObservedAtAfter(marketId, null);
        PriceIntelligenceCheckpoint entity = checkpointRepository.findById(marketId).orElseGet(() -> {
            PriceIntelligenceCheckpoint created = new PriceIntelligenceCheckpoint();
            created.setMarketId(marketId);
            return created;
        });
        entity.setLastObservedAt(maxObservedAt);
        entity.setUpdatedAt(LocalDateTime.now());
        checkpointRepository.save(entity);

        return productIds.size();
    }

    @Transactional
    public void recomputeFromInvoice(Invoice invoice) {
        if (invoice == null || invoice.getMarket() == null || invoice.getItems() == null) {
            return;
        }
        Set<UUID> productIds = new HashSet<>();
        invoice.getItems().forEach(item -> {
            if (item.getProduct() != null) {
                productIds.add(item.getProduct().getId());
            }
        });
        for (UUID productId : productIds) {
            recomputeProduct(invoice.getMarket().getId(), productId);
        }
    }

    @Transactional
    public void recomputeProduct(UUID marketId, UUID productId) {
        List<ProductObservationSnapshot> observations = productObservationRepository
            .findSnapshotsByMarketIdAndProductIdOrderByObservedAtAsc(marketId, productId);

        dailyStatRepository.deleteByMarketIdAndProductId(marketId, productId);
        eventRepository.deleteByMarketIdAndProductId(marketId, productId);
        promotionWindowRepository.deleteByMarketIdAndProductId(marketId, productId);

        if (observations.isEmpty()) {
            return;
        }

        List<DailyAggregate> aggregates = buildDailyAggregates(observations);
        BigDecimal dynamicThresholdRatio = computeDynamicThresholdRatio(aggregates);
        BigDecimal dynamicThresholdPercent = toPercent(dynamicThresholdRatio);
        List<DetectedEvent> events = detectEvents(aggregates, dynamicThresholdRatio, dynamicThresholdPercent);
        List<DetectedPromotionWindow> promotionWindows = detectPromotionWindows(
            aggregates,
            dynamicThresholdRatio,
            dynamicThresholdPercent
        );

        LocalDateTime now = LocalDateTime.now();
        List<ProductPriceDailyStat> statEntities = aggregates.stream()
            .map(aggregate -> {
                ProductPriceDailyStat entity = new ProductPriceDailyStat();
                entity.setMarket(newMarketRef(marketId));
                entity.setProduct(newProductRef(productId));
                entity.setStatDate(aggregate.date());
                entity.setWeightedAvgPrice(scaleMoney(aggregate.weightedAvgPrice()));
                entity.setMedianPrice(scaleMoney(aggregate.medianPrice()));
                entity.setMinPrice(scaleMoney(aggregate.minPrice()));
                entity.setMaxPrice(scaleMoney(aggregate.maxPrice()));
                entity.setStdDevPrice(scaleMetric(aggregate.stdDevPrice()));
                entity.setMadPrice(scaleMetric(aggregate.madPrice()));
                entity.setTotalQuantity(scaleQuantity(aggregate.totalQuantity()));
                entity.setTotalRevenue(scaleMoney(aggregate.totalRevenue()));
                entity.setTransactionCount(aggregate.transactionCount());
                entity.setCreatedAt(now);
                entity.setUpdatedAt(now);
                return entity;
            })
            .toList();

        List<ProductPriceEvent> eventEntities = events.stream()
            .map(event -> {
                ProductPriceEvent entity = new ProductPriceEvent();
                entity.setMarket(newMarketRef(marketId));
                entity.setProduct(newProductRef(productId));
                entity.setEventAt(event.eventAt());
                entity.setOldPrice(scaleMoney(event.oldPrice()));
                entity.setNewPrice(scaleMoney(event.newPrice()));
                entity.setDeltaAmount(scaleMoney(event.deltaAmount()));
                entity.setDeltaPercent(scalePercent(event.deltaPercent()));
                entity.setDirection(event.direction());
                entity.setBaselinePrice(scaleMoney(event.baselinePrice()));
                entity.setDynamicThresholdPercent(scalePercent(event.dynamicThresholdPercent()));
                entity.setConfidenceScore(scaleConfidence(event.confidenceScore()));
                entity.setTriggerType(event.triggerType());
                entity.setCreatedAt(now);
                return entity;
            })
            .toList();

        List<ProductPromotionWindow> windowEntities = promotionWindows.stream()
            .map(window -> {
                ProductPromotionWindow entity = new ProductPromotionWindow();
                entity.setMarket(newMarketRef(marketId));
                entity.setProduct(newProductRef(productId));
                entity.setStartAt(window.startAt());
                entity.setEndAt(window.endAt());
                entity.setBaselinePrice(scaleMoney(window.baselinePrice()));
                entity.setPromoPrice(scaleMoney(window.promoPrice()));
                entity.setDiscountPercent(scalePercent(window.discountPercent()));
                entity.setQuantityLiftPercent(scalePercent(window.quantityLiftPercent()));
                entity.setRevenueLiftPercent(scalePercent(window.revenueLiftPercent()));
                entity.setDynamicThresholdPercent(scalePercent(window.dynamicThresholdPercent()));
                entity.setConfidenceScore(scaleConfidence(window.confidenceScore()));
                entity.setStatus(window.status());
                entity.setCreatedAt(now);
                entity.setUpdatedAt(now);
                return entity;
            })
            .toList();

        dailyStatRepository.saveAll(statEntities);
        eventRepository.saveAll(eventEntities);
        promotionWindowRepository.saveAll(windowEntities);
    }

    @Transactional
    public ProductPriceTimelineDTO getProductPriceTimeline(
        UUID marketId,
        UUID productId,
        LocalDate startDate,
        LocalDate endDate
    ) {
        ensureProductPriceHistory(marketId, productId);
        List<ProductPriceDailyStat> points = loadTimelinePoints(marketId, productId, startDate, endDate);
        List<ProductPriceEvent> events = loadEvents(marketId, productId, startDate, endDate);
        List<ProductPromotionWindow> windows = loadPromotionWindows(marketId, productId, startDate, endDate);

        BigDecimal firstPrice = points.isEmpty() ? ZERO_MONEY : points.get(0).getWeightedAvgPrice();
        BigDecimal lastPrice = points.isEmpty() ? ZERO_MONEY : points.get(points.size() - 1).getWeightedAvgPrice();
        LocalDateTime firstVariationAt = events.isEmpty() ? null : events.get(0).getEventAt();
        LocalDateTime lastVariationAt = events.isEmpty() ? null : events.get(events.size() - 1).getEventAt();

        BigDecimal maxIncrease = events.stream()
            .map(ProductPriceEvent::getDeltaPercent)
            .filter(value -> value != null && value.compareTo(BigDecimal.ZERO) > 0)
            .max(Comparator.naturalOrder())
            .orElse(ZERO_PERCENT);
        BigDecimal maxDecrease = events.stream()
            .map(ProductPriceEvent::getDeltaPercent)
            .filter(value -> value != null && value.compareTo(BigDecimal.ZERO) < 0)
            .min(Comparator.naturalOrder())
            .orElse(ZERO_PERCENT);

        BigDecimal dynamicThresholdPercent = events.stream()
            .map(ProductPriceEvent::getDynamicThresholdPercent)
            .filter(value -> value != null)
            .findFirst()
            .orElseGet(() -> toPercent(computeDynamicThresholdRatioFromStats(points)));

        List<ProductPriceTimelinePointDTO> timelinePoints = points.stream()
            .map(stat -> new ProductPriceTimelinePointDTO(
                stat.getStatDate(),
                stat.getWeightedAvgPrice(),
                stat.getMedianPrice(),
                stat.getMinPrice(),
                stat.getMaxPrice(),
                stat.getStdDevPrice(),
                stat.getMadPrice(),
                stat.getTotalQuantity(),
                stat.getTotalRevenue(),
                stat.getTransactionCount()
            ))
            .toList();

        return new ProductPriceTimelineDTO(
            dynamicThresholdPercent,
            firstPrice,
            lastPrice,
            firstVariationAt,
            lastVariationAt,
            maxIncrease,
            maxDecrease,
            windows.size(),
            timelinePoints
        );
    }

    @Transactional
    public List<ProductPriceEventDTO> getProductPriceEvents(
        UUID marketId,
        UUID productId,
        LocalDate startDate,
        LocalDate endDate
    ) {
        ensureProductPriceHistory(marketId, productId);
        return loadEvents(marketId, productId, startDate, endDate).stream()
            .map(event -> new ProductPriceEventDTO(
                event.getId(),
                event.getEventAt(),
                event.getOldPrice(),
                event.getNewPrice(),
                event.getDeltaAmount(),
                event.getDeltaPercent(),
                event.getDirection() != null ? event.getDirection().name() : null,
                event.getBaselinePrice(),
                event.getDynamicThresholdPercent(),
                event.getConfidenceScore(),
                event.getTriggerType()
            ))
            .toList();
    }

    @Transactional
    public List<ProductPromotionWindowDTO> getProductPromotionWindows(
        UUID marketId,
        UUID productId,
        LocalDate startDate,
        LocalDate endDate
    ) {
        ensureProductPriceHistory(marketId, productId);
        return loadPromotionWindows(marketId, productId, startDate, endDate).stream()
            .map(window -> new ProductPromotionWindowDTO(
                window.getId(),
                window.getStartAt(),
                window.getEndAt(),
                window.getBaselinePrice(),
                window.getPromoPrice(),
                window.getDiscountPercent(),
                window.getQuantityLiftPercent(),
                window.getRevenueLiftPercent(),
                window.getDynamicThresholdPercent(),
                window.getConfidenceScore(),
                window.getStatus() != null ? window.getStatus().name() : null
            ))
            .toList();
    }

    private void ensureProductPriceHistory(UUID marketId, UUID productId) {
        if (dailyStatRepository.existsByMarket_IdAndProduct_Id(marketId, productId)) {
            return;
        }
        recomputeProduct(marketId, productId);
    }

    private List<ProductPriceDailyStat> loadTimelinePoints(UUID marketId, UUID productId, LocalDate startDate, LocalDate endDate) {
        if (startDate != null && endDate != null) {
            return dailyStatRepository.findByMarket_IdAndProduct_IdAndStatDateBetweenOrderByStatDateAsc(
                marketId,
                productId,
                startDate,
                endDate
            );
        }
        return dailyStatRepository.findByMarket_IdAndProduct_IdOrderByStatDateAsc(marketId, productId);
    }

    private List<ProductPriceEvent> loadEvents(UUID marketId, UUID productId, LocalDate startDate, LocalDate endDate) {
        if (startDate != null && endDate != null) {
            return eventRepository.findByMarket_IdAndProduct_IdAndEventAtBetweenOrderByEventAtAsc(
                marketId,
                productId,
                startDate.atStartOfDay(),
                endDate.plusDays(1).atStartOfDay().minusNanos(1)
            );
        }
        return eventRepository.findByMarket_IdAndProduct_IdOrderByEventAtAsc(marketId, productId);
    }

    private List<ProductPromotionWindow> loadPromotionWindows(
        UUID marketId,
        UUID productId,
        LocalDate startDate,
        LocalDate endDate
    ) {
        if (startDate != null && endDate != null) {
            return promotionWindowRepository.findByMarket_IdAndProduct_IdAndStartAtBetweenOrderByStartAtAsc(
                marketId,
                productId,
                startDate.atStartOfDay(),
                endDate.plusDays(1).atStartOfDay().minusNanos(1)
            );
        }
        return promotionWindowRepository.findByMarket_IdAndProduct_IdOrderByStartAtAsc(marketId, productId);
    }

    private List<DailyAggregate> buildDailyAggregates(List<ProductObservationSnapshot> observations) {
        Map<LocalDate, DailyAccumulator> buckets = new LinkedHashMap<>();
        for (ProductObservationSnapshot observation : observations) {
            LocalDateTime observedAt = observation.getObservedAt();
            if (observedAt == null) {
                continue;
            }
            LocalDate date = observedAt.toLocalDate();
            DailyAccumulator bucket = buckets.computeIfAbsent(date, ignored -> new DailyAccumulator(date));
            bucket.append(observation);
        }
        return buckets.values().stream().map(DailyAccumulator::toAggregate).toList();
    }

    private List<DetectedEvent> detectEvents(
        List<DailyAggregate> stats,
        BigDecimal dynamicThresholdRatio,
        BigDecimal dynamicThresholdPercent
    ) {
        List<DetectedEvent> events = new ArrayList<>();
        for (int i = 1; i < stats.size(); i++) {
            DailyAggregate previous = stats.get(i - 1);
            DailyAggregate current = stats.get(i);
            BigDecimal oldPrice = previous.weightedAvgPrice();
            BigDecimal newPrice = current.weightedAvgPrice();
            if (oldPrice.compareTo(BigDecimal.ZERO) <= 0 || newPrice.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal deltaRatio = newPrice.subtract(oldPrice).divide(oldPrice, 6, RoundingMode.HALF_UP);
            BigDecimal absDelta = deltaRatio.abs();
            if (absDelta.compareTo(dynamicThresholdRatio) < 0) {
                continue;
            }

            BigDecimal confidence = confidenceForEvent(absDelta, dynamicThresholdRatio, current.totalQuantity(), current.transactionCount());
            events.add(new DetectedEvent(
                current.date().atStartOfDay(),
                oldPrice,
                newPrice,
                newPrice.subtract(oldPrice),
                toPercent(deltaRatio),
                deltaRatio.compareTo(BigDecimal.ZERO) >= 0 ? PriceEventDirection.UP : PriceEventDirection.DOWN,
                oldPrice,
                dynamicThresholdPercent,
                confidence,
                deltaRatio.compareTo(BigDecimal.ZERO) >= 0 ? "PRICE_SPIKE" : "PRICE_DROP"
            ));
        }
        return events;
    }

    private List<DetectedPromotionWindow> detectPromotionWindows(
        List<DailyAggregate> stats,
        BigDecimal dynamicThresholdRatio,
        BigDecimal dynamicThresholdPercent
    ) {
        List<DetectedPromotionWindow> windows = new ArrayList<>();
        if (stats.isEmpty()) {
            return windows;
        }

        BigDecimal promoThresholdRatio = dynamicThresholdRatio.max(MIN_DYNAMIC_THRESHOLD_RATIO);
        BigDecimal promoThresholdPercent = toPercent(promoThresholdRatio);
        List<BigDecimal> rollingBaseline = buildRollingBaseline(stats);

        int startIndex = -1;
        for (int i = 0; i < stats.size(); i++) {
            DailyAggregate current = stats.get(i);
            BigDecimal baseline = rollingBaseline.get(i);
            boolean isPromoDay = isPromotionDay(current, baseline, promoThresholdRatio);

            if (isPromoDay && startIndex < 0) {
                startIndex = i;
            }
            if (!isPromoDay && startIndex >= 0) {
                windows.add(buildPromotionWindow(stats, rollingBaseline, startIndex, i - 1, promoThresholdPercent));
                startIndex = -1;
            }
        }

        if (startIndex >= 0) {
            windows.add(buildPromotionWindow(stats, rollingBaseline, startIndex, stats.size() - 1, promoThresholdPercent));
        }
        return windows;
    }

    private boolean isPromotionDay(DailyAggregate current, BigDecimal baseline, BigDecimal promoThresholdRatio) {
        if (baseline == null || baseline.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        if (current.weightedAvgPrice().compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        BigDecimal discountRatio = baseline
            .subtract(current.weightedAvgPrice())
            .divide(baseline, 6, RoundingMode.HALF_UP);
        return discountRatio.compareTo(promoThresholdRatio) >= 0;
    }

    private List<BigDecimal> buildRollingBaseline(List<DailyAggregate> stats) {
        List<BigDecimal> baselines = new ArrayList<>(stats.size());
        List<BigDecimal> history = new ArrayList<>();
        BigDecimal globalMedian = median(stats.stream().map(DailyAggregate::weightedAvgPrice).toList());

        for (DailyAggregate stat : stats) {
            BigDecimal baseline = history.isEmpty()
                ? globalMedian
                : median(history.subList(Math.max(0, history.size() - 30), history.size()));
            baselines.add(scaleMoney(baseline));
            history.add(stat.weightedAvgPrice());
        }
        return baselines;
    }

    private DetectedPromotionWindow buildPromotionWindow(
        List<DailyAggregate> stats,
        List<BigDecimal> baselines,
        int startIndex,
        int endIndex,
        BigDecimal promoThresholdPercent
    ) {
        List<DailyAggregate> windowDays = stats.subList(startIndex, endIndex + 1);
        List<BigDecimal> baselineSlice = baselines.subList(startIndex, endIndex + 1);

        BigDecimal baselinePrice = scaleMoney(median(baselineSlice));
        BigDecimal promoPrice = scaleMoney(median(windowDays.stream().map(DailyAggregate::weightedAvgPrice).toList()));
        BigDecimal discountPercent = baselinePrice.compareTo(BigDecimal.ZERO) > 0
            ? toPercent(baselinePrice.subtract(promoPrice).divide(baselinePrice, 6, RoundingMode.HALF_UP))
            : ZERO_PERCENT;

        int length = endIndex - startIndex + 1;
        int baselineStart = Math.max(0, startIndex - length);
        List<DailyAggregate> baselineDays = stats.subList(baselineStart, startIndex);

        BigDecimal promoQtyAvg = average(windowDays.stream().map(DailyAggregate::totalQuantity).toList(), 3);
        BigDecimal baselineQtyAvg = average(baselineDays.stream().map(DailyAggregate::totalQuantity).toList(), 3);
        BigDecimal promoRevenueAvg = average(windowDays.stream().map(DailyAggregate::totalRevenue).toList(), 2);
        BigDecimal baselineRevenueAvg = average(baselineDays.stream().map(DailyAggregate::totalRevenue).toList(), 2);

        BigDecimal qtyLiftPercent = calculateLiftPercent(promoQtyAvg, baselineQtyAvg);
        BigDecimal revenueLiftPercent = calculateLiftPercent(promoRevenueAvg, baselineRevenueAvg);

        boolean rebound = hasRebound(stats, endIndex, baselinePrice, promoThresholdPercent);
        PromotionWindowStatus status;
        if (rebound) {
            status = PromotionWindowStatus.CONFIRMED;
        } else if (endIndex < stats.size() - 1) {
            status = PromotionWindowStatus.CLOSED;
        } else {
            status = PromotionWindowStatus.SUSPECTED;
        }

        BigDecimal confidence = confidenceForPromotion(discountPercent, qtyLiftPercent, revenueLiftPercent, rebound);
        return new DetectedPromotionWindow(
            windowDays.get(0).date().atStartOfDay(),
            endIndex < stats.size() - 1 ? windowDays.get(windowDays.size() - 1).date().atTime(LocalTime.of(23, 59, 59)) : null,
            baselinePrice,
            promoPrice,
            discountPercent,
            qtyLiftPercent,
            revenueLiftPercent,
            promoThresholdPercent,
            confidence,
            status
        );
    }

    private boolean hasRebound(List<DailyAggregate> stats, int endIndex, BigDecimal baselinePrice, BigDecimal promoThresholdPercent) {
        if (baselinePrice.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        BigDecimal thresholdRatio = promoThresholdPercent.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
        BigDecimal reboundTarget = baselinePrice.multiply(BigDecimal.ONE.subtract(thresholdRatio.divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP)));
        int reboundLimit = Math.min(stats.size() - 1, endIndex + 7);
        for (int i = endIndex + 1; i <= reboundLimit; i++) {
            if (stats.get(i).weightedAvgPrice().compareTo(reboundTarget) >= 0) {
                return true;
            }
        }
        return false;
    }

    private BigDecimal confidenceForEvent(
        BigDecimal absDeltaRatio,
        BigDecimal dynamicThresholdRatio,
        BigDecimal totalQuantity,
        int transactionCount
    ) {
        BigDecimal ratioScore = absDeltaRatio
            .divide(dynamicThresholdRatio.max(BigDecimal.valueOf(0.0001)), 6, RoundingMode.HALF_UP)
            .min(BigDecimal.valueOf(3));
        BigDecimal qtyScore = totalQuantity.compareTo(BigDecimal.valueOf(50)) >= 0
            ? BigDecimal.valueOf(0.15)
            : totalQuantity.compareTo(BigDecimal.valueOf(10)) >= 0 ? BigDecimal.valueOf(0.08) : BigDecimal.valueOf(0.03);
        BigDecimal txScore = transactionCount >= 20 ? BigDecimal.valueOf(0.15) : transactionCount >= 5 ? BigDecimal.valueOf(0.08) : BigDecimal.valueOf(0.03);
        return BigDecimal.valueOf(0.45)
            .add(ratioScore.multiply(BigDecimal.valueOf(0.12)))
            .add(qtyScore)
            .add(txScore)
            .min(BigDecimal.valueOf(0.99))
            .setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal confidenceForPromotion(
        BigDecimal discountPercent,
        BigDecimal qtyLiftPercent,
        BigDecimal revenueLiftPercent,
        boolean rebound
    ) {
        BigDecimal confidence = BigDecimal.valueOf(0.45);
        if (discountPercent.compareTo(BigDecimal.valueOf(15)) >= 0) {
            confidence = confidence.add(BigDecimal.valueOf(0.18));
        } else if (discountPercent.compareTo(BigDecimal.valueOf(8)) >= 0) {
            confidence = confidence.add(BigDecimal.valueOf(0.12));
        }
        if (qtyLiftPercent.compareTo(BigDecimal.ZERO) > 0) {
            confidence = confidence.add(BigDecimal.valueOf(0.14));
        }
        if (revenueLiftPercent.compareTo(BigDecimal.ZERO) > 0) {
            confidence = confidence.add(BigDecimal.valueOf(0.08));
        }
        if (rebound) {
            confidence = confidence.add(BigDecimal.valueOf(0.12));
        }
        return confidence.min(BigDecimal.valueOf(0.99)).setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal computeDynamicThresholdRatio(List<DailyAggregate> stats) {
        if (stats.size() < 3) {
            return MIN_DYNAMIC_THRESHOLD_RATIO;
        }
        List<BigDecimal> deltas = new ArrayList<>();
        for (int i = 1; i < stats.size(); i++) {
            BigDecimal previous = stats.get(i - 1).weightedAvgPrice();
            BigDecimal current = stats.get(i).weightedAvgPrice();
            if (previous.compareTo(BigDecimal.ZERO) <= 0 || current.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal delta = current.subtract(previous).divide(previous, 6, RoundingMode.HALF_UP).abs();
            deltas.add(delta);
        }
        if (deltas.isEmpty()) {
            return MIN_DYNAMIC_THRESHOLD_RATIO;
        }
        BigDecimal median = median(deltas);
        BigDecimal mad = medianAbsoluteDeviation(deltas, median);
        BigDecimal threshold = median.add(mad.multiply(BigDecimal.valueOf(2)));
        if (threshold.compareTo(MIN_DYNAMIC_THRESHOLD_RATIO) < 0) {
            threshold = MIN_DYNAMIC_THRESHOLD_RATIO;
        }
        if (threshold.compareTo(MAX_DYNAMIC_THRESHOLD_RATIO) > 0) {
            threshold = MAX_DYNAMIC_THRESHOLD_RATIO;
        }
        return threshold.setScale(6, RoundingMode.HALF_UP);
    }

    private BigDecimal computeDynamicThresholdRatioFromStats(List<ProductPriceDailyStat> stats) {
        List<DailyAggregate> transformed = stats.stream()
            .map(point -> new DailyAggregate(
                point.getStatDate(),
                point.getWeightedAvgPrice() != null ? point.getWeightedAvgPrice() : ZERO_MONEY,
                point.getMedianPrice() != null ? point.getMedianPrice() : ZERO_MONEY,
                point.getMinPrice() != null ? point.getMinPrice() : ZERO_MONEY,
                point.getMaxPrice() != null ? point.getMaxPrice() : ZERO_MONEY,
                point.getStdDevPrice() != null ? point.getStdDevPrice() : ZERO_PERCENT,
                point.getMadPrice() != null ? point.getMadPrice() : ZERO_PERCENT,
                point.getTotalQuantity() != null ? point.getTotalQuantity() : BigDecimal.ZERO,
                point.getTotalRevenue() != null ? point.getTotalRevenue() : ZERO_MONEY,
                point.getTransactionCount() != null ? point.getTransactionCount() : 0
            ))
            .toList();
        return computeDynamicThresholdRatio(transformed);
    }

    private BigDecimal medianAbsoluteDeviation(List<BigDecimal> values, BigDecimal median) {
        if (values.isEmpty()) {
            return BigDecimal.ZERO;
        }
        List<BigDecimal> deviations = values.stream()
            .map(value -> value.subtract(median).abs())
            .toList();
        return median(deviations);
    }

    private BigDecimal median(List<BigDecimal> values) {
        if (values.isEmpty()) {
            return BigDecimal.ZERO;
        }
        List<BigDecimal> sorted = new ArrayList<>(values);
        sorted.sort(Comparator.naturalOrder());
        int size = sorted.size();
        if (size % 2 == 1) {
            return sorted.get(size / 2);
        }
        BigDecimal left = sorted.get((size / 2) - 1);
        BigDecimal right = sorted.get(size / 2);
        return left.add(right).divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
    }

    private BigDecimal average(List<BigDecimal> values, int scale) {
        if (values.isEmpty()) {
            return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
        }
        BigDecimal total = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(values.size()), scale, RoundingMode.HALF_UP);
    }

    private BigDecimal calculateLiftPercent(BigDecimal promoAverage, BigDecimal baselineAverage) {
        if (baselineAverage.compareTo(BigDecimal.ZERO) <= 0) {
            return promoAverage.compareTo(BigDecimal.ZERO) > 0
                ? BigDecimal.valueOf(100).setScale(4, RoundingMode.HALF_UP)
                : ZERO_PERCENT;
        }
        return promoAverage
            .subtract(baselineAverage)
            .divide(baselineAverage, 6, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal toPercent(BigDecimal ratio) {
        return ratio.multiply(BigDecimal.valueOf(100)).setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal scaleMoney(BigDecimal value) {
        if (value == null) {
            return ZERO_MONEY;
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal scaleMetric(BigDecimal value) {
        if (value == null) {
            return ZERO_PERCENT;
        }
        return value.setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal scaleQuantity(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(3, RoundingMode.HALF_UP);
        }
        return value.setScale(3, RoundingMode.HALF_UP);
    }

    private BigDecimal scalePercent(BigDecimal value) {
        if (value == null) {
            return ZERO_PERCENT;
        }
        return value.setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal scaleConfidence(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(4, RoundingMode.HALF_UP);
        }
        return value.setScale(4, RoundingMode.HALF_UP);
    }

    private com.pdv2cloud.model.entity.Market newMarketRef(UUID marketId) {
        com.pdv2cloud.model.entity.Market market = new com.pdv2cloud.model.entity.Market();
        market.setId(marketId);
        return market;
    }

    private com.pdv2cloud.model.entity.Product newProductRef(UUID productId) {
        com.pdv2cloud.model.entity.Product product = new com.pdv2cloud.model.entity.Product();
        product.setId(productId);
        return product;
    }

    private record DailyAggregate(
        LocalDate date,
        BigDecimal weightedAvgPrice,
        BigDecimal medianPrice,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        BigDecimal stdDevPrice,
        BigDecimal madPrice,
        BigDecimal totalQuantity,
        BigDecimal totalRevenue,
        int transactionCount
    ) {
    }

    private static class DailyAccumulator {
        private final LocalDate date;
        private final List<BigDecimal> prices = new ArrayList<>();
        private final List<BigDecimal> weightedPrices = new ArrayList<>();
        private final Set<UUID> invoices = new HashSet<>();
        private BigDecimal quantity = BigDecimal.ZERO;
        private BigDecimal revenue = BigDecimal.ZERO;
        private LocalDateTime closeObservedAt;
        private BigDecimal closePrice = BigDecimal.ZERO;

        private DailyAccumulator(LocalDate date) {
            this.date = date;
        }

        private void append(ProductObservationSnapshot observation) {
            BigDecimal price = observation.getNetUnitPrice() != null ? observation.getNetUnitPrice() : observation.getUnitPrice();
            if (price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }
            BigDecimal qty = observation.getQuantity() != null && observation.getQuantity().compareTo(BigDecimal.ZERO) > 0
                ? observation.getQuantity()
                : BigDecimal.ONE;
            BigDecimal lineRevenue = observation.getNetTotalPrice() != null
                ? observation.getNetTotalPrice()
                : observation.getTotalPrice() != null
                    ? observation.getTotalPrice()
                    : price.multiply(qty);

            prices.add(price);
            weightedPrices.add(price.multiply(qty));
            quantity = quantity.add(qty);
            revenue = revenue.add(lineRevenue);
            LocalDateTime observedAt = observation.getObservedAt();
            if (observedAt != null && (closeObservedAt == null || observedAt.isAfter(closeObservedAt))) {
                closeObservedAt = observedAt;
                closePrice = price;
            }
            if (observation.getInvoiceId() != null) {
                invoices.add(observation.getInvoiceId());
            }
        }

        private DailyAggregate toAggregate() {
            BigDecimal weightedAverage = quantity.compareTo(BigDecimal.ZERO) > 0
                ? weightedPrices.stream().reduce(BigDecimal.ZERO, BigDecimal::add).divide(quantity, 6, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
            BigDecimal periodPrice = closePrice.compareTo(BigDecimal.ZERO) > 0 ? closePrice : weightedAverage;
            BigDecimal median = medianStatic(prices);
            BigDecimal min = prices.stream().min(Comparator.naturalOrder()).orElse(BigDecimal.ZERO);
            BigDecimal max = prices.stream().max(Comparator.naturalOrder()).orElse(BigDecimal.ZERO);
            BigDecimal stdDev = stdDevStatic(prices, median);
            BigDecimal mad = madStatic(prices, median);
            return new DailyAggregate(
                date,
                periodPrice,
                median,
                min,
                max,
                stdDev,
                mad,
                quantity,
                revenue,
                invoices.size()
            );
        }

        private static BigDecimal medianStatic(List<BigDecimal> values) {
            if (values.isEmpty()) {
                return BigDecimal.ZERO;
            }
            List<BigDecimal> sorted = new ArrayList<>(values);
            sorted.sort(Comparator.naturalOrder());
            int size = sorted.size();
            if (size % 2 == 1) {
                return sorted.get(size / 2);
            }
            return sorted.get(size / 2 - 1).add(sorted.get(size / 2)).divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
        }

        private static BigDecimal stdDevStatic(List<BigDecimal> values, BigDecimal median) {
            if (values.size() < 2) {
                return BigDecimal.ZERO;
            }
            BigDecimal variance = BigDecimal.ZERO;
            for (BigDecimal value : values) {
                BigDecimal delta = value.subtract(median);
                variance = variance.add(delta.multiply(delta));
            }
            variance = variance.divide(BigDecimal.valueOf(values.size()), 6, RoundingMode.HALF_UP);
            double sqrt = Math.sqrt(variance.doubleValue());
            return BigDecimal.valueOf(sqrt).setScale(4, RoundingMode.HALF_UP);
        }

        private static BigDecimal madStatic(List<BigDecimal> values, BigDecimal median) {
            if (values.isEmpty()) {
                return BigDecimal.ZERO;
            }
            List<BigDecimal> deviations = values.stream().map(value -> value.subtract(median).abs()).toList();
            return medianStatic(deviations).setScale(4, RoundingMode.HALF_UP);
        }
    }

    private record DetectedEvent(
        LocalDateTime eventAt,
        BigDecimal oldPrice,
        BigDecimal newPrice,
        BigDecimal deltaAmount,
        BigDecimal deltaPercent,
        PriceEventDirection direction,
        BigDecimal baselinePrice,
        BigDecimal dynamicThresholdPercent,
        BigDecimal confidenceScore,
        String triggerType
    ) {
    }

    private record DetectedPromotionWindow(
        LocalDateTime startAt,
        LocalDateTime endAt,
        BigDecimal baselinePrice,
        BigDecimal promoPrice,
        BigDecimal discountPercent,
        BigDecimal quantityLiftPercent,
        BigDecimal revenueLiftPercent,
        BigDecimal dynamicThresholdPercent,
        BigDecimal confidenceScore,
        PromotionWindowStatus status
    ) {
    }
}
