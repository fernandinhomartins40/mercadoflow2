package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.InvoiceItemDTO;
import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.ProductCatalogBackfillResponse;
import com.pdv2cloud.model.dto.ProductEnrichmentUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.model.entity.InvoiceItem;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketProductAlias;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.ProductDataSource;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.model.entity.ProductIdentityType;
import com.pdv2cloud.model.entity.ProductObservation;
import com.pdv2cloud.repository.InvoiceItemRepository;
import com.pdv2cloud.repository.MarketProductAliasRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductObservationRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.util.ProductCatalogUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
@Slf4j
public class ProductCatalogService {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductObservationRepository productObservationRepository;

    @Autowired
    private MarketProductAliasRepository marketProductAliasRepository;

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private InvoiceItemRepository invoiceItemRepository;

    public List<Product> resolveProducts(List<InvoiceItemDTO> items, UUID marketId) {
        List<Product> products = new ArrayList<>();

        for (InvoiceItemDTO item : items) {
            ProductIdentity identity = resolveIdentity(item, marketId);
            Product product = productRepository.findByEan(identity.key())
                .orElseGet(() -> createProduct(identity, item));

            boolean changed = hydrateFromInvoice(product, item, identity);
            if (product.getId() == null || changed) {
                product = productRepository.save(product);
            }

            products.add(product);
        }

        return products;
    }

    public void recordInvoiceCatalogData(Invoice invoice) {
        if (invoice == null || invoice.getItems() == null) {
            return;
        }

        int aliasesTouched = 0;
        int observationsCreated = 0;
        int productsUpdated = 0;

        for (InvoiceItem item : invoice.getItems()) {
            CatalogMutation mutation = recordObservation(invoice, item);
            if (mutation.observationCreated()) {
                observationsCreated++;
            }
            if (mutation.aliasTouched()) {
                aliasesTouched++;
            }
            if (mutation.productUpdated()) {
                productsUpdated++;
            }
        }

        if (observationsCreated > 0 || aliasesTouched > 0 || productsUpdated > 0) {
            log.info(
                "Catalog updated from invoice {} | observations={} aliases={} products={}",
                invoice.getChaveNFe(),
                observationsCreated,
                aliasesTouched,
                productsUpdated
            );
        }
    }

    public ProductEnrichment upsertEnrichment(ProductEnrichmentUpsertRequest request) {
        String gtin = ProductCatalogUtils.normalizeGtin(request.getGtin());
        if (gtin == null) {
            throw new IllegalArgumentException("GTIN invalido para enriquecimento");
        }
        String provider = request.getProvider().trim();

        Product product = productRepository.findByEan(gtin).orElseGet(() -> {
            Product created = new Product();
            created.setEan(gtin);
            created.setIdentityType(ProductIdentityType.GTIN);
            created.setSourceBest(ProductDataSource.WEB);
            created.setConfidenceScore(BigDecimal.ZERO);
            created.setObservationCount(0);
            return created;
        });

        if (product.getId() == null) {
            product = productRepository.save(product);
        }

        ProductEnrichment enrichment = productEnrichmentRepository
            .findTopByProduct_IdAndProviderOrderByFetchedAtDesc(product.getId(), provider)
            .orElseGet(ProductEnrichment::new);
        enrichment.setProduct(product);
        enrichment.setProvider(provider);
        enrichment.setProviderProductId(ProductCatalogUtils.canonicalizeDisplayName(request.getProviderProductId()));
        enrichment.setCanonicalName(ProductCatalogUtils.canonicalizeDisplayName(request.getCanonicalName()));
        enrichment.setBrand(ProductCatalogUtils.canonicalizeDisplayName(request.getBrand()));
        enrichment.setCategory(ProductCatalogUtils.canonicalizeDisplayName(request.getCategory()));
        enrichment.setNcm(ProductCatalogUtils.canonicalizeDisplayName(request.getNcm()));
        enrichment.setUnit(ProductCatalogUtils.canonicalizeDisplayName(request.getUnit()));
        enrichment.setPackageDescription(ProductCatalogUtils.canonicalizeDisplayName(request.getPackageDescription()));
        enrichment.setRawPayload(request.getRawPayload());
        enrichment.setSourceLicense(ProductCatalogUtils.canonicalizeDisplayName(request.getSourceLicense()));
        enrichment.setConfidenceScore(scaleConfidence(request.getConfidenceScore() != null ? request.getConfidenceScore() : BigDecimal.valueOf(0.85)));
        enrichment.setFetchedAt(LocalDateTime.now());
        enrichment.setLastVerifiedAt(LocalDateTime.now());
        productEnrichmentRepository.save(enrichment);

        mergeEnrichment(product, enrichment);
        productRepository.save(product);

        return enrichment;
    }

