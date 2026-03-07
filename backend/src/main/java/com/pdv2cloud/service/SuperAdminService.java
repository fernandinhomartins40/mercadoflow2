package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCategoryOptionDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerConfigDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerJobDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerMonitorDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunClaimRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDetailsDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunFinishRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunStartRequestDTO;
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
import com.pdv2cloud.model.entity.CatalogCrawlerRun;
import com.pdv2cloud.model.entity.CatalogCrawlerSource;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.CatalogCrawlerConfigRepository;
import com.pdv2cloud.repository.CatalogCrawlerRunRepository;
import com.pdv2cloud.repository.CatalogCrawlerSourceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.text.Normalizer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SuperAdminService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};
    private static final String DEFAULT_USER_AGENT = "MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com/catalog-bot)";
    private static final List<FixedCrawlerJob> FIXED_CRAWLER_JOBS = List.of(
        new FixedCrawlerJob(
            "Pao de Acucar",
            "PAODEACUCAR_WEB_BR",
            true,
            "Todas as categorias",
            "GPA public API + bestPrices",
            "extract_and_import_paodeacucar.py",
            "Importa todas as categorias usando a API publica do GPA, com detalhe por produto para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of("https://api.vendas.gpa.digital/pa/v4/products/categories/ecom"),
            List.of("api.vendas.gpa.digital", "www.paodeacucar.com", "paodeacucar.com")
        ),
        new FixedCrawlerJob(
            "Extra Mercado",
            "EXTRA_WEB_BR",
            true,
            "Todas as categorias",
            "GPA public API + bestPrices",
            "extract_and_import_extra.py",
            "Importa todas as categorias usando a API publica do GPA para a bandeira Extra, com detalhe por produto para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of("https://api.vendas.gpa.digital/ex/v4/products/categories/ecom"),
            List.of("api.vendas.gpa.digital", "www.extramercado.com.br", "extramercado.com.br")
        ),
        new FixedCrawlerJob(
            "Carrefour Brasil",
            "CARREFOUR_WEB_BR",
            false,
            "Categorias de supermercado",
            "VTEX sitemap + detail",
            "extract_and_import_carrefour.py",
            "Importa o tenant oficial Mercado Carrefour por sitemap de produtos e detalhe por slug, filtrando as categorias de supermercado definidas para mercearia, bebidas, acougue, hortifruti, limpeza, higiene, casa e pet.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://mercado.carrefour.com.br/sitemap.xml",
                "https://carrefourbrfood.vtexcommercestable.com.br/api/catalog_system/pub/products/search/arroz/p"
            ),
            List.of("mercado.carrefour.com.br", "carrefourbrfood.vtexcommercestable.com.br", "carrefourbrfood.myvtex.com")
        ),
        new FixedCrawlerJob(
            "Drogaria Sao Paulo",
            "DROGARIASP_WEB_BR",
            true,
            "Todas as categorias",
            "VTEX sitemap + detail",
            "extract_and_import_drogariasp.py",
            "Importa todas as categorias por sitemap de produtos e detalhe por slug na VTEX, incluindo medicamentos quando o provider expuser GTIN.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.drogariasaopaulo.com.br/sitemap.xml",
                "https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search/dorflex/p"
            ),
            List.of("www.drogariasaopaulo.com.br", "drogariasaopaulo.com.br")
        ),
        new FixedCrawlerJob(
            "Atacadao Online",
            "ATACADAO_WEB_BR",
            true,
            "Categorias de supermercado",
            "VTEX sitemap + detail",
            "extract_and_import_atacadao.py",
            "Importa o catalogo oficial do Atacadao Online por sitemap de produtos e detalhe por slug, filtrando bebidas, mercearia, limpeza, higiene, padaria, pet shop, automotivo, frios, hortifruti, carnes, vestuario e utilidades domesticas.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.atacadao.com.br/sitemap.xml",
                "https://www.atacadao.com.br/api/catalog_system/pub/products/search/arroz/p"
            ),
            List.of("www.atacadao.com.br", "atacadao.com.br")
        ),
        new FixedCrawlerJob(
            "Super Muffato",
            "SUPERMUFFATO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX sitemap + detail",
            "extract_and_import_supermuffato.py",
            "Importa o catalogo completo do Super Muffato por sitemap de produtos e detalhe por slug para recuperar GTIN, preco e imagem principal.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.supermuffato.com.br/sitemap.xml",
                "https://www.supermuffato.com.br/api/catalog_system/pub/products/search?_from=0&_to=49"
            ),
            List.of("www.supermuffato.com.br", "supermuffato.com.br")
        ),
        new FixedCrawlerJob(
            "Amigao",
            "AMIGAO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX sitemap + detail",
            "extract_and_import_amigao.py",
            "Importa o catalogo completo do Amigao por sitemap de produtos e detalhe na VTEX do tenant oficial, sem depender das paginas de produto que hoje estao instaveis.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.amigao.com/sitemap.xml",
                "https://amigao.vtexcommercestable.com.br/api/catalog_system/pub/products/search?_from=0&_to=49"
            ),
            List.of("www.amigao.com", "amigao.com", "novo.amigao.com", "amigao.vtexcommercestable.com.br")
        ),
        new FixedCrawlerJob(
            "Super Koch",
            "SUPERKOCH_WEB_BR",
            true,
            "Catalogo completo",
            "Sitemap + GraphQL",
            "extract_and_import_superkoch.py",
            "Importa o catalogo do Super Koch por sitemap de produtos e consulta GraphQL oficial por item para recuperar GTIN, preco e imagem quando disponivel.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.superkoch.com.br/sitemap.xml",
                "https://www.superkoch.com.br/categorias/",
                "https://api.superkoch.com.br:443/graphql"
            ),
            List.of("www.superkoch.com.br", "superkoch.com.br", "api.superkoch.com.br")
        )
    );

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
    private CatalogCrawlerRunRepository crawlerRunRepository;

    @Autowired
    private CatalogCrawlerRunArtifactsService catalogCrawlerRunArtifactsService;

    @Autowired
    private CatalogCrawlerCategoryService catalogCrawlerCategoryService;

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

        SuperAdminCrawlerConfigDTO dto = new SuperAdminCrawlerConfigDTO();
        dto.setUserAgent(config.getUserAgent());
        dto.setIntervalMinutes(config.getIntervalMinutes());
        dto.setEnabled(config.getIsEnabled());

        List<SuperAdminCrawlerSourceDTO> sourceDTOs = new ArrayList<>();
        for (FixedCrawlerJob job : FIXED_CRAWLER_JOBS) {
            if (onlyEnabledSources && !job.enabled()) {
                continue;
            }
            sourceDTOs.add(toCrawlerSourceDTO(job));
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
        return getCrawlerConfig(false);
    }

    @Transactional(readOnly = true)
    public SuperAdminCrawlerMonitorDTO getCrawlerMonitor(int size) {
        int safeSize = Math.max(1, Math.min(size, 30));
        Page<CatalogCrawlerRun> runsPage = crawlerRunRepository.findAllByOrderByRequestedAtDesc(
            PageRequest.of(0, safeSize)
        );

        SuperAdminCrawlerMonitorDTO monitor = new SuperAdminCrawlerMonitorDTO();
        monitor.setQueuedRuns(crawlerRunRepository.countByStatus("QUEUED"));
        monitor.setRunningRuns(crawlerRunRepository.countByStatus("RUNNING"));
        monitor.setRecentRuns(runsPage.getContent().stream().map(this::toCrawlerRunDTO).toList());
        crawlerRunRepository.findTopByOrderByRequestedAtDesc().ifPresent(run -> monitor.setLatestRun(toCrawlerRunDTO(run)));
        return monitor;
    }

    @Transactional(readOnly = true)
    public List<SuperAdminCrawlerJobDTO> listCrawlerJobs() {
        return FIXED_CRAWLER_JOBS.stream().map(this::toCrawlerJobDTO).toList();
    }

    @Transactional(readOnly = true)
    public List<SuperAdminCrawlerCategoryOptionDTO> listCrawlerCategories(String provider) {
        findFixedCrawlerJob(provider);
        return catalogCrawlerCategoryService.listCategories(provider);
    }

    public SuperAdminCrawlerRunDTO triggerCrawlerRun(String triggeredBy) {
        throw new IllegalArgumentException("Execucao global desativada. O crawler agora roda manualmente um supermercado por vez.");
    }

    public SuperAdminCrawlerRunDTO triggerCrawlerRunForProvider(
        String provider,
        String triggeredBy,
        List<String> selectedCategories
    ) {
        FixedCrawlerJob job = findFixedCrawlerJob(provider);
        if (!job.enabled()) {
            throw new IllegalArgumentException("Provider temporariamente desabilitado no crawler: " + job.provider());
        }
        ensureNoActiveCrawlerRun(null);
        List<String> sanitizedCategories = sanitizeSelectedCategories(job.provider(), selectedCategories);
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(LocalDateTime.now());
        run.setStatus("QUEUED");
        run.setMessage(
            sanitizedCategories.isEmpty()
                ? "Execucao manual enfileirada. O dispatcher vai rodar somente este supermercado."
                : "Execucao manual enfileirada com " + sanitizedCategories.size() + " categorias selecionadas."
        );
        run.setTriggeredBy(cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN"));
        run.setSourcesJson(toJsonArray(List.of(job.provider())));
        run.setFiltersJson(toFiltersJson(sanitizedCategories));
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    @Transactional(readOnly = true)
    public SuperAdminCrawlerRunDTO getCrawlerRun(UUID runId) {
        CatalogCrawlerRun run = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));
        return toCrawlerRunDTO(run);
    }

    @Transactional(readOnly = true)
    public SuperAdminCrawlerRunDetailsDTO getCrawlerRunDetails(UUID runId, int offset, int limit) {
        return catalogCrawlerRunArtifactsService.buildDetails(getCrawlerRun(runId), offset, limit);
    }

    public SuperAdminCrawlerRunDTO cancelCrawlerRun(UUID runId, String triggeredBy) {
        CatalogCrawlerRun run = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));

        String status = normalizeRunStatus(run.getStatus());
        if (isFinalRunStatus(status)) {
            throw new IllegalArgumentException("A execucao ja foi finalizada e nao pode ser cancelada.");
        }

        LocalDateTime now = LocalDateTime.now();
        run.setStatus("CANCELLED");
        run.setFinishedAt(now);
        run.setMessage(cleanMessage(
            "Cancelado por " + cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN_CANCEL")
                + (run.getMessage() == null || run.getMessage().isBlank() ? "" : " | " + run.getMessage())
        ));
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    public SuperAdminCrawlerRunDTO restartCrawlerRun(UUID runId, String triggeredBy) {
        CatalogCrawlerRun sourceRun = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));
        List<String> sourceProviders = parseJsonArray(sourceRun.getSourcesJson());
        if (sourceProviders.size() != 1) {
            throw new IllegalArgumentException("Reexecucao indisponivel para runs antigos com mais de um supermercado.");
        }
        ensureNoActiveCrawlerRun(runId);

        if (!isFinalRunStatus(sourceRun.getStatus())) {
            cancelCrawlerRun(runId, triggeredBy);
            sourceRun = crawlerRunRepository.findById(runId)
                .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));
        }

        CatalogCrawlerRun newRun = new CatalogCrawlerRun();
        newRun.setRequestedAt(LocalDateTime.now());
        newRun.setStatus("QUEUED");
        newRun.setTriggeredBy(cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN_RESTART"));
        newRun.setSourcesJson(toJsonArray(sourceProviders));
        newRun.setFiltersJson(sourceRun.getFiltersJson());
        newRun.setMessage(cleanMessage("Reexecucao solicitada a partir do run " + sourceRun.getId()));
        return toCrawlerRunDTO(crawlerRunRepository.save(newRun));
    }

    public SuperAdminCrawlerRunDTO claimPendingCrawlerRun(SuperAdminCrawlerRunClaimRequestDTO request) {
        String workerName = request != null ? request.getWorkerName() : null;
        while (true) {
            CatalogCrawlerRun run = crawlerRunRepository.findFirstByStatusOrderByRequestedAtAsc("QUEUED").orElse(null);
            if (run == null) {
                return null;
            }
            List<String> providers = parseJsonArray(run.getSourcesJson());
            if (providers.size() != 1) {
                run.setStatus("FAILED");
                run.setStartedAt(run.getStartedAt() != null ? run.getStartedAt() : LocalDateTime.now());
                run.setFinishedAt(LocalDateTime.now());
                run.setMessage("Execucao rejeitada: o modo manual aceita somente um supermercado por vez.");
                crawlerRunRepository.save(run);
                continue;
            }

            run.setStatus("RUNNING");
            run.setStartedAt(LocalDateTime.now());
            run.setMessage("Execucao manual iniciada pelo dispatcher.");
            if (run.getTriggeredBy() == null || run.getTriggeredBy().isBlank()) {
                run.setTriggeredBy(cleanLabel(workerName, "PYTHON_CRAWLER"));
            }
            return toCrawlerRunDTO(crawlerRunRepository.save(run));
        }
    }

    public SuperAdminCrawlerRunDTO startCrawlerRun(SuperAdminCrawlerRunStartRequestDTO request) {
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(LocalDateTime.now());
        run.setStartedAt(LocalDateTime.now());
        run.setStatus("RUNNING");
        run.setTriggeredBy(cleanLabel(request != null ? request.getTriggeredBy() : null, "SCHEDULED_CRAWLER"));
        run.setMessage(cleanMessage(request != null ? request.getMessage() : null));
        run.setSourcesJson(toJsonArray(request != null ? request.getSources() : Collections.emptyList()));
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    public SuperAdminCrawlerRunDTO finishCrawlerRun(UUID runId, SuperAdminCrawlerRunFinishRequestDTO request) {
        CatalogCrawlerRun run = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));

        run.setStatus(normalizeRunStatus(request != null ? request.getStatus() : null));
        if (run.getStartedAt() == null) {
            run.setStartedAt(LocalDateTime.now());
        }
        run.setFinishedAt(LocalDateTime.now());
        run.setScannedProducts(safeInt(request != null ? request.getScannedProducts() : null));
        run.setImportedProducts(safeInt(request != null ? request.getImportedProducts() : null));
        run.setSkippedInvalidGtin(safeInt(request != null ? request.getSkippedInvalidGtin() : null));
        run.setSkippedMissingName(safeInt(request != null ? request.getSkippedMissingName() : null));
        run.setSkippedMedication(safeInt(request != null ? request.getSkippedMedication() : null));
        run.setSkippedDuplicateGtin(safeInt(request != null ? request.getSkippedDuplicateGtin() : null));
        run.setErrors(safeInt(request != null ? request.getErrors() : null));
        run.setMessage(cleanMessage(request != null ? request.getMessage() : null));
        List<String> sources = request != null ? request.getSources() : Collections.emptyList();
        if (sources != null && !sources.isEmpty()) {
            run.setSourcesJson(toJsonArray(sources));
        }
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
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

    private SuperAdminCrawlerSourceDTO toCrawlerSourceDTO(FixedCrawlerJob job) {
        SuperAdminCrawlerSourceDTO dto = new SuperAdminCrawlerSourceDTO();
        dto.setName(job.name());
        dto.setProvider(job.provider());
        dto.setSourceLicense(job.sourceLicense());
        dto.setSeeds(job.seeds());
        dto.setAllowedDomains(job.allowedDomains());
        dto.setProductPathHints(List.of("/produto", "/p/", "/api/catalog_system/pub/products/search"));
        dto.setMaxPages(5000);
        dto.setMaxRecords(2_000_000);
        dto.setRateLimitMs(250);
        dto.setRequestTimeoutSec(40);
        dto.setEnabled(job.enabled());
        return dto;
    }

    private SuperAdminCrawlerRunDTO toCrawlerRunDTO(CatalogCrawlerRun run) {
        SuperAdminCrawlerRunDTO dto = new SuperAdminCrawlerRunDTO();
        dto.setId(run.getId());
        dto.setStatus(run.getStatus());
        dto.setRequestedAt(run.getRequestedAt());
        dto.setStartedAt(run.getStartedAt());
        dto.setFinishedAt(run.getFinishedAt());
        dto.setScannedProducts(run.getScannedProducts());
        dto.setImportedProducts(run.getImportedProducts());
        dto.setSkippedInvalidGtin(run.getSkippedInvalidGtin());
        dto.setSkippedMissingName(run.getSkippedMissingName());
        dto.setSkippedMedication(run.getSkippedMedication());
        dto.setSkippedDuplicateGtin(run.getSkippedDuplicateGtin());
        dto.setErrors(run.getErrors());
        dto.setMessage(run.getMessage());
        dto.setTriggeredBy(run.getTriggeredBy());
        dto.setSources(parseJsonArray(run.getSourcesJson()));
        dto.setSelectedCategories(parseSelectedCategories(run.getFiltersJson()));
        return dto;
    }

    private SuperAdminCrawlerJobDTO toCrawlerJobDTO(FixedCrawlerJob job) {
        String quotedProvider = "\"" + job.provider() + "\"";
        SuperAdminCrawlerJobDTO dto = new SuperAdminCrawlerJobDTO();
        dto.setProvider(job.provider());
        dto.setName(job.name());
        dto.setEnabled(job.enabled());
        dto.setScopeLabel(job.scopeLabel());
        dto.setExtractorType(job.extractorType());
        dto.setScriptName(job.scriptName());
        dto.setDescription(job.description());
        dto.setSourceLicense(job.sourceLicense());
        dto.setIncludesMedication(job.includesMedication());
        dto.setDownloadsImages(job.downloadsImages());
        dto.setQueuedRuns((int) crawlerRunRepository.countByStatusAndSourcesJsonContaining("QUEUED", quotedProvider));
        dto.setRunningRuns((int) crawlerRunRepository.countByStatusAndSourcesJsonContaining("RUNNING", quotedProvider));
        crawlerRunRepository.findTopBySourcesJsonContainingOrderByRequestedAtDesc(quotedProvider)
            .ifPresent(run -> dto.setLastRun(toCrawlerRunDTO(run)));
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

    private String exportEnabledProvidersAsJson() {
        return toJsonArray(FIXED_CRAWLER_JOBS.stream()
            .filter(FixedCrawlerJob::enabled)
            .map(FixedCrawlerJob::provider)
            .toList());
    }

    private FixedCrawlerJob findFixedCrawlerJob(String provider) {
        String normalizedProvider = provider == null ? "" : provider.trim().toUpperCase(Locale.ROOT);
        return FIXED_CRAWLER_JOBS.stream()
            .filter(job -> job.provider().equals(normalizedProvider))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Provider fixo do crawler nao encontrado: " + normalizedProvider));
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

    private String toFiltersJson(List<String> selectedCategories) {
        return toJsonArray(selectedCategories == null ? Collections.emptyList() : selectedCategories);
    }

    private List<String> parseSelectedCategories(String filtersJson) {
        return parseJsonArray(filtersJson);
    }

    private List<String> sanitizeSelectedCategories(String provider, List<String> selectedCategories) {
        if (selectedCategories == null || selectedCategories.isEmpty()) {
            return Collections.emptyList();
        }
        Set<String> allowed = new HashSet<>();
        for (SuperAdminCrawlerCategoryOptionDTO option : catalogCrawlerCategoryService.listCategories(provider)) {
            String normalized = normalizeCategoryValue(option.getValue());
            if (!normalized.isBlank()) {
                allowed.add(normalized);
            }
        }

        List<String> sanitized = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String value : selectedCategories) {
            String cleanValue = cleanCategoryValue(value);
            String normalized = normalizeCategoryValue(cleanValue);
            if (normalized.isBlank()) {
                continue;
            }
            if (!allowed.isEmpty() && !allowed.contains(normalized)) {
                continue;
            }
            if (seen.add(normalized)) {
                sanitized.add(cleanValue);
            }
        }
        return sanitized;
    }

    private String cleanCategoryValue(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
    }

    private String normalizeCategoryValue(String value) {
        String cleaned = cleanCategoryValue(value).toLowerCase(Locale.ROOT);
        if (cleaned.isBlank()) {
            return "";
        }
        return Normalizer.normalize(cleaned, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    private String cleanLabel(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.length() > 120 ? trimmed.substring(0, 120) : trimmed;
    }

    private String cleanMessage(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > 2000 ? trimmed.substring(0, 2000) : trimmed;
    }

    private String normalizeRunStatus(String status) {
        if (status == null || status.isBlank()) {
            return "SUCCESS";
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "SUCCESS", "FAILED", "RUNNING", "QUEUED", "CANCELLED" -> normalized;
            default -> "SUCCESS";
        };
    }

    private boolean isFinalRunStatus(String status) {
        String normalized = normalizeRunStatus(status);
        return "SUCCESS".equals(normalized) || "FAILED".equals(normalized) || "CANCELLED".equals(normalized);
    }

    private void ensureNoActiveCrawlerRun(UUID ignoredRunId) {
        List<String> activeStatuses = List.of("QUEUED", "RUNNING");
        long activeCount = ignoredRunId == null
            ? crawlerRunRepository.countByStatusIn(activeStatuses)
            : crawlerRunRepository.countByStatusInAndIdNot(activeStatuses, ignoredRunId);
        if (activeCount > 0) {
            throw new IllegalArgumentException("Ja existe uma execucao em andamento ou na fila. O painel agora executa um supermercado por vez.");
        }
    }

    private Integer safeInt(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private record FixedCrawlerJob(
        String name,
        String provider,
        boolean enabled,
        String scopeLabel,
        String extractorType,
        String scriptName,
        String description,
        String sourceLicense,
        boolean includesMedication,
        boolean downloadsImages,
        List<String> seeds,
        List<String> allowedDomains
    ) {
    }
}
