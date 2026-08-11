package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.ProductCapitalMetric;
import com.pdv2cloud.model.entity.ProductHaloEffect;
import com.pdv2cloud.model.entity.ProductInventoryEstimate;
import com.pdv2cloud.model.entity.ProductSeasonality;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductCapitalMetricRepository;
import com.pdv2cloud.repository.ProductHaloEffectRepository;
import com.pdv2cloud.repository.ProductInventoryEstimateRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.ProductSeasonalityRepository;
import com.pdv2cloud.service.PromoIntelligenceService;
import com.pdv2cloud.service.WorkingCapitalService;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Materializa a inteligência de produto nas tabelas criadas pela V31.
 *
 * PROBLEMA QUE RESOLVE (auditoria §16, gravidade ALTA): a migration V31 criou
 * quatro tabelas — com índices, RLS e o comentário "recalculadas por job e
 * consumidas pelas telas" — mas nenhum job jamais escreveu nelas e nenhum
 * serviço jamais as leu. Todo o cálculo de capital, halo e sazonalidade era
 * refeito a cada request, com três consequências: latência alta, carga no banco
 * e scores voláteis entre dois cliques (impossível ter histórico ou comparar
 * filiais sem estourar custo).
 *
 * Este serviço faz o que a migration prometia. As fórmulas NÃO mudam: ele
 * persiste exatamente o que {@link WorkingCapitalService} já calculava, para
 * que o número materializado seja idêntico ao número on-line.
 *
 * Escopo de tenant: os métodos aqui são transacionais e devem ser chamados de
 * dentro de um {@code TenantContext.runAsSystem(...)} — ver ProductIntelligenceJob.
 */
@Service
@Slf4j
public class ProductIntelligenceMaterializer {

    /** Janela padrão do cálculo de capital, alinhada ao resto da inteligência. */
    private static final int CAPITAL_WINDOW_DAYS = 90;

    /** Sazonalidade precisa de um ano para enxergar o ciclo completo. */
    private static final int SEASONALITY_WINDOW_DAYS = 365;

    /**
     * Mínimo de observações num período para o índice sazonal valer alguma
     * coisa: com 1 ou 2 vendas, "terça-feira vende 3x mais" é ruído.
     */
    private static final int MIN_SEASONALITY_OBSERVATIONS = 3;

    /** Janela do halo: promoções são esparsas, precisa de mais histórico. */
    private static final int HALO_WINDOW_DAYS = 180;

