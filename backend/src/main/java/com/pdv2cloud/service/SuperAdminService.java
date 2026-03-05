package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCrawlerConfigDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerSourceDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminMarketDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminOverviewDTO;
import com.pdv2cloud.model.dto.SuperAdminUserCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserDTO;
import com.pdv2cloud.model.dto.SuperAdminUserRoleUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserStatusRequest;
import com.pdv2cloud.model.entity.CatalogCrawlerConfig;
import com.pdv2cloud.model.entity.CatalogCrawlerSource;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.CatalogCrawlerConfigRepository;
import com.pdv2cloud.repository.CatalogCrawlerSourceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SuperAdminService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};
    private static final String DEFAULT_USER_AGENT = "MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com/catalog-bot)";

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private ProductCatalogService productCatalogService;

    @Autowired
    private CatalogCrawlerConfigRepository crawlerConfigRepository;

    @Autowired
    private CatalogCrawlerSourceRepository crawlerSourceRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public SuperAdminOverviewDTO getOverview() {
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByIsActive(true);
        long blockedUsers = totalUsers - activeUsers;
        long totalMarkets = marketRepository.count();
        long activeMarkets = marketRepository.countByIsActive(true);
        long totalCatalogProducts = productRepository.count();
        long totalCatalogEnrichments = productEnrichmentRepository.count();
        return new SuperAdminOverviewDTO(
            totalUsers,
            activeUsers,
            blockedUsers,
            totalMarkets,
            activeMarkets,
            totalCatalogProducts,
            totalCatalogEnrichments
        );
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminUserDTO> listUsers(String search, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return userRepository.searchForSuperAdmin(pattern, pageable).map(this::toUserDTO);
    }

    public SuperAdminUserDTO createUser(SuperAdminUserCreateRequest request) {
        if (userRepository.findByEmail(request.getEmail().trim().toLowerCase(Locale.ROOT)).isPresent()) {
            throw new IllegalArgumentException("Email ja cadastrado");
        }

        User user = new User();
        user.setName(request.getName().trim());
        user.setEmail(request.getEmail().trim().toLowerCase(Locale.ROOT));
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole());
        user.setIsActive(Boolean.TRUE.equals(request.getIsActive()));

        if (request.getMarketId() != null) {
            Market market = marketRepository.findById(request.getMarketId())
                .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
            user.setMarket(market);
        } else {
            user.setMarket(null);
        }

        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserStatus(UUID userId, SuperAdminUserStatusRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        user.setIsActive(Boolean.TRUE.equals(request.getActive()));
        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserRole(UUID userId, SuperAdminUserRoleUpdateRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        user.setRole(request.getRole());
        return toUserDTO(userRepository.save(user));
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminMarketDTO> listMarkets(String search, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return marketRepository.searchForSuperAdmin(pattern, pageable).map(this::toMarketDTO);
    }

    public SuperAdminMarketDTO createMarket(SuperAdminMarketCreateRequest request) {
        Market market = new Market();
        market.setName(request.getName().trim());
        market.setCnpj(request.getCnpj());
        market.setPlanType(request.getPlanType());
        market.setIsActive(Boolean.TRUE.equals(request.getActive()));
        return toMarketDTO(marketRepository.save(market));
    }

    public SuperAdminMarketDTO updateMarket(UUID marketId, SuperAdminMarketUpdateRequest request) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
        if (request.getName() != null && !request.getName().isBlank()) {
            market.setName(request.getName().trim());
        }
        if (request.getPlanType() != null) {
            market.setPlanType(request.getPlanType());
        }
        if (request.getActive() != null) {
            market.setIsActive(request.getActive());
        }
        return toMarketDTO(marketRepository.save(market));
    }

    public CatalogAdminProductDTO upsertCatalogProduct(SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.upsertManualCatalogProduct(request);
    }

    public CatalogAdminProductDTO updateCatalogProduct(UUID productId, SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.updateManualCatalogProduct(productId, request);
    }

    public SuperAdminCrawlerConfigDTO getCrawlerConfig(boolean onlyEnabledSources) {
        CatalogCrawlerConfig config = ensureCrawlerConfig();
        ensureDefaultCrawlerSources();
        List<CatalogCrawlerSource> sources = crawlerSourceRepository.findAllByOrderByNameAsc();

        SuperAdminCrawlerConfigDTO dto = new SuperAdminCrawlerConfigDTO();
        dto.setUserAgent(config.getUserAgent());
        dto.setIntervalMinutes(config.getIntervalMinutes());
        dto.setEnabled(config.getIsEnabled());

        List<SuperAdminCrawlerSourceDTO> sourceDTOs = new ArrayList<>();
        for (CatalogCrawlerSource source : sources) {
            if (onlyEnabledSources && !Boolean.TRUE.equals(source.getIsEnabled())) {
                continue;
            }
            sourceDTOs.add(toCrawlerSourceDTO(source));
        }
        dto.setSources(sourceDTOs);
        return dto;
    }

    public SuperAdminCrawlerConfigDTO saveCrawlerConfig(SuperAdminCrawlerConfigDTO request) {
        CatalogCrawlerConfig config = ensureCrawlerConfig();
        config.setUserAgent(
            request.getUserAgent() != null && !request.getUserAgent().isBlank()
                ? request.getUserAgent().trim()
                : DEFAULT_USER_AGENT
        );
        config.setIntervalMinutes(request.getIntervalMinutes() != null ? Math.max(request.getIntervalMinutes(), 5) : 360);
        config.setIsEnabled(request.getEnabled() == null || request.getEnabled());
        config.setUpdatedAt(LocalDateTime.now());
        crawlerConfigRepository.save(config);

        List<CatalogCrawlerSource> existing = crawlerSourceRepository.findAll();
        crawlerSourceRepository.deleteAll(existing);

        List<CatalogCrawlerSource> toSave = new ArrayList<>();
        List<SuperAdminCrawlerSourceDTO> sources = request.getSources() == null ? Collections.emptyList() : request.getSources();
        for (SuperAdminCrawlerSourceDTO sourceDTO : sources) {
            CatalogCrawlerSource source = new CatalogCrawlerSource();
            source.setName(sourceDTO.getName().trim());
            source.setProvider(sourceDTO.getProvider().trim().toUpperCase(Locale.ROOT));
            source.setSourceLicense(sourceDTO.getSourceLicense());
            source.setSeedsJson(toJsonArray(sourceDTO.getSeeds()));
            source.setAllowedDomainsJson(toJsonArray(sourceDTO.getAllowedDomains()));
            source.setProductPathHintsJson(toJsonArray(
                sourceDTO.getProductPathHints() == null || sourceDTO.getProductPathHints().isEmpty()
                    ? List.of("/produto", "/product", "/p/", "/sitemap")
                    : sourceDTO.getProductPathHints()
            ));
            source.setMaxPages(sourceDTO.getMaxPages() != null ? Math.max(sourceDTO.getMaxPages(), 1) : 250);
            source.setMaxRecords(sourceDTO.getMaxRecords() != null ? Math.max(sourceDTO.getMaxRecords(), 1) : 2500);
            source.setRateLimitMs(sourceDTO.getRateLimitMs() != null ? Math.max(sourceDTO.getRateLimitMs(), 100) : 1000);
            source.setRequestTimeoutSec(sourceDTO.getRequestTimeoutSec() != null ? Math.max(sourceDTO.getRequestTimeoutSec(), 5) : 20);
            source.setIsEnabled(sourceDTO.getEnabled() == null || sourceDTO.getEnabled());
            toSave.add(source);
        }
        crawlerSourceRepository.saveAll(toSave);
        return getCrawlerConfig(false);
    }

    private SuperAdminUserDTO toUserDTO(User user) {
        Market market = user.getMarket();
        return new SuperAdminUserDTO(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getRole(),
            user.getIsActive(),
            user.getCreatedAt(),
            market != null ? market.getId() : null,
            market != null ? market.getName() : null,
            market != null ? market.getPlanType() : null,
            market != null ? market.getIsActive() : null
        );
    }

    private SuperAdminMarketDTO toMarketDTO(Market market) {
        long usersCount = userRepository.countByMarket_Id(market.getId());
        return new SuperAdminMarketDTO(
            market.getId(),
            market.getName(),
            market.getCnpj(),
            market.getPlanType(),
            market.getIsActive(),
            market.getCreatedAt(),
            usersCount
        );
    }

    private SuperAdminCrawlerSourceDTO toCrawlerSourceDTO(CatalogCrawlerSource source) {
        SuperAdminCrawlerSourceDTO dto = new SuperAdminCrawlerSourceDTO();
        dto.setId(source.getId());
        dto.setName(source.getName());
        dto.setProvider(source.getProvider());
        dto.setSourceLicense(source.getSourceLicense());
        dto.setSeeds(parseJsonArray(source.getSeedsJson()));
        dto.setAllowedDomains(parseJsonArray(source.getAllowedDomainsJson()));
        dto.setProductPathHints(parseJsonArray(source.getProductPathHintsJson()));
        dto.setMaxPages(source.getMaxPages());
        dto.setMaxRecords(source.getMaxRecords());
        dto.setRateLimitMs(source.getRateLimitMs());
        dto.setRequestTimeoutSec(source.getRequestTimeoutSec());
        dto.setEnabled(source.getIsEnabled());
        return dto;
    }

    private CatalogCrawlerConfig ensureCrawlerConfig() {
        return crawlerConfigRepository.findAll().stream().findFirst().orElseGet(() -> {
            CatalogCrawlerConfig cfg = new CatalogCrawlerConfig();
            cfg.setUserAgent(DEFAULT_USER_AGENT);
            cfg.setIntervalMinutes(360);
            cfg.setIsEnabled(true);
            cfg.setUpdatedAt(LocalDateTime.now());
            return crawlerConfigRepository.save(cfg);
        });
    }

    private void ensureDefaultCrawlerSources() {
        if (crawlerSourceRepository.count() > 0) {
            return;
        }
        crawlerSourceRepository.saveAll(List.of(
            buildDefaultSource(
                "Carrefour Brasil",
                "CARREFOUR_WEB_BR",
                List.of("https://www.carrefour.com.br/sitemap.xml"),
                List.of("www.carrefour.com.br", "carrefour.com.br")
            ),
            buildDefaultSource(
                "Pao de Acucar",
                "PAODEACUCAR_WEB_BR",
                List.of("https://www.paodeacucar.com/sitemap.xml"),
                List.of("www.paodeacucar.com", "paodeacucar.com")
            ),
            buildDefaultSource(
                "Extra",
                "EXTRA_WEB_BR",
                List.of("https://www.clubeextra.com.br/sitemap.xml"),
                List.of("www.clubeextra.com.br", "clubeextra.com.br")
            ),
            buildDefaultSource(
                "Drogaria Sao Paulo",
                "DROGARIASP_WEB_BR",
                List.of("https://www.drogariasaopaulo.com.br/sitemap.xml"),
                List.of("www.drogariasaopaulo.com.br", "drogariasaopaulo.com.br")
            )
        ));
    }

    private CatalogCrawlerSource buildDefaultSource(
        String name,
        String provider,
        List<String> seeds,
        List<String> allowedDomains
    ) {
        CatalogCrawlerSource source = new CatalogCrawlerSource();
        source.setName(name);
        source.setProvider(provider);
        source.setSourceLicense("Public website data (respect provider terms and robots)");
        source.setSeedsJson(toJsonArray(seeds));
        source.setAllowedDomainsJson(toJsonArray(allowedDomains));
        source.setProductPathHintsJson(toJsonArray(List.of("/produto", "/product", "/p/", "/sitemap")));
        source.setMaxPages(250);
        source.setMaxRecords(2500);
        source.setRateLimitMs(1000);
        source.setRequestTimeoutSec(20);
        source.setIsEnabled(true);
        return source;
    }

    private String normalizeSearch(String search) {
        if (search == null || search.isBlank()) {
            return "";
        }
        return "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private String toJsonArray(List<String> values) {
        List<String> sanitized = values == null ? Collections.emptyList() : values.stream()
            .map(value -> value == null ? "" : value.trim())
            .filter(value -> !value.isBlank())
            .toList();
        try {
            return objectMapper.writeValueAsString(sanitized);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Falha ao converter lista de configuracao");
        }
    }

    private List<String> parseJsonArray(String value) {
        if (value == null || value.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (Exception ex) {
            return new ArrayList<>();
        }
    }
}
