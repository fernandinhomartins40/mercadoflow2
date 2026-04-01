package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.StatePriceComparisonStatsDTO;
import com.pdv2cloud.model.dto.StatePriceImportObservationRequestDTO;
import com.pdv2cloud.model.dto.StatePriceImportRequestDTO;
import com.pdv2cloud.model.dto.StatePriceImportResponseDTO;
import com.pdv2cloud.model.dto.StatePriceObservationDTO;
import com.pdv2cloud.model.dto.StatePriceProductDetailDTO;
import com.pdv2cloud.model.dto.StatePriceProductSummaryDTO;
import com.pdv2cloud.model.dto.StatePriceSourceDTO;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.ProductDataSource;
import com.pdv2cloud.model.entity.ProductIdentityType;
import com.pdv2cloud.model.entity.StatePriceObservation;
import com.pdv2cloud.model.entity.StatePriceSource;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.StatePriceObservationRepository;
import com.pdv2cloud.repository.StatePriceSourceRepository;
import com.pdv2cloud.util.ProductCatalogUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatePriceService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    private final StatePriceSourceRepository sourceRepository;
    private final StatePriceObservationRepository observationRepository;
    private final ProductRepository productRepository;

    public StatePriceService(
        StatePriceSourceRepository sourceRepository,
        StatePriceObservationRepository observationRepository,
        ProductRepository productRepository
    ) {
        this.sourceRepository = sourceRepository;
        this.observationRepository = observationRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public StatePriceComparisonStatsDTO getStats() {
        return new StatePriceComparisonStatsDTO(
            observationRepository.countDistinctProductIds(),
            observationRepository.count(),
            sourceRepository.countByActiveTrue(),
            observationRepository.countDistinctStates(),
            observationRepository.findLatestObservedAt()
        );
    }

    @Transactional(readOnly = true)
    public List<StatePriceSourceDTO> listSources() {
        return sourceRepository.findByActiveTrueOrderByNameAsc().stream()
            .sorted(Comparator.comparing(StatePriceSource::getName, String.CASE_INSENSITIVE_ORDER))
            .map(this::mapSource)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<String> listStates() {
        return observationRepository.findDistinctObservedStates();
    }

    @Transactional(readOnly = true)
    public Page<StatePriceProductSummaryDTO> searchProducts(
        String search,
        String state,
        String provider,
        Pageable pageable
    ) {
        String normalizedSearch = buildSearchPattern(search);
        String normalizedState = normalizeState(state);
        String normalizedProvider = normalizeProvider(provider);

        Page<UUID> idsPage = observationRepository.findComparableProductIds(
            normalizedProvider,
            normalizedState,
            normalizedSearch,
            pageable
        );

        if (idsPage.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, idsPage.getTotalElements());
        }

        List<StatePriceObservation> observations = observationRepository
            .findByProduct_IdInOrderByPriceAscObservedAtDesc(idsPage.getContent());

        Map<UUID, List<StatePriceObservation>> grouped = observations.stream()
            .collect(Collectors.groupingBy(o -> o.getProduct().getId(), HashMap::new, Collectors.toList()));

        List<StatePriceProductSummaryDTO> summaries = new ArrayList<>();
        for (UUID productId : idsPage.getContent()) {
            List<StatePriceObservation> productObservations = grouped.get(productId);
            if (productObservations == null || productObservations.isEmpty()) {
                continue;
            }
            summaries.add(mapSummary(productObservations));
        }

        return new PageImpl<>(summaries, pageable, idsPage.getTotalElements());
    }

    @Transactional(readOnly = true)
    public StatePriceProductDetailDTO getProductDetail(UUID productId) {
        List<StatePriceObservation> observations = observationRepository
            .findByProduct_IdOrderByPriceAscObservedAtDesc(productId);
        if (observations.isEmpty()) {
            throw new IllegalArgumentException("Produto estadual nao encontrado");
        }

        StatePriceProductSummaryDTO summary = mapSummary(observations);
        List<StatePriceObservationDTO> details = observations.stream()
            .map(this::mapObservation)
            .toList();
        return new StatePriceProductDetailDTO(summary, details);
    }

    @Transactional
    public StatePriceImportResponseDTO importObservations(StatePriceImportRequestDTO request) {
        if (request == null || request.getObservations() == null || request.getObservations().isEmpty()) {
            throw new IllegalArgumentException("Informe ao menos uma observacao de preco");
        }

        StatePriceSource source = upsertSource(request);
        long createdProducts = 0;
        long importedObservations = 0;
        long skippedObservations = 0;
        long errors = 0;
        LocalDateTime latestObservedAt = null;
        Set<String> createdKeys = new HashSet<>();

        for (StatePriceImportObservationRequestDTO item : request.getObservations()) {
            try {
                StatePriceObservation observation = buildObservation(source, item, createdKeys);
                if (observationRepository.existsBySource_IdAndProviderProductIdAndObservedStoreIdAndObservedAt(
                    source.getId(),
                    observation.getProviderProductId(),
                    observation.getObservedStoreId(),
                    observation.getObservedAt()
                )) {
                    skippedObservations++;
                    continue;
                }

                observationRepository.save(observation);
                importedObservations++;
                if (observation.getProduct() != null && observation.getProduct().getId() != null) {
                    if (createdKeys.contains(observation.getProduct().getEan())) {
                        createdProducts++;
                        createdKeys.remove(observation.getProduct().getEan());
                    }
                }
                if (latestObservedAt == null || observation.getObservedAt().isAfter(latestObservedAt)) {
                    latestObservedAt = observation.getObservedAt();
                }
            } catch (Exception ex) {
                errors++;
            }
        }

        return new StatePriceImportResponseDTO(
            source.getId(),
            source.getProvider(),
            source.getName(),
            createdProducts,
            importedObservations,
            skippedObservations,
            errors,
            latestObservedAt
        );
    }

    private StatePriceSource upsertSource(StatePriceImportRequestDTO request) {
        String provider = normalizeProvider(request.getProvider());
        StatePriceSource source = sourceRepository.findByProviderIgnoreCase(provider).orElseGet(StatePriceSource::new);
        source.setProvider(provider);
        source.setName(cleanText(request.getName(), provider));
        source.setStateCode(normalizeState(request.getStateCode()));
        source.setServiceName(cleanText(request.getServiceName(), request.getName()));
        source.setServiceUrl(cleanText(request.getServiceUrl(), null));
        source.setCoverageStates(cleanText(request.getCoverageStates(), null));
        source.setNotes(cleanText(request.getNotes(), null));
        source.setActive(true);
        if (source.getCreatedAt() == null) {
            source.setCreatedAt(LocalDateTime.now());
        }
        source.setUpdatedAt(LocalDateTime.now());
        return sourceRepository.save(source);
    }

    private StatePriceObservation buildObservation(
        StatePriceSource source,
        StatePriceImportObservationRequestDTO request,
        Set<String> createdKeys
    ) {
        String productName = cleanText(request.getProductName(), null);
        if (productName == null) {
            throw new IllegalArgumentException("Nome do produto obrigatorio");
        }

        String normalizedGtin = ProductCatalogUtils.normalizeGtin(request.getGtin());
        String normalizedName = ProductCatalogUtils.normalizeName(productName);
        String brand = cleanText(request.getBrand(), null);
        String category = cleanText(request.getCategory(), null);
        String packageDescription = cleanText(request.getPackageDescription(), null);
        String unit = cleanText(request.getUnit(), null);
        String providerProductId = normalizeProviderProductId(request.getProviderProductId(), productName, normalizedName, normalizedGtin);
        String observedState = normalizeState(requireText(request.getObservedState(), "Estado observado obrigatorio"));
        String observedCity = cleanText(request.getObservedCity(), null);
        String observedStore = cleanText(request.getObservedStore(), null);
        String observedStoreId = normalizeStoreId(request.getObservedStoreId(), providerProductId, observedState, observedCity, observedStore);
        String sourceUrl = cleanText(request.getSourceUrl(), null);
        BigDecimal price = request.getPrice() != null ? request.getPrice().setScale(2, RoundingMode.HALF_UP) : null;
        if (price == null) {
            throw new IllegalArgumentException("Preco obrigatorio");
        }

        LocalDateTime observedAt = request.getObservedAt() != null ? request.getObservedAt() : LocalDateTime.now();
        String productKey = resolveProductKey(normalizedGtin, normalizedName, brand, packageDescription, unit);
        boolean createdProduct = !productRepository.findByEan(productKey).isPresent();
        Product product = resolveProduct(productKey, productName, normalizedName, brand, category, packageDescription, unit, normalizedGtin, observedAt);
        if (createdProduct) {
            createdKeys.add(product.getEan());
        }

        StatePriceObservation observation = new StatePriceObservation();
        observation.setSource(source);
        observation.setProduct(product);
        observation.setProviderProductId(providerProductId);
        observation.setObservedGtin(normalizedGtin);
        observation.setProductName(productName);
        observation.setNormalizedName(normalizedName);
        observation.setBrand(brand);
        observation.setCategory(category);
        observation.setPackageDescription(packageDescription);
        observation.setUnit(unit);
        observation.setObservedState(observedState);
        observation.setObservedCity(observedCity);
        observation.setObservedStore(observedStore);
        observation.setObservedStoreId(observedStoreId);
        observation.setSourceUrl(sourceUrl);
        observation.setPrice(price);
        observation.setCurrency(cleanText(request.getCurrency(), "BRL").toUpperCase(Locale.ROOT));
        observation.setObservedAt(observedAt);
        observation.setRawPayload(cleanText(request.getRawPayload(), null));
        observation.setCreatedAt(LocalDateTime.now());
        return observation;
    }

    private Product resolveProduct(
        String productKey,
        String productName,
        String normalizedName,
        String brand,
        String category,
        String packageDescription,
        String unit,
        String normalizedGtin,
        LocalDateTime observedAt
    ) {
        Product product = productRepository.findByEan(productKey).orElseGet(Product::new);
        boolean isNew = product.getId() == null;

        product.setEan(productKey);
        if (product.getName() == null || product.getName().isBlank()) {
            product.setName(productName);
        }
        if (product.getNormalizedName() == null || product.getNormalizedName().isBlank()) {
            product.setNormalizedName(normalizedName);
        }
        if (product.getBrand() == null || product.getBrand().isBlank()) {
            product.setBrand(brand);
        }
        if (product.getCategory() == null || product.getCategory().isBlank()) {
            product.setCategory(category);
        }
        if (product.getPackageDescription() == null || product.getPackageDescription().isBlank()) {
            product.setPackageDescription(packageDescription);
        }
        if (product.getUnit() == null || product.getUnit().isBlank()) {
            product.setUnit(unit);
        }
        if (isNew) {
            product.setSourceBest(ProductDataSource.STATE_PORTAL);
            product.setIdentityType(normalizedGtin != null ? ProductIdentityType.GTIN : ProductIdentityType.MARKET_DESCRIPTION);
            product.setConfidenceScore(scaleConfidence(normalizedGtin != null ? BigDecimal.valueOf(0.82) : BigDecimal.valueOf(0.55)));
            product.setObservationCount(0);
            product.setFirstSeenAt(observedAt);
        }
        product.setLastSeenAt(observedAt);
        product.setLastVerifiedAt(observedAt);
        product.setObservationCount((product.getObservationCount() != null ? product.getObservationCount() : 0) + 1);
        if (product.getConfidenceScore() == null) {
            product.setConfidenceScore(scaleConfidence(normalizedGtin != null ? BigDecimal.valueOf(0.82) : BigDecimal.valueOf(0.55)));
        }

        return productRepository.save(product);
    }

    private StatePriceSourceDTO mapSource(StatePriceSource source) {
        long count = source.getId() != null ? observationRepository.countBySource_Id(source.getId()) : 0;
        LocalDateTime latestObservedAt = source.getId() != null
            ? observationRepository.findBySource_IdOrderByObservedAtDesc(source.getId()).stream()
                .map(StatePriceObservation::getObservedAt)
                .findFirst()
                .orElse(null)
            : null;
        return new StatePriceSourceDTO(
            source.getId(),
            source.getProvider(),
            source.getName(),
            source.getStateCode(),
            source.getServiceName(),
            source.getServiceUrl(),
            source.getCoverageStates(),
            source.getNotes(),
            Boolean.TRUE.equals(source.getActive()),
            count,
            latestObservedAt
        );
    }

    private StatePriceProductSummaryDTO mapSummary(List<StatePriceObservation> observations) {
        List<StatePriceObservation> sorted = observations.stream()
            .sorted(Comparator.comparing(StatePriceObservation::getPrice)
                .thenComparing(StatePriceObservation::getObservedAt, Comparator.reverseOrder()))
            .toList();
        StatePriceObservation best = sorted.get(0);
        StatePriceObservation worst = observations.stream()
            .max(Comparator.comparing(StatePriceObservation::getPrice)
                .thenComparing(StatePriceObservation::getObservedAt, Comparator.naturalOrder()))
            .orElse(best);

        BigDecimal average = observations.stream()
            .map(StatePriceObservation::getPrice)
            .filter(value -> value != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .divide(BigDecimal.valueOf(Math.max(observations.size(), 1)), 2, RoundingMode.HALF_UP);

        Set<UUID> sourceIds = new HashSet<>();
        Set<String> states = new HashSet<>();
        for (StatePriceObservation observation : observations) {
            if (observation.getSource() != null && observation.getSource().getId() != null) {
                sourceIds.add(observation.getSource().getId());
            }
            if (observation.getObservedState() != null && !observation.getObservedState().isBlank()) {
                states.add(observation.getObservedState().toUpperCase(Locale.ROOT));
            }
        }

        Product product = best.getProduct();
        String gtin = displayGtin(product != null ? product.getEan() : null);
        if (gtin == null) {
            gtin = displayGtin(best.getObservedGtin());
        }
        LocalDateTime latestObservedAt = observations.stream()
            .map(StatePriceObservation::getObservedAt)
            .max(Comparator.naturalOrder())
            .orElse(best.getObservedAt());

        return new StatePriceProductSummaryDTO(
            product != null ? product.getId() : best.getProduct().getId(),
            gtin,
            best.getProductName(),
            best.getBrand(),
            best.getCategory(),
            best.getPackageDescription(),
            best.getUnit(),
            observations.size(),
            sourceIds.size(),
            states.size(),
            price(best, Comparator.comparing(StatePriceObservation::getPrice, Comparator.nullsLast(Comparator.naturalOrder())).reversed()),
            price(worst, Comparator.naturalOrder()),
            average,
            best.getObservedState(),
            best.getObservedCity(),
            best.getObservedStore(),
            best.getSource() != null ? best.getSource().getName() : null,
            best.getSource() != null ? best.getSource().getProvider() : null,
            best.getPrice(),
            best.getObservedAt(),
            worst.getObservedState(),
            worst.getObservedCity(),
            worst.getObservedStore(),
            worst.getSource() != null ? worst.getSource().getName() : null,
            worst.getSource() != null ? worst.getSource().getProvider() : null,
            worst.getPrice(),
            worst.getObservedAt(),
            latestObservedAt
        );
    }

    private StatePriceObservationDTO mapObservation(StatePriceObservation observation) {
        return new StatePriceObservationDTO(
            observation.getId(),
            observation.getSource() != null ? observation.getSource().getId() : null,
            observation.getSource() != null ? observation.getSource().getProvider() : null,
            observation.getSource() != null ? observation.getSource().getName() : null,
            observation.getSource() != null ? observation.getSource().getServiceUrl() : null,
            observation.getProduct() != null ? observation.getProduct().getId() : null,
            observation.getProviderProductId(),
            observation.getObservedGtin(),
            observation.getProductName(),
            observation.getNormalizedName(),
            observation.getBrand(),
            observation.getCategory(),
            observation.getPackageDescription(),
            observation.getUnit(),
            observation.getObservedState(),
            observation.getObservedCity(),
            observation.getObservedStore(),
            observation.getObservedStoreId(),
            observation.getSourceUrl(),
            observation.getPrice(),
            observation.getCurrency(),
            observation.getObservedAt()
        );
    }

    private String resolveProductKey(
        String gtin,
        String normalizedName,
        String brand,
        String packageDescription,
        String unit
    ) {
        if (gtin != null) {
            return gtin;
        }
        String fingerprint = String.join("|",
            cleanText(normalizedName, ""),
            cleanText(brand, ""),
            cleanText(packageDescription, ""),
            cleanText(unit, "")
        );
        return "STATE-" + ProductCatalogUtils.shortHash(fingerprint, 24).toUpperCase(Locale.ROOT);
    }

    private String normalizeProviderProductId(String rawValue, String productName, String normalizedName, String normalizedGtin) {
        String value = cleanText(rawValue, null);
        if (value != null) {
            return value;
        }
        if (normalizedGtin != null) {
            return normalizedGtin;
        }
        return "PP-" + ProductCatalogUtils.shortHash(String.join("|", productName, normalizedName), 16).toUpperCase(Locale.ROOT);
    }

    private String normalizeStoreId(String rawValue, String providerProductId, String state, String city, String store) {
        String value = cleanText(rawValue, null);
        if (value != null) {
            return value;
        }
        String fingerprint = String.join("|",
            cleanText(providerProductId, ""),
            cleanText(state, ""),
            cleanText(city, ""),
            cleanText(store, "")
        );
        return "STORE-" + ProductCatalogUtils.shortHash(fingerprint, 18).toUpperCase(Locale.ROOT);
    }

    private String normalizeProvider(String value) {
        String text = cleanText(value, null);
        if (text == null) {
            throw new IllegalArgumentException("Provider obrigatorio");
        }
        return text.toUpperCase(Locale.ROOT);
    }

    private String normalizeState(String value) {
        String text = cleanText(value, null);
        return text == null ? "" : text.toUpperCase(Locale.ROOT);
    }

    private String buildSearchPattern(String value) {
        String text = cleanText(value, null);
        if (text == null) {
            return "";
        }
        return "%" + ProductCatalogUtils.normalizeName(text) + "%";
    }

    private String cleanText(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? fallback : trimmed;
    }

    private String requireText(String value, String message) {
        String text = cleanText(value, null);
        if (text == null) {
            throw new IllegalArgumentException(message);
        }
        return text;
    }

    private BigDecimal scaleConfidence(BigDecimal value) {
        if (value == null) {
            return ZERO;
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private String displayGtin(String candidate) {
        String gtin = ProductCatalogUtils.normalizeGtin(candidate);
        return gtin != null ? gtin : null;
    }
}