    private final WorkingCapitalService workingCapitalService;
    private final PromoIntelligenceService promoIntelligenceService;
    private final CustomerIntelligenceService customerIntelligenceService;
    private final ProductHaloEffectRepository haloEffectRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;
    private final ProductCapitalMetricRepository capitalMetricRepository;
    private final ProductInventoryEstimateRepository inventoryEstimateRepository;
    private final ProductSeasonalityRepository seasonalityRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public ProductIntelligenceMaterializer(
        WorkingCapitalService workingCapitalService,
        PromoIntelligenceService promoIntelligenceService,
        CustomerIntelligenceService customerIntelligenceService,
        ProductHaloEffectRepository haloEffectRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository,
        ProductCapitalMetricRepository capitalMetricRepository,
        ProductInventoryEstimateRepository inventoryEstimateRepository,
        ProductSeasonalityRepository seasonalityRepository,
        NamedParameterJdbcTemplate jdbcTemplate
    ) {
        this.workingCapitalService = workingCapitalService;
        this.promoIntelligenceService = promoIntelligenceService;
        this.customerIntelligenceService = customerIntelligenceService;
        this.haloEffectRepository = haloEffectRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
        this.capitalMetricRepository = capitalMetricRepository;
        this.inventoryEstimateRepository = inventoryEstimateRepository;
        this.seasonalityRepository = seasonalityRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Resultado da materialização de um mercado, para log e para o endpoint de rebuild. */
    public record MaterializationResult(
        UUID marketId,
        int capitalMetrics,
        int inventoryEstimates,
        int seasonalityRows,
        int haloEffects,
        int customerProfiles,
        int repurchaseRows,
        long durationMillis
    ) {}

    /**
     * Materializa capital, estoque estimado e sazonalidade de um mercado.
     *
     * Estratégia de escrita: apaga e regrava por mercado. É simples e correto —
     * um produto que parou de vender some da tabela em vez de ficar com número
     * velho — e cabe no volume de um job noturno. Um upsert incremental só se
     * justificaria se a materialização passasse a rodar de hora em hora.
     */
    @Transactional
    public MaterializationResult materializeMarket(UUID marketId) {
        long startedAt = System.currentTimeMillis();

        List<CapitalMetric> portfolio =
            workingCapitalService.computePortfolio(marketId, CAPITAL_WINDOW_DAYS);

        int capital = 0;
        int inventory = 0;
        if (!portfolio.isEmpty()) {
            capital = writeCapitalMetrics(marketId, portfolio);
            inventory = writeInventoryEstimates(marketId, portfolio);
        } else {
            capitalMetricRepository.deleteByMarketId(marketId);
            inventoryEstimateRepository.deleteByMarketId(marketId);
        }

        int seasonality = writeSeasonality(marketId);
        int halo = writeHaloEffects(marketId);

        // Perfis de cliente e recompra por produto: o CPF da nota, gravado desde
        // a V1 e nunca lido, vira recorrência — sempre pseudonimizado.
        CustomerIntelligenceService.CustomerIntelligenceResult customers =
            customerIntelligenceService.materialize(marketId);

        long elapsed = System.currentTimeMillis() - startedAt;
        return new MaterializationResult(
            marketId, capital, inventory, seasonality, halo,
            customers.profiles(), customers.repurchaseRows(), elapsed);
    }

    // ── Efeito halo ──────────────────────────────────────────────────────────

    /**
     * Persiste o efeito halo e o cruza com o lift da cesta.
     *
     * Duas coisas acontecem aqui, ambas apontadas pela auditoria (§9):
     *
     *  1. O halo deixa de ser recalculado a cada request. Era o cálculo mais
     *     caro do sistema — até 40 drivers × 1 SQL de 5 CTEs por clique, sem
     *     cache, com ranking que podia mudar entre dois cliques do usuário.
     *
     *  2. O campo `basket_lift`, criado na V31 e nunca preenchido, passa a
     *     receber o lift da regra de cesta do mesmo par. Halo e market basket
     *     mediam a mesma relação por caminhos diferentes e nunca se falavam:
     *     agora um par com halo alto E lift alto é distinguível de um par que
     *     só aparece junto por acaso de calendário.
     */
    private int writeHaloEffects(UUID marketId) {
        haloEffectRepository.deleteByMarketId(marketId);
        haloEffectRepository.flush();

        List<PromoIntelligenceService.HaloEffect> effects =
            promoIntelligenceService.computeHaloEffects(marketId, HALO_WINDOW_DAYS);
        if (effects.isEmpty()) {
            return 0;
        }

        Map<String, Double> basketLifts = loadBasketLifts(marketId);
        Market market = marketRepository.getReferenceById(marketId);
        LocalDateTime now = LocalDateTime.now();

        List<UUID> productIds = new ArrayList<>();
        effects.forEach(e -> {
            productIds.add(e.driverProductId());
            productIds.add(e.targetProductId());
        });
        Map<UUID, Product> products = new HashMap<>();
        for (Product p : productRepository.findAllById(productIds)) {
            products.put(p.getId(), p);
        }

        List<ProductHaloEffect> rows = new ArrayList<>(effects.size());
        for (PromoIntelligenceService.HaloEffect e : effects) {
            Product driver = products.get(e.driverProductId());
            Product target = products.get(e.targetProductId());
            if (driver == null || target == null) continue;

            ProductHaloEffect row = new ProductHaloEffect();
            row.setMarket(market);
            row.setDriverProduct(driver);
            row.setTargetProduct(target);
            row.setTargetPromoVelocity(nonNull(e.targetPromoVelocity()));
            row.setTargetNormalVelocity(nonNull(e.targetNormalVelocity()));
            row.setHaloLiftPercent(e.haloLiftPercent());
            row.setIncrementalRevenue(e.incrementalRevenue());
            row.setCoOccurrenceCount(e.coOccurrenceCount());
            row.setPromoDaysObserved(e.promoDaysObserved());
            row.setConfidence(nonNull(e.confidence()));
            row.setWindowDays(e.windowDays());
            row.setComputedAt(now);

            Double lift = basketLifts.get(pairKey(e.driverProductId(), e.targetProductId()));
            if (lift != null) {
                row.setBasketLift(BigDecimal.valueOf(lift).setScale(4, RoundingMode.HALF_UP));
            }
            rows.add(row);
        }

        haloEffectRepository.saveAll(rows);
        return rows.size();
    }

    /**
     * Lift da cesta por par, lido das regras que o MarketBasketAnalysisJob já
     * persistiu. Chave normalizada (menor id primeiro) porque a regra de cesta é
     * simétrica enquanto o halo tem direção.
     */
    private Map<String, Double> loadBasketLifts(UUID marketId) {
        String sql =
            "select antecedent, consequent, lift " +
            "from market_basket_rules " +
            "where market_id = :marketId " +
            "  and computed_at = (select max(computed_at) from market_basket_rules where market_id = :marketId)";

        Map<String, Double> out = new HashMap<>();
        jdbcTemplate.query(sql, new MapSqlParameterSource("marketId", marketId), rs -> {
            String antecedent = rs.getString("antecedent");
            String consequent = rs.getString("consequent");
            double lift = rs.getDouble("lift");
            if (antecedent == null || consequent == null) return;
            try {
                out.put(pairKey(UUID.fromString(antecedent.trim()), UUID.fromString(consequent.trim())), lift);
            } catch (IllegalArgumentException ignored) {
                // Regra com itemset composto (vários ids): não é par, não serve aqui.
            }
        });
        return out;
    }

    /** Chave simétrica de um par de produtos. */
    private String pairKey(UUID a, UUID b) {
        return a.compareTo(b) <= 0 ? a + "|" + b : b + "|" + a;
    }

    // ── Capital ──────────────────────────────────────────────────────────────

    private int writeCapitalMetrics(UUID marketId, List<CapitalMetric> portfolio) {
        capitalMetricRepository.deleteByMarketId(marketId);
        capitalMetricRepository.flush();

        Market market = marketRepository.getReferenceById(marketId);
        Map<UUID, Product> products = loadProducts(portfolio);
        LocalDateTime now = LocalDateTime.now();

        List<ProductCapitalMetric> rows = new ArrayList<>(portfolio.size());
        for (CapitalMetric m : portfolio) {
            Product product = products.get(m.productId());
            if (product == null) continue; // produto removido do catálogo entre o cálculo e a escrita

            ProductCapitalMetric row = new ProductCapitalMetric();
            row.setMarket(market);
            row.setProduct(product);
            row.setWindowDays(CAPITAL_WINDOW_DAYS);
            row.setRevenue(nonNull(m.revenue()));
            row.setQuantitySold(nonNull(m.quantitySold()));
            row.setGrossMarginValue(m.grossMarginValue());
            row.setGrossMarginPercent(m.grossMarginPercent());
            row.setUnitCost(m.unitCost());
            row.setUnitPrice(m.unitPrice());
            row.setCostSource(m.costSource());
            row.setDailyVelocity(nonNull(m.dailyVelocity()));
            row.setDemandCv(m.demandCv());
            row.setAbcClass(m.abcClass());
            row.setXyzClass(m.xyzClass());
            row.setRevenueShare(m.revenueShare());
            row.setRevenueCumulativeShare(m.revenueCumulativeShare());
            row.setInventoryUnits(m.inventoryUnits());
            row.setInventoryValue(m.inventoryValue());
            row.setCoverageDays(m.coverageDays());
            row.setGmroi(m.gmroi());
            row.setReorderPointUnits(m.reorderPointUnits());
            row.setSuggestedOrderUnits(m.suggestedOrderUnits());
            row.setSuggestedOrderValue(m.suggestedOrderValue());
            row.setMomentumScore(m.momentumScore());
            row.setStagnationRisk(m.stagnationRisk());
            row.setCapitalStatus(m.capitalStatus());
            row.setCapitalReason(m.capitalReason());
            row.setPriorityScore(m.priorityScore());
            row.setComputedAt(now);
            rows.add(row);
        }

        capitalMetricRepository.saveAll(rows);
        return rows.size();
    }

    // ── Estoque estimado ─────────────────────────────────────────────────────

    /**
     * O estoque teórico já é calculado dentro do WorkingCapitalService; aqui ele
     * é apenas persistido, junto com a confiança que a UI usa para dizer quando
     * o número merece crédito.
     *
     * Produtos sem estimativa de estoque são ignorados: gravar zero seria
     * afirmar "não há estoque", quando o correto é "não se sabe".
     */
    private int writeInventoryEstimates(UUID marketId, List<CapitalMetric> portfolio) {
        inventoryEstimateRepository.deleteByMarketId(marketId);
        inventoryEstimateRepository.flush();

        Market market = marketRepository.getReferenceById(marketId);
        Map<UUID, Product> products = loadProducts(portfolio);
        LocalDateTime now = LocalDateTime.now();

        List<ProductInventoryEstimate> rows = new ArrayList<>();
        for (CapitalMetric m : portfolio) {
            if (m.inventoryUnits() == null) continue;

            Product product = products.get(m.productId());
            if (product == null) continue;

            ProductInventoryEstimate row = new ProductInventoryEstimate();
            row.setMarket(market);
            row.setProduct(product);
            row.setEstimatedUnits(nonNull(m.inventoryUnits()));
            row.setEstimatedCostValue(nonNull(m.inventoryValue()));
            row.setTotalSoldUnits(nonNull(m.quantitySold()));
            row.setConfidenceScore(nonNull(m.inventoryConfidence()));
            row.setConfidenceReason(m.inventoryReason());
            row.setLastSaleAt(m.lastSaleDate() != null ? m.lastSaleDate().atStartOfDay() : null);
            row.setComputedAt(now);
            rows.add(row);
        }

        inventoryEstimateRepository.saveAll(rows);
        return rows.size();
    }

    // ── Sazonalidade ─────────────────────────────────────────────────────────

    /**
     * Índice sazonal por dia da semana e por mês: 1,0 = venda na média do
     * produto; 1,4 = 40% acima.
     *
     * O índice é a razão entre a média do período e a média geral do produto, e
     * por isso é comparável entre produtos de volumes muito diferentes. Períodos
     * com menos de {@value #MIN_SEASONALITY_OBSERVATIONS} observações são
     * descartados — não é sazonalidade, é acaso.
     */
    private int writeSeasonality(UUID marketId) {
        seasonalityRepository.deleteByMarketId(marketId);
        seasonalityRepository.flush();

        LocalDate since = LocalDate.now().minusDays(SEASONALITY_WINDOW_DAYS);
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", since.atStartOfDay());

        /*
         * daily: quantidade por produto e por dia (a unidade de observação).
         * Agregar por dia antes de tirar médias evita que um dia com muitas
         * notas pese mais do que um dia com poucas.
         */
        String sql =
            "with daily as ( " +
            "  select it.product_id, " +
            "         cast(i.data_emissao as date) as sale_date, " +
            "         extract(dow from i.data_emissao)::int as dow, " +
            "         extract(month from i.data_emissao)::int as month, " +
            "         sum(it.quantidade) as day_qty " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :since " +
            "    and it.product_id is not null " +
            "  group by it.product_id, cast(i.data_emissao as date), " +
            "           extract(dow from i.data_emissao), extract(month from i.data_emissao) " +
            "), " +
            "overall as ( " +
            "  select product_id, avg(day_qty) as avg_qty, count(*) as total_days " +
            "  from daily group by product_id " +
            "), " +
            "by_dow as ( " +
            "  select product_id, 'DOW' as period_type, dow as period_index, " +
            "         avg(day_qty) as period_avg, count(*) as observations " +
            "  from daily group by product_id, dow " +
            "), " +
            "by_month as ( " +
            "  select product_id, 'MONTH' as period_type, month as period_index, " +
            "         avg(day_qty) as period_avg, count(*) as observations " +
            "  from daily group by product_id, month " +
            "), " +
            "combined as ( select * from by_dow union all select * from by_month ) " +
            "select c.product_id, c.period_type, c.period_index, c.observations, " +
            "       o.total_days, " +
            "       case when o.avg_qty > 0 then c.period_avg / o.avg_qty else 1 end as seasonal_index " +
            "from combined c " +
            "join overall o on o.product_id = c.product_id " +
            "where c.observations >= :minObservations";

        params.addValue("minObservations", MIN_SEASONALITY_OBSERVATIONS);

        Market market = marketRepository.getReferenceById(marketId);
        LocalDateTime now = LocalDateTime.now();
        List<ProductSeasonality> rows = new ArrayList<>();
        Map<UUID, Product> productCache = new HashMap<>();

        jdbcTemplate.query(sql, params, rs -> {
            UUID productId = UUID.fromString(rs.getString("product_id"));
            Product product = productCache.computeIfAbsent(
                productId, id -> productRepository.findById(id).orElse(null));
            if (product == null) return;

            int observations = rs.getInt("observations");
            int totalDays = rs.getInt("total_days");

            ProductSeasonality row = new ProductSeasonality();
            row.setMarket(market);
            row.setProduct(product);
            row.setPeriodType(ProductSeasonality.PeriodType.valueOf(rs.getString("period_type")));
            row.setPeriodIndex(rs.getInt("period_index"));
            row.setSeasonalIndex(
                rs.getBigDecimal("seasonal_index").setScale(4, RoundingMode.HALF_UP));
            row.setObservations(observations);
            row.setConfidence(seasonalityConfidence(observations, totalDays));
            row.setWindowDays(SEASONALITY_WINDOW_DAYS);
            row.setComputedAt(now);
            rows.add(row);
        });

        seasonalityRepository.saveAll(rows);
        return rows.size();
    }

    /**
     * Confiança do índice sazonal: cresce com o número de observações e satura
     * em 12 (cerca de três meses de amostras para um dia da semana).
     */
    private BigDecimal seasonalityConfidence(int observations, int totalDays) {
        if (totalDays <= 0) return BigDecimal.ZERO;
        double byVolume = Math.min(1.0, observations / 12.0);
        return BigDecimal.valueOf(byVolume).setScale(4, RoundingMode.HALF_UP);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Map<UUID, Product> loadProducts(List<CapitalMetric> portfolio) {
        List<UUID> ids = portfolio.stream().map(CapitalMetric::productId).toList();
        Map<UUID, Product> byId = new HashMap<>();
        for (Product p : productRepository.findAllById(ids)) {
            byId.put(p.getId(), p);
        }
        return byId;
    }

    private BigDecimal nonNull(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    /** Mercados ativos, para o job iterar. */
    public List<Market> activeMarkets() {
        return marketRepository.findAllActive();
    }
}