    public ProductCatalogBackfillResponse backfillMissingCatalogData(int batchSize, int maxBatches) {
        int invoiceItemsScanned = 0;
        int observationsCreated = 0;
        int aliasesTouched = 0;
        int productsUpdated = 0;

        for (int batch = 0; batch < maxBatches; batch++) {
            List<InvoiceItem> items = invoiceItemRepository.findWithoutProductObservation(PageRequest.of(0, batchSize));
            if (items.isEmpty()) {
                break;
            }

            for (InvoiceItem item : items) {
                invoiceItemsScanned++;
                CatalogMutation mutation = recordObservation(item.getInvoice(), item);
                if (mutation.observationCreated()) {
                    observationsCreated++;
                }
                if (mutation.aliasTouched()) {
                    aliasesTouched++;
                }
                if (mutation.productUpdated()) {
                    productsUpdated++;
                }
            }
        }

        return new ProductCatalogBackfillResponse(
            invoiceItemsScanned,
            observationsCreated,
            aliasesTouched,
            productsUpdated
        );
    }

    @Transactional(readOnly = true)
    public Page<CatalogAdminProductDTO> listCatalogProducts(String provider, String search, Pageable pageable) {
        String normalizedProvider = normalizeProviderFilter(provider);
        String normalizedSearchPattern = buildSearchPattern(search);

        return productEnrichmentRepository.searchCatalogForAdmin(normalizedProvider, normalizedSearchPattern, pageable)
            .map(this::toCatalogAdminProductDTO);
    }

    public CatalogAdminProductDTO upsertManualCatalogProduct(SuperAdminCatalogProductUpsertRequest request) {
        String gtin = ProductCatalogUtils.normalizeGtin(request.getGtin());
        if (gtin == null) {
            throw new IllegalArgumentException("GTIN invalido");
        }
        String provider = ProductCatalogUtils.canonicalizeDisplayName(request.getProvider());
        if (provider == null) {
            provider = "MANUAL_SUPER_ADMIN";
        }

        Product product = productRepository.findByEan(gtin).orElseGet(() -> {
            Product created = new Product();
            created.setEan(gtin);
            created.setIdentityType(ProductIdentityType.GTIN);
            created.setSourceBest(ProductDataSource.MANUAL);
            created.setObservationCount(0);
            created.setConfidenceScore(scaleConfidence(request.getConfidenceScore() != null ? request.getConfidenceScore() : BigDecimal.valueOf(0.98)));
            created.setFirstSeenAt(LocalDateTime.now());
            created.setLastSeenAt(LocalDateTime.now());
            return created;
        });

        applyManualProductFields(product, request);
        product = productRepository.save(product);

        ProductEnrichment enrichment = productEnrichmentRepository
            .findTopByProduct_IdAndProviderOrderByFetchedAtDesc(product.getId(), provider)
            .orElseGet(ProductEnrichment::new);

        applyManualEnrichmentFields(enrichment, product, request, provider, gtin);
        enrichment = productEnrichmentRepository.save(enrichment);

        return toCatalogAdminProductDTO(enrichment);
    }

