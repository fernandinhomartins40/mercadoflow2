package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.CatalogImageRepairResponseDTO;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCatalogImageRepairRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCheckpointBatchItemDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCheckpointBatchRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCheckpointDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCatalogImageStatusDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCatalogImageStatusRequestDTO;
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
import com.pdv2cloud.model.dto.SuperAdminUserUpdateRequest;
import com.pdv2cloud.model.entity.CatalogCrawlerConfig;
import com.pdv2cloud.model.entity.CatalogCrawlerCheckpoint;
import com.pdv2cloud.model.entity.CatalogCrawlerRun;
import com.pdv2cloud.model.entity.CatalogCrawlerSource;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.CatalogCrawlerConfigRepository;
import com.pdv2cloud.repository.CatalogCrawlerCheckpointRepository;
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
import org.springframework.web.multipart.MultipartFile;

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
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_carrefour.py",
            "Importa o catalogo completo do Mercado Carrefour pela arvore oficial de categorias VTEX, com detalhamento por slug para recuperar GTIN, preco e imagem principal.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://carrefourbrfood.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/20",
                "https://carrefourbrfood.vtexcommercestable.com.br/api/catalog_system/pub/products/search/arroz/p"
            ),
            List.of("mercado.carrefour.com.br", "carrefourbrfood.vtexcommercestable.com.br", "carrefourbrfood.myvtex.com")
        ),
        new FixedCrawlerJob(
            "Drogaria Sao Paulo",
            "DROGARIASP_WEB_BR",
            true,
            "Todas as categorias",
            "VTEX category tree + detail",
            "extract_and_import_drogariasp.py",
            "Importa todas as categorias pela arvore oficial da VTEX e detalha os itens por slug, incluindo medicamentos quando o provider expuser GTIN.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.drogariasaopaulo.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search/dorflex/p"
            ),
            List.of("www.drogariasaopaulo.com.br", "drogariasaopaulo.com.br")
        ),
        new FixedCrawlerJob(
            "Atacadao Online",
            "ATACADAO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_atacadao.py",
            "Importa o catalogo completo do Atacadao pela arvore oficial de categorias VTEX e detalha os itens por slug para recuperar GTIN, preco e imagem principal.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.atacadao.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.atacadao.com.br/api/catalog_system/pub/products/search/arroz/p"
            ),
            List.of("www.atacadao.com.br", "atacadao.com.br")
        ),
        new FixedCrawlerJob(
            "Super Muffato",
            "SUPERMUFFATO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_supermuffato.py",
            "Importa o catalogo completo do Super Muffato pela arvore oficial de categorias VTEX e detalhe por slug para recuperar GTIN, preco e imagem principal.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.supermuffato.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.supermuffato.com.br/api/catalog_system/pub/products/search?_from=0&_to=49"
            ),
            List.of("www.supermuffato.com.br", "supermuffato.com.br")
        ),
        new FixedCrawlerJob(
            "Amigao",
            "AMIGAO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_amigao.py",
            "Importa o catalogo completo do Amigao pela arvore oficial de categorias e detalhe na VTEX do tenant oficial, sem depender das paginas de produto que hoje estao instaveis.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://amigao.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/20",
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
        ),
        new FixedCrawlerJob(
            "Angeloni",
            "ANGELONI_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_angeloni.py",
            "Importa o catalogo do Angeloni Eletro pela arvore oficial do tenant VTEX e detalha os itens pelo tenant publico quando o site principal nao expor diretamente a Search API.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.angeloni.com.br/sitemap.xml",
                "https://eletroangeloni.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.angeloni.com.br/eletro/vela-decorativa-marfim-7x10cm-acasa-3970465/p"
            ),
            List.of("www.angeloni.com.br", "angeloni.com.br", "eletroangeloni.vtexcommercestable.com.br", "eletroangeloni.myvtex.com")
        ),
        new FixedCrawlerJob(
            "Bistek",
            "BISTEK_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_bistek.py",
            "Importa o catalogo completo do Bistek pela arvore oficial da VTEX, com complemento por sitemap e detalhamento por slug para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.bistek.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.bistek.com.br/sitemap.xml"
            ),
            List.of("www.bistek.com.br", "bistek.com.br")
        ),
        new FixedCrawlerJob(
            "Delivery Fort",
            "DELIVERYFORT_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_deliveryfort.py",
            "Importa o catalogo completo do Delivery Fort pela arvore oficial da VTEX legacy, com complemento por sitemap para recuperar itens residuais e detalhamento por slug.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.deliveryfort.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.deliveryfort.com.br/sitemap.xml"
            ),
            List.of("www.deliveryfort.com.br", "deliveryfort.com.br")
        ),
        new FixedCrawlerJob(
            "Festval",
            "FESTVAL_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_festval.py",
            "Importa o catalogo completo do Festval pela arvore oficial da VTEX e detalhamento por slug para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.festval.com/api/catalog_system/pub/category/tree/20",
                "https://www.festval.com/mix_cenoura_e_vagem_350_g/p"
            ),
            List.of("www.festval.com", "festval.com")
        ),
        new FixedCrawlerJob(
            "Giassi",
            "GIASSI_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_giassi.py",
            "Importa o catalogo completo do Giassi pela arvore oficial da VTEX, com complemento por sitemap e detalhamento por slug para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.giassi.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.giassi.com.br/sitemap.xml",
                "https://www.giassi.com.br/gelato_leite_e_creme_de_leite_bacio_di_latte_casa_pote_490ml_1638491/p"
            ),
            List.of("www.giassi.com.br", "giassi.com.br")
        ),
        new FixedCrawlerJob(
            "Super Nosso",
            "SUPERNOSSO_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_supernosso.py",
            "Importa o catalogo completo do Super Nosso pela arvore oficial da VTEX ou endpoints legacy compativeis, com complemento por sitemap e detalhamento por slug.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.supernosso.com/api/catalog_system/pub/category/tree/20",
                "https://www.supernosso.com/sitemap.xml",
                "https://www.supernosso.com/88080-whisky-black---white-1l/p"
            ),
            List.of("www.supernosso.com", "supernosso.com")
        ),
        new FixedCrawlerJob(
            "Supermercado Guanabara",
            "GUANABARA_WEB_BR",
            true,
            "Catalogo completo",
            "Sitemap + HTML detail",
            "extract_and_import_guanabara.py",
            "Importa o catalogo do Guanabara pela leitura de sitemap e detalhamento HTML/JSON-LD das paginas, mantendo compatibilidade com a plataforma online atual.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://smguanabaraonline.com.br/sitemap.xml",
                "https://smguanabaraonline.com.br/"
            ),
            List.of("smguanabaraonline.com.br", "www.smguanabaraonline.com.br", "api.smguanabaraonline.com.br")
        ),
        new FixedCrawlerJob(
            "Redetop Online",
            "REDETOPONLINE_WEB_BR",
            true,
            "Catalogo completo",
            "VIPCommerce API + departamentos e colecoes",
            "extract_and_import_redetop.py",
            "Importa o catalogo do Redetop Online diretamente pela API VIPCommerce, varrendo departamentos e colecoes publicas com deduplicacao por GTIN.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.redetoponline.com.br/sitemap.xml",
                "https://www.redetoponline.com.br/produto/7922/creme-leite-lactovale-330g-nata-pacote"
            ),
            List.of("www.redetoponline.com.br", "redetoponline.com.br")
        ),
        new FixedCrawlerJob(
            "Nordestao Online",
            "NORDESTAO_WEB_BR",
            true,
            "Catalogo completo",
            "VIPCommerce API + departamentos e colecoes",
            "extract_and_import_nordestao.py",
            "Importa o catalogo do Nordestao Online diretamente pela API VIPCommerce, varrendo departamentos e colecoes publicas com deduplicacao por GTIN.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.lojaonline.nordestao.com.br/sitemap.xml",
                "https://www.lojaonline.nordestao.com.br/produto/11635/tomate-italiano-kg"
            ),
            List.of("www.lojaonline.nordestao.com.br", "lojaonline.nordestao.com.br")
        ),
        new FixedCrawlerJob(
            "Condor",
            "CONDOR_WEB_BR",
            true,
            "Catalogo completo",
            "Sitemap + GraphQL",
            "extract_and_import_condor.py",
            "Importa o catalogo completo do Condor por sitemap de produtos e detalhamento GraphQL oficial por item para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of(
                "https://www.condor.com.br/sitemap.xml",
                "https://api.condor.com.br/graphql"
            ),
            List.of("www.condor.com.br", "condor.com.br", "api.condor.com.br")
        ),
        new FixedCrawlerJob(
            "Farmacias Nissei",
            "FARMACIASNISSEI_WEB_BR",
            true,
            "Catalogo completo",
            "Sitemap + HTML detail",
            "extract_and_import_farmaciasnissei.py",
            "Importa o catalogo completo da Farmacias Nissei por sitemaps de produto e parse de JSON-LD/HTML das paginas para recuperar GTIN, categoria, descricao, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.farmaciasnissei.com.br/sitemap.xml",
                "https://www.farmaciasnissei.com.br/sitemaps/categorias.xml"
            ),
            List.of("www.farmaciasnissei.com.br", "farmaciasnissei.com.br")
        ),
        new FixedCrawlerJob(
            "Extrafarma",
            "EXTRAFARMA_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_extrafarma.py",
            "Importa o catalogo completo da Extrafarma pela arvore oficial da VTEX, com complemento por sitemap e detalhamento por slug para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.extrafarma.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.extrafarma.com.br/sitemap.xml"
            ),
            List.of("www.extrafarma.com.br", "extrafarma.com.br")
        ),
        new FixedCrawlerJob(
            "Pague Menos",
            "PAGUEMENOS_WEB_BR",
            true,
            "Catalogo completo",
            "VTEX category tree + detail",
            "extract_and_import_paguemenos.py",
            "Importa o catalogo completo da Pague Menos pela arvore oficial da VTEX, com complemento por sitemap e detalhamento por slug para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.paguemenos.com.br/api/catalog_system/pub/category/tree/20",
                "https://www.paguemenos.com.br/sitemap.xml"
            ),
            List.of("www.paguemenos.com.br", "paguemenos.com.br")
        ),
        new FixedCrawlerJob(
            "Drogaria Raia",
            "DROGARAIA_WEB_BR",
            true,
            "Catalogo completo",
            "Next.js category pages",
            "extract_and_import_drogaraia.py",
            "Importa o catalogo publico da Drogaria Raia pelas categorias server-side expostas no HTML do site, recuperando GTIN, descricao, imagem e URL canonica do produto.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of(
                "https://www.drogaraia.com.br/",
                "https://www.drogaraia.com.br/search?w=dorflex"
            ),
            List.of("www.drogaraia.com.br", "drogaraia.com.br")
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
    private CatalogCrawlerCheckpointRepository crawlerCheckpointRepository;

    @Autowired
    private CatalogCrawlerSourceRepository crawlerSourceRepository;

    @Autowired
    private CatalogCrawlerRunRepository crawlerRunRepository;

    @Autowired
    private CatalogCrawlerRunArtifactsService catalogCrawlerRunArtifactsService;

    @Autowired
    private CatalogCrawlerCategoryService catalogCrawlerCategoryService;

    @Autowired
    private CatalogCrawlerCatalogStatusService catalogCrawlerCatalogStatusService;

    @Autowired
    private CatalogImageRepairService catalogImageRepairService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public SuperAdminOverviewDTO getOverview() {
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByIsActive(true);
        long blockedUsers = totalUsers - activeUsers;
        long orphanUsers = userRepository.countByMarketIsNullAndRoleNot(UserRole.SUPER_ADMIN);
        long totalMarkets = marketRepository.count();
        long activeMarkets = marketRepository.countByIsActive(true);
        List<Market> markets = marketRepository.findAll();
        long pendingMarkets = markets.stream().filter(market -> market.getBillingStatus() == MarketBillingStatus.PENDING).count();
        long trialMarkets = markets.stream().filter(market -> market.getBillingStatus() == MarketBillingStatus.TRIAL).count();
        long pastDueMarkets = markets.stream().filter(market -> market.getBillingStatus() == MarketBillingStatus.PAST_DUE).count();
        long suspendedMarkets = markets.stream().filter(this::isMarketAccessBlocked).count();
        long expiringMarkets = markets.stream().filter(this::isMarketExpiringSoon).count();
        long seatLimitTotal = markets.stream()
            .map(Market::getUserSeatLimit)
            .filter(limit -> limit != null && limit > 0)
            .mapToLong(Integer::longValue)
            .sum();
        long seatUsedTotal = markets.stream()
            .mapToLong(market -> userRepository.countByMarket_IdAndIsActive(market.getId(), true))
            .sum();
        long totalCatalogProducts = productRepository.count();
        long totalCatalogEnrichments = productEnrichmentRepository.count();
        return new SuperAdminOverviewDTO(
            totalUsers,
            activeUsers,
            blockedUsers,
            orphanUsers,
            totalMarkets,
            activeMarkets,
            pendingMarkets,
            trialMarkets,
            pastDueMarkets,
            suspendedMarkets,
            expiringMarkets,
            seatLimitTotal,
            seatUsedTotal,
            totalCatalogProducts,
            totalCatalogEnrichments
        );
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminUserDTO> listUsers(String search, String role, Boolean active, UUID marketId, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return userRepository.searchForSuperAdmin(pattern, normalizeUserRole(role), active, marketId, pageable).map(this::toUserDTO);
    }

    public SuperAdminUserDTO createUser(SuperAdminUserCreateRequest request) {
        String normalizedEmail = normalizeEmail(request.getEmail());
        if (userRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("Email ja cadastrado");
        }

        User user = new User();
        user.setPassword(passwordEncoder.encode(request.getPassword().trim()));
        applyUserFields(
            user,
            request.getName(),
            normalizedEmail,
            request.getRole(),
            request.getMarketId(),
            request.getIsActive(),
            true
        );

        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUser(UUID userId, SuperAdminUserUpdateRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));

        String normalizedEmail = request.getEmail() != null ? normalizeEmail(request.getEmail()) : user.getEmail();
        userRepository.findByEmail(normalizedEmail)
            .filter(found -> !found.getId().equals(userId))
            .ifPresent(found -> {
                throw new IllegalArgumentException("Email ja cadastrado");
            });

        applyUserFields(
            user,
            request.getName(),
            normalizedEmail,
            request.getRole(),
            request.getMarketId(),
            request.getIsActive(),
            false
        );
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword().trim()));
        }
        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserStatus(UUID userId, SuperAdminUserStatusRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        ensureSuperAdminCanStillOperate(user, user.getRole(), request.getActive());
        user.setIsActive(Boolean.TRUE.equals(request.getActive()));
        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserRole(UUID userId, SuperAdminUserRoleUpdateRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        ensureSuperAdminCanStillOperate(user, request.getRole(), user.getIsActive());
        user.setRole(request.getRole());
        if (request.getRole() == UserRole.SUPER_ADMIN) {
            user.setMarket(null);
        }
        return toUserDTO(userRepository.save(user));
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminMarketDTO> listMarkets(String search, String planType, String billingStatus, Boolean active, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return marketRepository.searchForSuperAdmin(
            pattern,
            normalizePlanType(planType),
            normalizeBillingStatus(billingStatus),
            active,
            pageable
        ).map(this::toMarketDTO);
    }

    public SuperAdminMarketDTO createMarket(SuperAdminMarketCreateRequest request) {
        Market market = new Market();
        applyMarketFields(market, request);
        return toMarketDTO(marketRepository.save(market));
    }

    public SuperAdminMarketDTO updateMarket(UUID marketId, SuperAdminMarketUpdateRequest request) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
        applyMarketFields(market, request);
        return toMarketDTO(marketRepository.save(market));
    }

    public CatalogAdminProductDTO upsertCatalogProduct(SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.upsertManualCatalogProduct(request);
    }

    public CatalogAdminProductDTO updateCatalogProduct(UUID productId, SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.updateManualCatalogProduct(productId, request);
    }

    public CatalogAdminProductDTO replaceCatalogProductImage(UUID productId, String provider, MultipartFile file) {
        return productCatalogService.replaceCatalogProductImage(productId, provider, file);
    }

    public CatalogAdminProductDTO removeCatalogProductImage(UUID productId, String provider) {
        return productCatalogService.removeCatalogProductImage(productId, provider);
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

    @Transactional(readOnly = true)
    public List<SuperAdminCrawlerCheckpointDTO> listCrawlerCheckpoints(
        String provider,
        String scopeType,
        String status,
        int limit
    ) {
        String normalizedProvider = cleanLabel(provider, "").toUpperCase(Locale.ROOT);
        if (normalizedProvider.isBlank()) {
            throw new IllegalArgumentException("Provider do checkpoint e obrigatorio.");
        }
        int safeLimit = Math.max(1, Math.min(limit, 5000));
        String normalizedStatus = normalizeCheckpointStatus(status);
        String normalizedScopeType = cleanLabel(scopeType, "").toUpperCase(Locale.ROOT);
        List<CatalogCrawlerCheckpoint> checkpoints = normalizedScopeType.isBlank()
            ? crawlerCheckpointRepository.findTop5000ByProviderAndStatusOrderByUpdatedAtDesc(normalizedProvider, normalizedStatus)
            : crawlerCheckpointRepository.findTop5000ByProviderAndScopeTypeAndStatusOrderByUpdatedAtDesc(
                normalizedProvider,
                normalizedScopeType,
                normalizedStatus
            );
        return checkpoints.stream().limit(safeLimit).map(this::toCrawlerCheckpointDTO).toList();
    }

    public void upsertCrawlerCheckpoints(SuperAdminCrawlerCheckpointBatchRequestDTO request) {
        if (request == null) {
            throw new IllegalArgumentException("Payload de checkpoint ausente.");
        }
        String normalizedProvider = cleanLabel(request.getProvider(), "").toUpperCase(Locale.ROOT);
        if (normalizedProvider.isBlank()) {
            throw new IllegalArgumentException("Provider do checkpoint e obrigatorio.");
        }
        List<SuperAdminCrawlerCheckpointBatchItemDTO> items = request.getItems() == null ? Collections.emptyList() : request.getItems();
        if (items.isEmpty()) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        List<CatalogCrawlerCheckpoint> checkpoints = new ArrayList<>();
        for (SuperAdminCrawlerCheckpointBatchItemDTO item : items) {
            String scopeType = cleanLabel(item.getScopeType(), "").toUpperCase(Locale.ROOT);
            String scopeKey = cleanScopeKey(item.getScopeKey());
            if (scopeType.isBlank() || scopeKey.isBlank()) {
                continue;
            }
            CatalogCrawlerCheckpoint checkpoint = crawlerCheckpointRepository
                .findByProviderAndScopeTypeAndScopeKey(normalizedProvider, scopeType, scopeKey)
                .orElseGet(CatalogCrawlerCheckpoint::new);
            checkpoint.setProvider(normalizedProvider);
            checkpoint.setScopeType(scopeType);
            checkpoint.setScopeKey(scopeKey);
            checkpoint.setScopeHash(cleanLabel(item.getScopeHash(), ""));
            checkpoint.setStatus(normalizeCheckpointStatus(item.getStatus()));
            checkpoint.setRunId(request.getRunId());
            checkpoint.setItemCount(safeInt(item.getItemCount()));
            checkpoint.setMetadataJson(toJsonObject(item.getMetadata()));
            checkpoint.setErrorMessage(cleanMessage(item.getErrorMessage()));
            checkpoint.setLastSeenAt(now);
            if ("COMPLETED".equals(checkpoint.getStatus())) {
                checkpoint.setCompletedAt(now);
            }
            checkpoints.add(checkpoint);
        }
        if (!checkpoints.isEmpty()) {
            crawlerCheckpointRepository.saveAll(checkpoints);
        }
    }

    @Transactional(readOnly = true)
    public List<SuperAdminCrawlerCatalogImageStatusDTO> auditCrawlerCatalogImageStatus(
        SuperAdminCrawlerCatalogImageStatusRequestDTO request
    ) {
        if (request == null) {
            throw new IllegalArgumentException("Payload de auditoria de imagem ausente.");
        }
        String provider = cleanLabel(request.getProvider(), "").toUpperCase(Locale.ROOT);
        if (provider.isBlank()) {
            throw new IllegalArgumentException("Provider da auditoria de imagem e obrigatorio.");
        }
        return catalogCrawlerCatalogStatusService.auditCatalogImageStatus(provider, request.getCodes());
    }

    public CatalogImageRepairResponseDTO repairCatalogImages(SuperAdminCatalogImageRepairRequestDTO request) {
        if (request == null) {
            return catalogImageRepairService.runManualRepair("", null, null, "MANUAL_SUPER_ADMIN_IMAGE_REPAIR");
        }
        return catalogImageRepairService.runManualRepair(
            cleanLabel(request.getProvider(), ""),
            request.getMaxItems(),
            request.getBatchSize(),
            cleanLabel(request.getTriggeredBy(), "MANUAL_SUPER_ADMIN_IMAGE_REPAIR")
        );
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

    public SuperAdminCrawlerRunDTO resumeCrawlerRun(UUID runId, String triggeredBy) {
        CatalogCrawlerRun sourceRun = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));
        List<String> sourceProviders = parseJsonArray(sourceRun.getSourcesJson());
        if (sourceProviders.size() != 1) {
            throw new IllegalArgumentException("Retomada indisponivel para runs antigos com mais de um supermercado.");
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
        newRun.setTriggeredBy(cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN_RESUME"));
        newRun.setSourcesJson(toJsonArray(sourceProviders));
        newRun.setFiltersJson(sourceRun.getFiltersJson());
        newRun.setMessage(cleanMessage("Retomada por checkpoint solicitada a partir do run " + sourceRun.getId()));
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

    private void applyUserFields(
        User user,
        String name,
        String email,
        UserRole role,
        UUID marketId,
        Boolean isActive,
        boolean creating
    ) {
        if (creating || (name != null && !name.isBlank())) {
            user.setName(name.trim());
        }
        if (creating || email != null) {
            user.setEmail(email);
        }
        if (creating || role != null) {
            UserRole resolvedRole = role != null ? role : UserRole.MARKET_OWNER;
            ensureSuperAdminCanStillOperate(user, resolvedRole, isActive != null ? isActive : user.getIsActive());
            user.setRole(resolvedRole);
        }
        if (creating || isActive != null) {
            boolean nextActive = isActive == null ? Boolean.TRUE.equals(user.getIsActive()) : Boolean.TRUE.equals(isActive);
            ensureSuperAdminCanStillOperate(user, user.getRole(), nextActive);
            user.setIsActive(nextActive);
        }
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            user.setMarket(null);
            return;
        }
        user.setMarket(resolveMarket(marketId));
    }

    private void applyMarketFields(Market market, SuperAdminMarketCreateRequest request) {
        market.setName(request.getName().trim());
        market.setCnpj(normalizeOptionalText(request.getCnpj()));
        market.setPlanType(request.getPlanType() != null ? request.getPlanType() : PlanType.FREE);
        market.setBillingStatus(request.getBillingStatus() != null ? request.getBillingStatus() : MarketBillingStatus.ACTIVE);
        market.setIsActive(request.getActive() == null || request.getActive());
        market.setUserSeatLimit(resolveSeatLimit(request.getUserSeatLimit(), market.getPlanType()));
        market.setAccessExpiresAt(request.getAccessExpiresAt());
        market.setTrialEndsAt(request.getTrialEndsAt());
        market.setContactName(normalizeOptionalText(request.getContactName()));
        market.setContactEmail(normalizeOptionalEmail(request.getContactEmail()));
        market.setContactPhone(normalizeOptionalText(request.getContactPhone()));
        market.setNotes(normalizeOptionalLongText(request.getNotes()));
        ensureTrialDefaults(market);
    }

    private void applyMarketFields(Market market, SuperAdminMarketUpdateRequest request) {
        if (request.getName() != null && !request.getName().isBlank()) {
            market.setName(request.getName().trim());
        }
        if (request.getCnpj() != null) {
            market.setCnpj(normalizeOptionalText(request.getCnpj()));
        }
        if (request.getPlanType() != null) {
            market.setPlanType(request.getPlanType());
            if (market.getUserSeatLimit() == null || market.getUserSeatLimit() <= 0) {
                market.setUserSeatLimit(resolveSeatLimit(null, request.getPlanType()));
            }
        }
        if (request.getBillingStatus() != null) {
            market.setBillingStatus(request.getBillingStatus());
        }
        if (request.getActive() != null) {
            market.setIsActive(request.getActive());
        }
        if (request.getUserSeatLimit() != null) {
            market.setUserSeatLimit(resolveSeatLimit(request.getUserSeatLimit(), market.getPlanType()));
        }
        market.setAccessExpiresAt(request.getAccessExpiresAt());
        market.setTrialEndsAt(request.getTrialEndsAt());
        market.setContactName(normalizeOptionalText(request.getContactName()));
        market.setContactEmail(normalizeOptionalEmail(request.getContactEmail()));
        market.setContactPhone(normalizeOptionalText(request.getContactPhone()));
        market.setNotes(normalizeOptionalLongText(request.getNotes()));
        ensureTrialDefaults(market);
    }

    private Market resolveMarket(UUID marketId) {
        if (marketId == null) {
            return null;
        }
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
    }

    private Integer resolveSeatLimit(Integer requestedSeatLimit, PlanType planType) {
        if (requestedSeatLimit != null) {
            return Math.max(1, requestedSeatLimit);
        }
        // Assentos vem do proprio catalogo de planos, para nao existirem dois
        // lugares definindo o mesmo limite.
        PlanType resolvedPlan = planType != null ? planType : PlanType.FREE;
        int planSeats = resolvedPlan.getUserSeatLimit();
        return PlanType.isUnlimited(planSeats) ? null : planSeats;
    }

    private void ensureTrialDefaults(Market market) {
        if (market.getBillingStatus() != MarketBillingStatus.TRIAL) {
            return;
        }
        if (market.getTrialEndsAt() == null) {
            market.setTrialEndsAt(LocalDateTime.now().plusDays(14));
        }
        if (market.getAccessExpiresAt() == null) {
            market.setAccessExpiresAt(market.getTrialEndsAt());
        }
    }

    private void ensureSuperAdminCanStillOperate(User user, UserRole nextRole, Boolean nextActive) {
        UserRole resolvedRole = nextRole != null ? nextRole : user.getRole();
        boolean resolvedActive = nextActive == null ? Boolean.TRUE.equals(user.getIsActive()) : Boolean.TRUE.equals(nextActive);
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            return;
        }
        if (resolvedRole == UserRole.SUPER_ADMIN && resolvedActive) {
            return;
        }
        long activeSuperAdmins = userRepository.countByRoleAndIsActive(UserRole.SUPER_ADMIN, true);
        if (activeSuperAdmins <= 1) {
            throw new IllegalArgumentException("Nao e permitido remover ou bloquear o ultimo SUPER_ADMIN ativo da plataforma.");
        }
    }

    private UserRole normalizeUserRole(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UserRole.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private PlanType normalizePlanType(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return PlanType.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private MarketBillingStatus normalizeBillingStatus(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return MarketBillingStatus.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String normalizeEmail(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Email obrigatorio");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeOptionalEmail(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
    }

    private String normalizeOptionalLongText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > 4000 ? trimmed.substring(0, 4000) : trimmed;
    }

    private boolean isMarketAccessBlocked(Market market) {
        AccessDescriptor access = describeMarketAccess(market);
        return access.blocked();
    }

    private boolean isMarketExpiringSoon(Market market) {
        AccessDescriptor access = describeMarketAccess(market);
        return "EXPIRING_SOON".equals(access.status());
    }

    private AccessDescriptor describeUserAccess(User user) {
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            return new AccessDescriptor("BLOCKED", "Usuario bloqueado manualmente", true);
        }
        if (user.getMarket() == null || user.getRole() == UserRole.SUPER_ADMIN) {
            return new AccessDescriptor("ACTIVE", "Acesso liberado", false);
        }
        return describeMarketAccess(user.getMarket());
    }

    private AccessDescriptor describeMarketAccess(Market market) {
        if (!Boolean.TRUE.equals(market.getIsActive())) {
            if (market.getBillingStatus() == MarketBillingStatus.PENDING) {
                return new AccessDescriptor("PENDING", "Cadastro aguardando aprovacao da assinatura", true);
            }
            return new AccessDescriptor("BLOCKED", "Conta bloqueada manualmente", true);
        }
        if (market.getBillingStatus() == MarketBillingStatus.PENDING) {
            return new AccessDescriptor("PENDING", "Cadastro aguardando aprovacao da assinatura", true);
        }
        if (market.getBillingStatus() == MarketBillingStatus.SUSPENDED) {
            return new AccessDescriptor("SUSPENDED", "Conta suspensa manualmente", true);
        }
        if (market.getBillingStatus() == MarketBillingStatus.CANCELLED) {
            return new AccessDescriptor("CANCELLED", "Conta cancelada", true);
        }
        LocalDateTime now = LocalDateTime.now();
        if (market.getAccessExpiresAt() != null && !market.getAccessExpiresAt().isAfter(now)) {
            return new AccessDescriptor("EXPIRED", "Acesso expirado", true);
        }
        if (market.getAccessExpiresAt() != null && market.getAccessExpiresAt().isBefore(now.plusDays(7))) {
            return new AccessDescriptor("EXPIRING_SOON", "Acesso vencendo em ate 7 dias", false);
        }
        if (market.getBillingStatus() == MarketBillingStatus.TRIAL) {
            return new AccessDescriptor("TRIAL", "Conta em periodo de teste", false);
        }
        if (market.getBillingStatus() == MarketBillingStatus.PAST_DUE) {
            return new AccessDescriptor("PAST_DUE", "Pagamento manual em atraso", false);
        }
        return new AccessDescriptor("ACTIVE", "Acesso liberado", false);
    }

    private SuperAdminUserDTO toUserDTO(User user) {
        Market market = user.getMarket();
        AccessDescriptor access = describeUserAccess(user);
        return new SuperAdminUserDTO(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getRole(),
            user.getIsActive(),
            user.getCreatedAt(),
            user.getUpdatedAt(),
            user.getLastLoginAt(),
            market != null ? market.getId() : null,
            market != null ? market.getName() : null,
            market != null ? market.getPlanType() : null,
            market != null ? market.getBillingStatus() : null,
            market != null ? market.getIsActive() : null,
            market != null ? market.getAccessExpiresAt() : null,
            access.status(),
            access.reason()
        );
    }

    private SuperAdminMarketDTO toMarketDTO(Market market) {
        long usersCount = userRepository.countByMarket_Id(market.getId());
        long activeUsersCount = userRepository.countByMarket_IdAndIsActive(market.getId(), true);
        AccessDescriptor access = describeMarketAccess(market);
        return new SuperAdminMarketDTO(
            market.getId(),
            market.getName(),
            market.getCnpj(),
            market.getPlanType(),
            market.getBillingStatus(),
            market.getIsActive(),
            market.getCreatedAt(),
            market.getUpdatedAt(),
            market.getAccessExpiresAt(),
            market.getTrialEndsAt(),
            market.getUserSeatLimit(),
            market.getContactName(),
            market.getContactEmail(),
            market.getContactPhone(),
            market.getNotes(),
            usersCount,
            activeUsersCount,
            access.status(),
            access.reason()
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
        dto.setUpdatedAt(run.getUpdatedAt());
        dto.setSources(parseJsonArray(run.getSourcesJson()));
        dto.setSelectedCategories(parseSelectedCategories(run.getFiltersJson()));
        return dto;
    }

    private SuperAdminCrawlerCheckpointDTO toCrawlerCheckpointDTO(CatalogCrawlerCheckpoint checkpoint) {
        SuperAdminCrawlerCheckpointDTO dto = new SuperAdminCrawlerCheckpointDTO();
        dto.setId(checkpoint.getId());
        dto.setProvider(checkpoint.getProvider());
        dto.setScopeType(checkpoint.getScopeType());
        dto.setScopeKey(checkpoint.getScopeKey());
        dto.setScopeHash(checkpoint.getScopeHash());
        dto.setStatus(checkpoint.getStatus());
        dto.setRunId(checkpoint.getRunId());
        dto.setItemCount(checkpoint.getItemCount());
        dto.setMetadata(parseJsonObject(checkpoint.getMetadataJson()));
        dto.setErrorMessage(checkpoint.getErrorMessage());
        dto.setCompletedAt(checkpoint.getCompletedAt());
        dto.setLastSeenAt(checkpoint.getLastSeenAt());
        dto.setUpdatedAt(checkpoint.getUpdatedAt());
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

    private String toJsonObject(Map<String, Object> value) {
        Map<String, Object> safeValue = value == null ? Collections.emptyMap() : value;
        try {
            return objectMapper.writeValueAsString(safeValue);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private Map<String, Object> parseJsonObject(String value) {
        if (value == null || value.isBlank()) {
            return new HashMap<>();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            return new HashMap<>();
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

    private String cleanScopeKey(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() > 512 ? trimmed.substring(0, 512) : trimmed;
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

    private String normalizeCheckpointStatus(String status) {
        if (status == null || status.isBlank()) {
            return "COMPLETED";
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "DISCOVERED", "RUNNING", "COMPLETED", "FAILED" -> normalized;
            default -> "COMPLETED";
        };
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

    private record AccessDescriptor(
        String status,
        String reason,
        boolean blocked
    ) {
    }
}