    public CatalogAdminProductDTO updateManualCatalogProduct(UUID productId, SuperAdminCatalogProductUpsertRequest request) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new IllegalArgumentException("Produto nao encontrado"));

        applyManualProductFields(product, request);
        product = productRepository.save(product);

        String provider = ProductCatalogUtils.canonicalizeDisplayName(request.getProvider());
        if (provider == null) {
            provider = "MANUAL_SUPER_ADMIN";
        }
        ProductEnrichment enrichment = productEnrichmentRepository
            .findTopByProduct_IdAndProviderOrderByFetchedAtDesc(product.getId(), provider)
            .orElseGet(ProductEnrichment::new);

        String providerProductId = product.getEan() != null ? product.getEan() : "manual-" + product.getId();
        applyManualEnrichmentFields(enrichment, product, request, provider, providerProductId);
        enrichment = productEnrichmentRepository.save(enrichment);
        return toCatalogAdminProductDTO(enrichment);
    }

    private CatalogMutation recordObservation(Invoice invoice, InvoiceItem item) {
        if (invoice == null || item == null || item.getProduct() == null || item.getId() == null) {
            return CatalogMutation.none();
        }
        if (productObservationRepository.existsByInvoiceItem_Id(item.getId())) {
            return CatalogMutation.none();
        }

        LocalDateTime observedAt = resolveObservedAt(invoice);
        String localName = resolveLocalName(item);
        String normalizedName = ProductCatalogUtils.normalizeName(localName);
        ProductObservation observation = new ProductObservation();
        observation.setProduct(item.getProduct());
        observation.setMarket(invoice.getMarket());
        observation.setInvoice(invoice);
        observation.setInvoiceItem(item);
        observation.setObservedGtin(ProductCatalogUtils.normalizeGtin(item.getCodigoEAN()));
        observation.setLocalName(localName);
        observation.setNormalizedName(normalizedName);
        observation.setInternalCode(ProductCatalogUtils.normalizeInternalCode(item.getCodigoInterno()));
        observation.setQuantity(item.getQuantidade());
        observation.setUnitPrice(item.getValorUnitario());
        observation.setTotalPrice(item.getValorTotal());
        observation.setDiscountAmount(item.getValorDesconto());
        observation.setFreightAmount(item.getValorFrete());
        observation.setOtherAmount(item.getValorOutros());
        observation.setNetTotalPrice(resolveNetTotal(item));
        observation.setNetUnitPrice(resolveNetUnitPrice(item, observation.getNetTotalPrice()));
        observation.setSourceType(ProductDataSource.INVOICE);
        observation.setObservedAt(observedAt);
        observation.setCreatedAt(LocalDateTime.now());
        productObservationRepository.save(observation);

        boolean productUpdated = touchProductFromObservation(item.getProduct(), item, observedAt);
        boolean aliasTouched = touchAlias(invoice.getMarket(), item.getProduct(), item, observedAt);
        return new CatalogMutation(true, aliasTouched, productUpdated);
    }

    private Product createProduct(ProductIdentity identity, InvoiceItemDTO item) {
        Product product = new Product();
        product.setEan(identity.key());
        product.setIdentityType(identity.identityType());
        product.setSourceBest(ProductDataSource.INVOICE);
        product.setObservationCount(0);
        product.setConfidenceScore(scaleConfidence(baseConfidence(identity.identityType())));
        String displayName = ProductCatalogUtils.canonicalizeDisplayName(item.getDescricao());
        product.setName(displayName);
        product.setNormalizedName(ProductCatalogUtils.normalizeName(displayName));
        return product;
    }

    private boolean hydrateFromInvoice(Product product, InvoiceItemDTO item, ProductIdentity identity) {
        boolean changed = false;

        if (product.getIdentityType() == null) {
            product.setIdentityType(identity.identityType());
            changed = true;
        }

        if (product.getSourceBest() == null) {
            product.setSourceBest(ProductDataSource.INVOICE);
            changed = true;
        }

        String candidateName = ProductCatalogUtils.canonicalizeDisplayName(item.getDescricao());
        if (candidateName != null && shouldPromoteInvoiceName(product, candidateName)) {
            product.setName(candidateName);
            product.setNormalizedName(ProductCatalogUtils.normalizeName(candidateName));
            changed = true;
        } else if ((product.getNormalizedName() == null || product.getNormalizedName().isBlank()) && product.getName() != null) {
            product.setNormalizedName(ProductCatalogUtils.normalizeName(product.getName()));
            changed = true;
        }

        if (product.getConfidenceScore() == null) {
            product.setConfidenceScore(scaleConfidence(baseConfidence(identity.identityType())));
            changed = true;
        }

        return changed;
    }

    private boolean touchProductFromObservation(Product product, InvoiceItem item, LocalDateTime observedAt) {
        boolean changed = false;

        if (product.getFirstSeenAt() == null || observedAt.isBefore(product.getFirstSeenAt())) {
            product.setFirstSeenAt(observedAt);
            changed = true;
        }
        if (product.getLastSeenAt() == null || observedAt.isAfter(product.getLastSeenAt())) {
            product.setLastSeenAt(observedAt);
            changed = true;
        }

        int currentCount = product.getObservationCount() != null ? product.getObservationCount() : 0;
        product.setObservationCount(currentCount + 1);
        product.setConfidenceScore(scaleConfidence(computeConfidence(product)));
        changed = true;

        String candidateName = ProductCatalogUtils.canonicalizeDisplayName(item.getDescricao());
        if (candidateName != null && shouldPromoteInvoiceName(product, candidateName)) {
            product.setName(candidateName);
            product.setNormalizedName(ProductCatalogUtils.normalizeName(candidateName));
        } else if ((product.getNormalizedName() == null || product.getNormalizedName().isBlank()) && product.getName() != null) {
            product.setNormalizedName(ProductCatalogUtils.normalizeName(product.getName()));
        }

        productRepository.save(product);
        return changed;
    }

    private boolean touchAlias(Market market, Product product, InvoiceItem item, LocalDateTime observedAt) {
        String localName = resolveLocalName(item);
        String normalizedName = ProductCatalogUtils.normalizeName(localName);
        if (market == null || localName == null || normalizedName.isBlank()) {
            return false;
        }

        MarketProductAlias alias = marketProductAliasRepository
            .findByMarket_IdAndProduct_IdAndNormalizedName(market.getId(), product.getId(), normalizedName)
            .orElseGet(() -> {
                MarketProductAlias created = new MarketProductAlias();
                created.setMarket(market);
                created.setProduct(product);
                created.setNormalizedName(normalizedName);
                created.setLocalName(localName);
                created.setInternalCode(ProductCatalogUtils.normalizeInternalCode(item.getCodigoInterno()));
                created.setTimesSeen(0);
                created.setFirstSeenAt(observedAt);
                created.setLastSeenAt(observedAt);
                return created;
            });

        alias.setLocalName(localName);
        if (alias.getInternalCode() == null) {
            alias.setInternalCode(ProductCatalogUtils.normalizeInternalCode(item.getCodigoInterno()));
        }
        alias.setTimesSeen((alias.getTimesSeen() != null ? alias.getTimesSeen() : 0) + 1);
        if (alias.getFirstSeenAt() == null || observedAt.isBefore(alias.getFirstSeenAt())) {
            alias.setFirstSeenAt(observedAt);
        }
        if (alias.getLastSeenAt() == null || observedAt.isAfter(alias.getLastSeenAt())) {
            alias.setLastSeenAt(observedAt);
        }

        marketProductAliasRepository.save(alias);
        return true;
    }

    private void mergeEnrichment(Product product, ProductEnrichment enrichment) {
        if (product.getName() == null || product.getSourceBest() == ProductDataSource.INVOICE) {
            String canonicalName = ProductCatalogUtils.canonicalizeDisplayName(enrichment.getCanonicalName());
            if (canonicalName != null) {
                product.setName(canonicalName);
                product.setNormalizedName(ProductCatalogUtils.normalizeName(canonicalName));
            }
        }

        if ((product.getBrand() == null || product.getBrand().isBlank()) && enrichment.getBrand() != null) {
            product.setBrand(enrichment.getBrand());
        }
        if ((product.getCategory() == null || product.getCategory().isBlank()) && enrichment.getCategory() != null) {
            product.setCategory(enrichment.getCategory());
        }
        if ((product.getUnit() == null || product.getUnit().isBlank()) && enrichment.getUnit() != null) {
            product.setUnit(enrichment.getUnit());
        }
        if ((product.getPackageDescription() == null || product.getPackageDescription().isBlank())
            && enrichment.getPackageDescription() != null) {
            product.setPackageDescription(enrichment.getPackageDescription());
        }

        product.setSourceBest(ProductDataSource.WEB);
        product.setLastVerifiedAt(enrichment.getLastVerifiedAt());
        BigDecimal current = product.getConfidenceScore() != null ? product.getConfidenceScore() : BigDecimal.ZERO;
        BigDecimal candidate = enrichment.getConfidenceScore() != null ? enrichment.getConfidenceScore() : BigDecimal.ZERO;
        if (candidate.compareTo(current) > 0) {
            product.setConfidenceScore(scaleConfidence(candidate));
        }
    }

    private boolean shouldPromoteInvoiceName(Product product, String candidateName) {
        if (candidateName == null || candidateName.isBlank()) {
            return false;
        }
        if (product.getSourceBest() == ProductDataSource.WEB || product.getSourceBest() == ProductDataSource.MANUAL) {
            return product.getName() == null || product.getName().isBlank();
        }
        if (product.getName() == null || product.getName().isBlank()) {
            return true;
        }

        String currentNormalized = ProductCatalogUtils.normalizeName(product.getName());
        String candidateNormalized = ProductCatalogUtils.normalizeName(candidateName);
        if (candidateNormalized.equals(currentNormalized)) {
            return false;
        }

        return scoreDisplayName(candidateName) > scoreDisplayName(product.getName());
    }

    private int scoreDisplayName(String value) {
        if (value == null) {
            return 0;
        }
        String normalized = ProductCatalogUtils.normalizeName(value);
        if (normalized.isBlank()) {
            return 0;
        }
        int words = normalized.split(" ").length;
        return normalized.length() + (words * 5);
    }

    private ProductIdentity resolveIdentity(InvoiceItemDTO item, UUID marketId) {
        String gtin = ProductCatalogUtils.normalizeGtin(item.getCodigoEAN());
        if (gtin != null) {
            return new ProductIdentity(gtin, ProductIdentityType.GTIN);
        }

        String internalCode = ProductCatalogUtils.normalizeInternalCode(item.getCodigoInterno());
        if (internalCode != null) {
            return new ProductIdentity("INT:" + marketId + ":" + internalCode, ProductIdentityType.MARKET_INTERNAL);
        }

        String normalizedName = ProductCatalogUtils.normalizeName(item.getDescricao());
        String hash = ProductCatalogUtils.shortHash(normalizedName.isBlank() ? "item" : normalizedName, 12);
        return new ProductIdentity("DESC:" + marketId + ":" + hash, ProductIdentityType.MARKET_DESCRIPTION);
    }

    private LocalDateTime resolveObservedAt(Invoice invoice) {
        if (invoice.getDataEmissao() != null) {
            return invoice.getDataEmissao();
        }
        if (invoice.getProcessedAt() != null) {
            return invoice.getProcessedAt();
        }
        return LocalDateTime.now();
    }

    private String resolveLocalName(InvoiceItem item) {
        String localName = ProductCatalogUtils.canonicalizeDisplayName(item.getDescricao());
        if (localName != null) {
            return localName;
        }
        if (item.getProduct() != null) {
            localName = ProductCatalogUtils.canonicalizeDisplayName(item.getProduct().getName());
            if (localName != null) {
                return localName;
            }
        }
        return "Item sem descricao";
    }

    private BigDecimal computeConfidence(Product product) {
        BigDecimal base = baseConfidence(product.getIdentityType() != null ? product.getIdentityType() : ProductIdentityType.GTIN);
        if (product.getSourceBest() == ProductDataSource.WEB) {
            base = base.max(BigDecimal.valueOf(0.85));
        } else if (product.getSourceBest() == ProductDataSource.MANUAL) {
            base = base.max(BigDecimal.valueOf(0.95));
        }

        int observations = Math.max(product.getObservationCount() != null ? product.getObservationCount() : 0, 0);
        BigDecimal bonus = BigDecimal.valueOf(Math.min(observations, 10)).multiply(BigDecimal.valueOf(0.03));
        return base.add(bonus).min(BigDecimal.valueOf(0.99));
    }

    private BigDecimal baseConfidence(ProductIdentityType identityType) {
        return switch (identityType) {
            case GTIN -> BigDecimal.valueOf(0.60);
            case MARKET_INTERNAL -> BigDecimal.valueOf(0.35);
            case MARKET_DESCRIPTION -> BigDecimal.valueOf(0.20);
        };
    }

    private BigDecimal scaleConfidence(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveNetTotal(InvoiceItem item) {
        BigDecimal gross = item.getValorTotal() != null ? item.getValorTotal() : BigDecimal.ZERO;
        BigDecimal discount = item.getValorDesconto() != null ? item.getValorDesconto() : BigDecimal.ZERO;
        BigDecimal freight = item.getValorFrete() != null ? item.getValorFrete() : BigDecimal.ZERO;
        BigDecimal others = item.getValorOutros() != null ? item.getValorOutros() : BigDecimal.ZERO;
        BigDecimal explicitNet = item.getValorLiquido();
        return explicitNet != null ? explicitNet : gross.subtract(discount).add(freight).add(others);
    }

    private BigDecimal resolveNetUnitPrice(InvoiceItem item, BigDecimal netTotal) {
        if (item.getQuantidade() != null && item.getQuantidade().compareTo(BigDecimal.ZERO) > 0) {
            return netTotal.divide(item.getQuantidade(), 2, RoundingMode.HALF_UP);
        }
        return item.getValorUnitario() != null ? item.getValorUnitario() : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    private String normalizeProviderFilter(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? "" : trimmed.toLowerCase(Locale.ROOT);
    }

    private String buildSearchPattern(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.isBlank()) {
            return "";
        }
        return "%" + trimmed.toLowerCase(Locale.ROOT) + "%";
    }

    private void applyManualProductFields(Product product, SuperAdminCatalogProductUpsertRequest request) {
        String canonicalName = ProductCatalogUtils.canonicalizeDisplayName(request.getName());
        if (canonicalName != null) {
            product.setName(canonicalName);
            product.setNormalizedName(ProductCatalogUtils.normalizeName(canonicalName));
        }
        String brand = ProductCatalogUtils.canonicalizeDisplayName(request.getBrand());
        if (brand != null) {
            product.setBrand(brand);
        }
        String category = ProductCatalogUtils.canonicalizeDisplayName(request.getCategory());
        if (category != null) {
            product.setCategory(category);
        }
        String unit = ProductCatalogUtils.canonicalizeDisplayName(request.getUnit());
        if (unit != null) {
            product.setUnit(unit);
        }
        String packageDescription = ProductCatalogUtils.canonicalizeDisplayName(request.getPackageDescription());
        if (packageDescription != null) {
            product.setPackageDescription(packageDescription);
        }
        product.setSourceBest(ProductDataSource.MANUAL);
        product.setIdentityType(ProductIdentityType.GTIN);
        product.setLastVerifiedAt(LocalDateTime.now());
        if (request.getConfidenceScore() != null) {
            product.setConfidenceScore(scaleConfidence(request.getConfidenceScore()));
        } else if (product.getConfidenceScore() == null) {
            product.setConfidenceScore(scaleConfidence(BigDecimal.valueOf(0.98)));
        }
    }

    private void applyManualEnrichmentFields(
        ProductEnrichment enrichment,
        Product product,
        SuperAdminCatalogProductUpsertRequest request,
        String provider,
        String providerProductId
    ) {
        enrichment.setProduct(product);
        enrichment.setProvider(provider);
        enrichment.setProviderProductId(ProductCatalogUtils.canonicalizeDisplayName(providerProductId));
        enrichment.setCanonicalName(ProductCatalogUtils.canonicalizeDisplayName(request.getName()));
        enrichment.setBrand(ProductCatalogUtils.canonicalizeDisplayName(request.getBrand()));
        enrichment.setCategory(ProductCatalogUtils.canonicalizeDisplayName(request.getCategory()));
        enrichment.setUnit(ProductCatalogUtils.canonicalizeDisplayName(request.getUnit()));
        enrichment.setPackageDescription(ProductCatalogUtils.canonicalizeDisplayName(request.getPackageDescription()));
        enrichment.setSourceLicense(ProductCatalogUtils.canonicalizeDisplayName(request.getSourceLicense()));
        enrichment.setRawPayload("{\"origin\":\"SUPER_ADMIN_MANUAL\"}");
        enrichment.setConfidenceScore(
            scaleConfidence(request.getConfidenceScore() != null ? request.getConfidenceScore() : BigDecimal.valueOf(0.99))
        );
        enrichment.setFetchedAt(LocalDateTime.now());
        enrichment.setLastVerifiedAt(LocalDateTime.now());
    }

    private CatalogAdminProductDTO toCatalogAdminProductDTO(ProductEnrichment enrichment) {
        Product product = enrichment.getProduct();
        String canonicalName = ProductCatalogUtils.canonicalizeDisplayName(
            enrichment.getCanonicalName() != null ? enrichment.getCanonicalName() : product.getName()
        );
        return new CatalogAdminProductDTO(
            enrichment.getId(),
            product.getId(),
            product.getEan(),
            canonicalName,
            ProductCatalogUtils.canonicalizeDisplayName(
                enrichment.getBrand() != null ? enrichment.getBrand() : product.getBrand()
            ),
            ProductCatalogUtils.canonicalizeDisplayName(
                enrichment.getCategory() != null ? enrichment.getCategory() : product.getCategory()
            ),
            ProductCatalogUtils.canonicalizeDisplayName(
                enrichment.getPackageDescription() != null
                    ? enrichment.getPackageDescription()
                    : product.getPackageDescription()
            ),
            enrichment.getProvider(),
            enrichment.getConfidenceScore(),
            enrichment.getFetchedAt(),
            enrichment.getLastVerifiedAt(),
            product.getObservationCount()
        );
    }

    private record ProductIdentity(String key, ProductIdentityType identityType) {
    }

    private record CatalogMutation(boolean observationCreated, boolean aliasTouched, boolean productUpdated) {
        private static CatalogMutation none() {
            return new CatalogMutation(false, false, false);
        }
    }
}
