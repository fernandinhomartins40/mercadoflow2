package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.ProductCapitalMetric;
import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.intelligence.ExpectedDemandService;
import com.pdv2cloud.service.intelligence.SalesWindowResolver;
import com.pdv2cloud.service.metric.MetricDefinitions;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
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
 * Motor de capital de giro: decide onde o dinheiro do supermercadista rende mais.
 *
 * A pergunta que este serviço responde é "de que forma investir o capital de
 * giro em produtos que realmente vendem, e parar de investir nos que empacam na
 * prateleira". Para isso combina cinco medidas, todas relativas à realidade de
 * CADA loja — nunca faixas fixas iguais para todo mundo:
 *
 *  ABC   Pareto de receita (A = 80% do faturamento, B = até 95%, C = cauda).
 *        Calculado sobre o próprio portfólio, então um mercado de bairro e um
 *        atacado recebem cortes diferentes.
 *
 *  XYZ   Previsibilidade da demanda pelo coeficiente de variação diário.
 *        X vende de forma estável, Z é errático. Define o colchão de segurança:
 *        produto errático precisa de mais estoque para o mesmo nível de serviço.
 *
 *  GMROI Margem bruta dividida pelo capital médio investido. É a métrica-chave:
 *        diz quanto cada real parado no produto devolve em margem. GMROI 3,0
 *        significa R$ 3 de margem para cada R$ 1 empatado.
 *
 *  Cobertura  Quantos dias de venda o estoque atual cobre. Cobertura alta com
 *        demanda desacelerando é a assinatura do capital empacando.
 *
 *  Momentum   Razão entre a venda recente (7 dias) e a média longa (28 dias).
 *        Abaixo de 1 o produto está perdendo tração — sinal precoce, antes de a
 *        prateleira travar.
 *
 * O estoque é teórico (compras registradas − vendas apuradas), então todo
 * resultado que depende dele carrega um score de confiança; ver
 * {@link #computeInventory}.
 */
@Service
@Slf4j
public class WorkingCapitalService {

    /** Janela padrão de apuração de vendas. */
    private static final int DEFAULT_WINDOW_DAYS = 90;

    /** Cortes da curva ABC sobre a receita acumulada. */
    private static final double ABC_A_CUTOFF = 0.80;
    private static final double ABC_B_CUTOFF = 0.95;

    /** Cortes do coeficiente de variação para a classe XYZ. */
    private static final double XYZ_X_CUTOFF = 0.50;
    private static final double XYZ_Y_CUTOFF = 1.00;

    /** Prazo de entrega assumido quando o fornecedor não tem histórico. */
    private static final int DEFAULT_LEAD_TIME_DAYS = 7;

    /** Entregas mínimas para o lead time medido valer mais que o padrão. */
    private static final int MIN_DELIVERIES_FOR_LEAD_TIME = 2;

    /** Ciclo de compra alvo: quantos dias de venda cada pedido deve cobrir. */
    private static final int TARGET_COVERAGE_DAYS = 21;

    /** Acima disso o capital está exposto demais para o giro do produto. */
    private static final double EXCESS_COVERAGE_DAYS = 60;

    /** Margem assumida quando não há custo registrado (só para não zerar o GMROI). */
    private static final BigDecimal FALLBACK_MARGIN_PERCENT = BigDecimal.valueOf(25);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ExpectedDemandService expectedDemandService;
    private final SalesWindowResolver salesWindowResolver;

    public WorkingCapitalService(
        NamedParameterJdbcTemplate jdbcTemplate,
        ExpectedDemandService expectedDemandService,
        SalesWindowResolver salesWindowResolver
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.expectedDemandService = expectedDemandService;
        this.salesWindowResolver = salesWindowResolver;
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Calcula as métricas de capital de todo o portfólio da loja.
     *
     * Roda em memória depois de duas consultas agregadas, em vez de uma consulta
     * por produto: um mercado com 8 mil SKUs geraria 8 mil round-trips.
     */
    @Transactional(readOnly = true)
    public List<CapitalMetric> computePortfolio(UUID marketId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 365) : DEFAULT_WINDOW_DAYS;

        /*
         * A janela termina na última venda conhecida, não em "hoje".
         *
         * Na primeira instalação o agente envia o acervo de XMLs que estava na
         * pasta do PDV — que pode terminar meses atrás. Contando 90 dias a
         * partir de hoje, esse acervo ficaria inteiro fora da janela e o cliente
         * novo veria capital zerado no primeiro acesso, como se o produto não
         * funcionasse. Ancorar na última venda faz a análise descrever o período
         * que os dados de fato cobrem.
         *
         * Quando a coleta está em dia, âncora e hoje coincidem e nada muda.
         */
        SalesWindowResolver.SalesCoverage coverage = salesWindowResolver.resolve(marketId);
        if (!coverage.hasData()) {
            return List.of();
        }
        LocalDate since = salesWindowResolver.windowStart(coverage, days);

        List<SalesAggregate> sales = loadSalesAggregates(marketId, since, days);
        if (sales.isEmpty()) {
            return List.of();
        }

        Map<UUID, CostInfo> costs = loadCosts(marketId);
        Map<UUID, InventoryInfo> inventory = computeInventory(marketId, costs);

        /*
         * Insumos que qualificam a decisão de compra e antes eram ignorados:
         *
         *  - forecast: Holt-Winters já gravado em demand_forecasts pelo
         *    MLPredictionJob, que o cálculo de reposição nunca consultava;
         *  - lead time real por produto, medido em supplier_orders, no lugar da
         *    constante de 7 dias;
         *  - estoque em trânsito: pedidos enviados e ainda não entregues, que
         *    inflavam a sugestão porque ninguém os descontava.
         */
        int horizon = TARGET_COVERAGE_DAYS + DEFAULT_LEAD_TIME_DAYS;
        Map<UUID, ExpectedDemandService.ExpectedDemand> forecasts =
            expectedDemandService.forHorizon(marketId, horizon);
        Map<UUID, Integer> leadTimes = loadLeadTimes(marketId);
        Map<UUID, BigDecimal> inTransit = loadInTransitUnits(marketId);

        // ABC precisa da receita total do portfólio: é uma classificação relativa.
        BigDecimal totalRevenue = sales.stream()
            .map(SalesAggregate::revenue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<SalesAggregate> ranked = new ArrayList<>(sales);
        ranked.sort(Comparator.comparing(SalesAggregate::revenue).reversed());

        List<CapitalMetric> metrics = new ArrayList<>(ranked.size());
        BigDecimal cumulative = BigDecimal.ZERO;

        for (SalesAggregate sale : ranked) {
            cumulative = cumulative.add(sale.revenue());
            double cumulativeShare = totalRevenue.signum() > 0
                ? cumulative.divide(totalRevenue, 6, RoundingMode.HALF_UP).doubleValue()
                : 0.0;
            double share = totalRevenue.signum() > 0
                ? sale.revenue().divide(totalRevenue, 6, RoundingMode.HALF_UP).doubleValue()
                : 0.0;

            metrics.add(buildMetric(
                sale,
                costs.get(sale.productId()),
                inventory.get(sale.productId()),
                share,
                cumulativeShare,
                days,
                forecasts.get(sale.productId()),
                leadTimes.getOrDefault(sale.productId(), DEFAULT_LEAD_TIME_DAYS),
                inTransit.getOrDefault(sale.productId(), BigDecimal.ZERO)
            ));
        }

        metrics.sort(Comparator.comparing(CapitalMetric::priorityScore).reversed());
        return metrics;
    }

    /**
     * Métrica de capital de um único produto.
     *
     * Roda o portfólio inteiro e filtra: ABC e participação de receita são
     * classificações RELATIVAS à loja, então não existe cálculo isolado por SKU
     * que produza o mesmo número. Para não repetir esse trabalho a cada abertura
     * da tela de produto, o resultado por mercado fica em cache curto.
     *
     * @return a métrica do produto, ou {@code null} se ele não vendeu na janela
     */
    @Transactional(readOnly = true)
    public CapitalMetric computeForProduct(UUID marketId, UUID productId, int windowDays) {
        if (productId == null) return null;
        return portfolioCached(marketId, windowDays).stream()
            .filter(m -> productId.equals(m.productId()))
            .findFirst()
            .orElse(null);
    }

    /** Portfólio com cache de curta duração, por mercado e tamanho de janela. */
    private List<CapitalMetric> portfolioCached(UUID marketId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 365) : DEFAULT_WINDOW_DAYS;
        String key = marketId + ":" + days;

        PortfolioCacheEntry cached = portfolioCache.get(key);
        if (cached != null && !cached.isExpired()) {
            return cached.metrics;
        }
        List<CapitalMetric> metrics = computePortfolio(marketId, days);
        portfolioCache.put(key, new PortfolioCacheEntry(metrics));
        return metrics;
    }

    private static final Duration PORTFOLIO_CACHE_TTL = Duration.ofMinutes(10);

    private final java.util.concurrent.ConcurrentHashMap<String, PortfolioCacheEntry> portfolioCache =
        new java.util.concurrent.ConcurrentHashMap<>();

    private static final class PortfolioCacheEntry {
        final List<CapitalMetric> metrics;
        final Instant expiresAt;

        PortfolioCacheEntry(List<CapitalMetric> metrics) {
            this.metrics = metrics;
            this.expiresAt = Instant.now().plus(PORTFOLIO_CACHE_TTL);
        }

        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }

    // ── Carga de dados ───────────────────────────────────────────────────────

    /**
     * Vendas agregadas por produto, já com desvio-padrão diário para o XYZ e
     * médias curta/longa para o momentum.
     */
    private List<SalesAggregate> loadSalesAggregates(UUID marketId, LocalDate since, int windowDays) {
        String sql =
            "with daily as ( " +
            "  select it.product_id, " +
            "         cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total)  as day_revenue, " +
            "         sum(it.quantidade)   as day_qty " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :since " +
            "    and it.product_id is not null " +
            "  group by it.product_id, cast(i.data_emissao as date) " +
            ") " +
            "select d.product_id, " +
            "       p.name, p.category, p.ean, p.image_url, " +
            "       sum(d.day_revenue)                       as revenue, " +
            "       sum(d.day_qty)                           as quantity, " +
            "       count(*)                                 as sales_days, " +
            "       avg(d.day_qty)                           as avg_daily_qty, " +
            "       coalesce(stddev_pop(d.day_qty), 0)       as stddev_daily_qty, " +
            "       max(d.sale_date)                         as last_sale_date, " +
            // Série diária de RECEITA, ordenada por data, para o momentum
            // canônico (EMA7/SMA28) do MetricDefinitions. Vem agregada na
            // mesma query: uma consulta por produto seriam milhares de
            // round-trips num portfólio real.
            "       array_agg(d.day_revenue order by d.sale_date) as daily_revenue " +
            "from daily d " +
            "join products p on p.id = d.product_id " +
            "group by d.product_id, p.name, p.category, p.ean, p.image_url";

        /*
         * O momentum é ancorado no FIM DA JANELA, não em "hoje".
         *
         * Com acervo histórico (primeira instalação, coleta interrompida),
         * "últimos 7 dias a partir de hoje" não alcança venda nenhuma: o
         * recent_avg_qty sairia zero para todo produto e o sistema concluiria
         * que a loja inteira está desacelerando — quando na verdade os dados é
         * que são antigos.
         *
         * `since` já vem ancorado na última venda conhecida (ver
         * computePortfolio), então somar a janela devolve o fim real do período
         * analisado.
         */
        LocalDate windowEnd = since.plusDays(windowDays);

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", since.atStartOfDay());

        List<SalesAggregate> out = new ArrayList<>();
        jdbcTemplate.query(sql, params, rs -> {
            out.add(new SalesAggregate(
                UUID.fromString(rs.getString("product_id")),
                rs.getString("name"),
                rs.getString("category"),
                rs.getString("ean"),
                rs.getString("image_url"),
                nonNull(rs.getBigDecimal("revenue")),
                nonNull(rs.getBigDecimal("quantity")),
                rs.getInt("sales_days"),
                rs.getDouble("avg_daily_qty"),
                rs.getDouble("stddev_daily_qty"),
                rs.getDate("last_sale_date") != null ? rs.getDate("last_sale_date").toLocalDate() : null,
                readDailySeries(rs.getArray("daily_revenue")),
                windowDays
            ));
        });
        return out;
    }

    /**
     * Custo unitário mais recente por produto.
     *
     * Preferência: histórico de compras (é o custo efetivamente pago) e, na
     * falta dele, o item de pedido a fornecedor. Sem nenhum dos dois o produto
     * fica sem custo — e o GMROI é estimado com margem conservadora, sinalizado
     * por {@code costSource = MARGIN_ESTIMATE}.
     */
    private Map<UUID, CostInfo> loadCosts(UUID marketId) {
        String sql =
            "with purchase_costs as ( " +
            "  select distinct on (product_id) " +
            "         product_id, unit_cost, unit_sale_price, margin_percent, purchased_at " +
            "  from purchase_price_history " +
            "  where market_id = :marketId and unit_cost > 0 " +
            "  order by product_id, purchased_at desc " +
            "), " +
            "order_costs as ( " +
            "  select distinct on (soi.product_id) " +
            "         soi.product_id, soi.unit_cost, soi.unit_sale_price, soi.margin_percent, so.order_date " +
            "  from supplier_order_items soi " +
            "  join supplier_orders so on so.id = soi.supplier_order_id " +
            "  where so.market_id = :marketId and soi.unit_cost > 0 " +
            "  order by soi.product_id, so.order_date desc " +
            ") " +
            "select coalesce(pc.product_id, oc.product_id)          as product_id, " +
            "       coalesce(pc.unit_cost, oc.unit_cost)            as unit_cost, " +
            "       coalesce(pc.unit_sale_price, oc.unit_sale_price) as unit_sale_price, " +
            "       coalesce(pc.margin_percent, oc.margin_percent)  as margin_percent, " +
            "       case when pc.product_id is not null then 'PURCHASE_HISTORY' else 'SUPPLIER_ORDER' end as cost_source " +
            "from purchase_costs pc " +
            "full outer join order_costs oc on oc.product_id = pc.product_id";

        Map<UUID, CostInfo> out = new HashMap<>();
        jdbcTemplate.query(sql, new MapSqlParameterSource("marketId", marketId), rs -> {
            UUID productId = UUID.fromString(rs.getString("product_id"));
            out.put(productId, new CostInfo(
                rs.getBigDecimal("unit_cost"),
                rs.getBigDecimal("unit_sale_price"),
                rs.getBigDecimal("margin_percent"),
                rs.getString("cost_source")
            ));
        });
        return out;
    }

    /**
     * Estoque teórico: entradas registradas menos saídas apuradas nas notas.
     *
     * Não existe inventário físico no sistema, então este número é uma
     * estimativa — e o {@code confidence} diz o quanto ela merece crédito:
     *
     *  - saldo negativo indica entrada não registrada: confiança mínima, saldo
     *    tratado como zero (é mais seguro sugerir compra do que assumir estoque
     *    que provavelmente não existe);
     *  - sem nenhuma compra registrada não há como estimar: confiança zero;
     *  - compras recentes e cobrindo boa parte das vendas elevam a confiança.
     */
    private Map<UUID, InventoryInfo> computeInventory(UUID marketId, Map<UUID, CostInfo> costs) {
        String sql =
            "with purchases as ( " +
            "  select product_id, " +
            "         sum(quantity_purchased) as purchased_units, " +
            "         max(purchased_at)       as last_purchase_at, " +
            "         min(purchased_at)       as first_purchase_at " +
            "  from purchase_price_history " +
            "  where market_id = :marketId " +
            "  group by product_id " +
            "), " +
            "sales as ( " +
            "  select it.product_id, " +
            "         sum(it.quantidade)   as sold_units, " +
            "         max(i.data_emissao)  as last_sale_at " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId and it.product_id is not null " +
            "  group by it.product_id " +
            "), " +
            // Vendas ocorridas depois da primeira compra: só essas são
            // explicáveis pelas entradas que conhecemos.
            "sales_after_first_purchase as ( " +
            "  select it.product_id, sum(it.quantidade) as sold_after " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  join purchases pu on pu.product_id = it.product_id " +
            "  where i.market_id = :marketId and i.data_emissao >= pu.first_purchase_at " +
            "  group by it.product_id " +
            ") " +
            "select coalesce(pu.product_id, sa.product_id) as product_id, " +
            "       coalesce(pu.purchased_units, 0)        as purchased_units, " +
            "       coalesce(sa.sold_units, 0)             as sold_units, " +
            "       coalesce(saf.sold_after, 0)            as sold_after_first_purchase, " +
            "       pu.last_purchase_at, " +
            "       sa.last_sale_at " +
            "from purchases pu " +
            "full outer join sales sa on sa.product_id = pu.product_id " +
            "left join sales_after_first_purchase saf on saf.product_id = pu.product_id";

        Map<UUID, InventoryInfo> out = new HashMap<>();
        jdbcTemplate.query(sql, new MapSqlParameterSource("marketId", marketId), rs -> {
            UUID productId = UUID.fromString(rs.getString("product_id"));
            BigDecimal purchased = nonNull(rs.getBigDecimal("purchased_units"));
            BigDecimal sold = nonNull(rs.getBigDecimal("sold_units"));
            BigDecimal soldAfter = nonNull(rs.getBigDecimal("sold_after_first_purchase"));

            BigDecimal balance = purchased.subtract(soldAfter);
            double confidence;
            String reason;
            BigDecimal units;

            if (purchased.signum() <= 0) {
                units = BigDecimal.ZERO;
                confidence = 0.0;
                reason = "SEM_COMPRA_REGISTRADA";
            } else if (balance.signum() < 0) {
                // Vendeu mais do que comprou: houve entrada fora do sistema.
                units = BigDecimal.ZERO;
                confidence = 0.15;
                reason = "ENTRADA_NAO_REGISTRADA";
            } else {
                units = balance;
                // Quanto mais das vendas o histórico de compras explica, maior
                // a chance de o saldo refletir a realidade.
                double coverageRatio = sold.signum() > 0
                    ? Math.min(1.0, soldAfter.doubleValue() / sold.doubleValue())
                    : 1.0;
                confidence = 0.35 + 0.55 * coverageRatio;
                reason = coverageRatio >= 0.8 ? "HISTORICO_CONSISTENTE" : "HISTORICO_PARCIAL";
            }

            CostInfo cost = costs.get(productId);
            BigDecimal value = cost != null && cost.unitCost() != null
                ? units.multiply(cost.unitCost()).setScale(2, RoundingMode.HALF_UP)
                : null;

            out.put(productId, new InventoryInfo(
                units.setScale(3, RoundingMode.HALF_UP),
                value,
                purchased,
                sold,
                BigDecimal.valueOf(confidence).setScale(4, RoundingMode.HALF_UP),
                reason
            ));
        });
        return out;
    }

    /**
     * Lead time real por produto: mediana de (entrega − envio) dos pedidos já
     * entregues do fornecedor que costuma atendê-lo.
     *
     * Substitui a constante de {@value #DEFAULT_LEAD_TIME_DAYS} dias, que tratava
     * o distribuidor da esquina e o fornecedor que entrega em três semanas como
     * se fossem iguais — e por isso errava o ponto de reposição dos dois.
     *
     * Usa mediana em vez de média porque uma entrega atrasada por greve ou
     * feriado não deve virar a regra. Exige pelo menos
     * {@value #MIN_DELIVERIES_FOR_LEAD_TIME} entregas: com uma só, o número é
     * anedota, não histórico.
     */
    private Map<UUID, Integer> loadLeadTimes(UUID marketId) {
        String sql =
            "with delivered as ( " +
            "  select soi.product_id, " +
            "         extract(epoch from (so.delivered_at - coalesce(so.sent_at, so.order_date))) " +
            "             / 86400.0 as lead_days " +
            "  from supplier_orders so " +
            "  join supplier_order_items soi on soi.supplier_order_id = so.id " +
            "  where so.market_id = :marketId " +
            "    and so.delivered_at is not null " +
            "    and so.delivered_at > coalesce(so.sent_at, so.order_date) " +
            ") " +
            "select product_id, " +
            "       percentile_cont(0.5) within group (order by lead_days) as median_lead_days, " +
            "       count(*) as deliveries " +
            "from delivered " +
            "group by product_id " +
            "having count(*) >= :minDeliveries";

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("minDeliveries", MIN_DELIVERIES_FOR_LEAD_TIME);

        Map<UUID, Integer> out = new HashMap<>();
        jdbcTemplate.query(sql, params, rs -> {
            double median = rs.getDouble("median_lead_days");
            // Limita a faixa plausível: zero dia não é lead time, e acima de 90
            // dias o dado quase certamente é sujeira de cadastro.
            int days = (int) Math.round(Math.max(1, Math.min(90, median)));
            out.put(UUID.fromString(rs.getString("product_id")), days);
        });
        return out;
    }

    /**
     * Unidades já pedidas ao fornecedor e ainda não recebidas.
     *
     * Conta apenas pedidos enviados e não cancelados: rascunho não é compromisso
     * de compra e não deve reduzir a sugestão.
     */
    private Map<UUID, BigDecimal> loadInTransitUnits(UUID marketId) {
        String sql =
            "select soi.product_id, " +
            "       sum(soi.quantity_requested - coalesce(soi.quantity_received, 0)) as pending_units " +
            "from supplier_orders so " +
            "join supplier_order_items soi on soi.supplier_order_id = so.id " +
            "where so.market_id = :marketId " +
            "  and so.sent_at is not null " +
            "  and so.delivered_at is null " +
            "  and so.cancelled_at is null " +
            "group by soi.product_id " +
            "having sum(soi.quantity_requested - coalesce(soi.quantity_received, 0)) > 0";

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);
        Map<UUID, BigDecimal> out = new HashMap<>();
        jdbcTemplate.query(sql, params, rs -> {
            out.put(UUID.fromString(rs.getString("product_id")), nonNull(rs.getBigDecimal("pending_units")));
        });
        return out;
    }

    // ── Cálculo por produto ──────────────────────────────────────────────────

    private CapitalMetric buildMetric(
        SalesAggregate sale,
        CostInfo cost,
        InventoryInfo inventory,
        double revenueShare,
        double cumulativeShare,
        int windowDays,
        ExpectedDemandService.ExpectedDemand forecast,
        int leadTimeDays,
        BigDecimal inTransitUnits
    ) {
        // Velocidade canônica: quantidade / dias da janela (MetricDefinitions).
        double dailyVelocity = MetricDefinitions.dailyVelocity(sale.quantity().doubleValue(), windowDays);

        String abcClass = cumulativeShare <= ABC_A_CUTOFF ? "A"
            : cumulativeShare <= ABC_B_CUTOFF ? "B" : "C";

        // Coeficiente de variação: dispersão relativa à média.
        double cv = MetricDefinitions.coefficientOfVariation(sale.stddevDailyQty(), sale.avgDailyQty());
        String xyzClass = cv <= XYZ_X_CUTOFF ? "X" : cv <= XYZ_Y_CUTOFF ? "Y" : "Z";

        /*
         * Momentum canônico: EMA(7)/SMA(28) sobre a série diária de RECEITA.
         *
         * DIVERGÊNCIA RESOLVIDA. Este método usava avg(7d)/avg(28d) de
         * QUANTIDADE enquanto a tela de produto usava a fórmula do
         * MetricDefinitions — o mesmo produto exibia dois momentums diferentes,
         * e este aparece no texto de buildReason que o lojista lê.
         *
         * O que destravou a unificação foi trazer a série diária junto do
         * agregado, com array_agg na mesma query. A objeção anterior era o
         * custo de uma consulta por produto (milhares de round-trips num
         * portfólio real); agregar no banco resolve sem esse custo.
         */
        double momentum = MetricDefinitions.momentum(sale.dailyRevenue());

        // ── Margem e GMROI ──
        BigDecimal unitCost = cost != null ? cost.unitCost() : null;
        BigDecimal unitPrice = sale.quantity().signum() > 0
            ? sale.revenue().divide(sale.quantity(), 4, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        String costSource = cost != null ? cost.costSource() : "MARGIN_ESTIMATE";
        BigDecimal marginPercent;
        BigDecimal marginValue;

        if (unitCost != null && unitCost.signum() > 0 && unitPrice.signum() > 0) {
            BigDecimal unitMargin = unitPrice.subtract(unitCost);
            marginValue = unitMargin.multiply(sale.quantity()).setScale(2, RoundingMode.HALF_UP);
            marginPercent = unitMargin.divide(unitPrice, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(4, RoundingMode.HALF_UP);
        } else {
            // Sem custo real, assume margem conservadora só para não zerar o
            // indicador — a UI mostra que este número é estimado.
            marginPercent = FALLBACK_MARGIN_PERCENT.setScale(4, RoundingMode.HALF_UP);
            marginValue = sale.revenue()
                .multiply(FALLBACK_MARGIN_PERCENT)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            costSource = "MARGIN_ESTIMATE";
        }

        BigDecimal inventoryUnits = inventory != null ? inventory.units() : null;
        BigDecimal inventoryValue = inventory != null ? inventory.value() : null;
        BigDecimal inventoryConfidence = inventory != null ? inventory.confidence() : BigDecimal.ZERO;

        // GMROI = margem bruta / capital investido. Sem valor de estoque
        // confiável fica nulo: um número inventado aqui induziria decisão errada.
        BigDecimal gmroi = null;
        if (inventoryValue != null && inventoryValue.signum() > 0) {
            gmroi = marginValue.divide(inventoryValue, 4, RoundingMode.HALF_UP);
        }

        BigDecimal coverageDays = null;
        if (inventoryUnits != null && dailyVelocity > 0) {
            coverageDays = inventoryUnits.divide(
                BigDecimal.valueOf(dailyVelocity), 2, RoundingMode.HALF_UP);
        }

        // ── Ponto de reposição e sugestão de compra ──
        // Colchão de segurança proporcional à irregularidade da demanda: um
        // produto Z (errático) exige mais estoque para o mesmo nível de serviço.
        double safetyFactor = switch (xyzClass) {
            case "X" -> 0.5;
            case "Y" -> 1.0;
            default  -> 1.6;
        };
        double safetyStock = sale.stddevDailyQty() * safetyFactor * Math.sqrt(leadTimeDays);

        /*
         * Demanda diária esperada: a previsão do Holt-Winters quando ela cobre o
         * horizonte, a média histórica caso contrário.
         *
         * A previsão é melhor para reposição porque enxerga tendência e
         * sazonalidade semanal: um produto em queda tem média alta e futuro
         * baixo, e comprar pela média empilha estoque justamente no item que
         * está morrendo.
         */
        int horizon = TARGET_COVERAGE_DAYS + leadTimeDays;
        boolean usingForecast = forecast != null && forecast.covers(horizon);
        double expectedDailyDemand = usingForecast
            ? forecast.dailyAverage().doubleValue()
            : dailyVelocity;

        double reorderPoint = expectedDailyDemand * leadTimeDays + safetyStock;
        double targetStock = expectedDailyDemand * TARGET_COVERAGE_DAYS + safetyStock;

        // Estoque em trânsito é estoque: pedido já enviado ao fornecedor não
        // precisa ser comprado de novo. Sem descontar, a sugestão manda comprar
        // duas vezes o mesmo item enquanto a entrega não chega.
        double currentUnits = inventoryUnits != null ? inventoryUnits.doubleValue() : 0.0;
        double transit = inTransitUnits != null ? inTransitUnits.doubleValue() : 0.0;
        double suggested = Math.max(0, targetStock - currentUnits - transit);

        BigDecimal suggestedUnits = BigDecimal.valueOf(suggested).setScale(3, RoundingMode.HALF_UP);
        BigDecimal suggestedValue = unitCost != null && unitCost.signum() > 0
            ? suggestedUnits.multiply(unitCost).setScale(2, RoundingMode.HALF_UP)
            : null;

        // ── Risco de estagnação e veredito ──
        double stagnationRisk = computeStagnationRisk(
            momentum, coverageDays, sale.lastSaleDate(), dailyVelocity, abcClass);

        CapitalStatus status = decideStatus(
            abcClass, gmroi, coverageDays, momentum, stagnationRisk, dailyVelocity);

        double priority = computePriority(status, abcClass, gmroi, revenueShare, stagnationRisk, momentum);

        String reason = buildReason(
            status, abcClass, xyzClass, gmroi, coverageDays, momentum,
            dailyVelocity, marginPercent, costSource, inventoryConfidence);

        /*
         * O usuário precisa saber de onde veio a quantidade sugerida: uma
         * previsão de demanda e uma média de 90 dias merecem confianças
         * diferentes na hora de assinar o pedido.
         */
        if (usingForecast) {
            reason += String.format(
                " Demanda projetada em %.1f un./dia pela previsão (e não pela média histórica).",
                expectedDailyDemand);
        }
        if (leadTimeDays != DEFAULT_LEAD_TIME_DAYS) {
            reason += String.format(" Prazo de entrega medido: %d dias.", leadTimeDays);
        }
        if (transit > 0) {
            reason += String.format(" Já há %.0f un. em pedido aberto, descontadas da sugestão.", transit);
        }

        return new CapitalMetric(
            sale.productId(), sale.name(), sale.category(), sale.ean(), sale.imageUrl(),
            sale.revenue(), sale.quantity(),
            marginValue, marginPercent, unitCost, unitPrice, costSource,
            BigDecimal.valueOf(dailyVelocity).setScale(4, RoundingMode.HALF_UP),
            BigDecimal.valueOf(cv).setScale(4, RoundingMode.HALF_UP),
            abcClass, xyzClass,
            BigDecimal.valueOf(revenueShare).setScale(6, RoundingMode.HALF_UP),
            BigDecimal.valueOf(cumulativeShare).setScale(6, RoundingMode.HALF_UP),
            inventoryUnits, inventoryValue, inventoryConfidence,
            inventory != null ? inventory.reason() : "SEM_COMPRA_REGISTRADA",
            coverageDays, gmroi,
            BigDecimal.valueOf(reorderPoint).setScale(3, RoundingMode.HALF_UP),
            suggestedUnits, suggestedValue,
            BigDecimal.valueOf(momentum).setScale(4, RoundingMode.HALF_UP),
            BigDecimal.valueOf(stagnationRisk).setScale(4, RoundingMode.HALF_UP),
            status, reason,
            BigDecimal.valueOf(priority).setScale(4, RoundingMode.HALF_UP),
            sale.lastSaleDate()
        );
    }

    /**
     * Risco de o produto empacar na prateleira, de 0 a 1.
     *
     * Combina os sinais que antecedem o travamento: demanda desacelerando,
     * estoque cobrindo tempo demais, tempo sem vender e giro baixo.
     */
    private double computeStagnationRisk(
        double momentum, BigDecimal coverageDays, LocalDate lastSale,
        double dailyVelocity, String abcClass
    ) {
        double risk = 0.0;

        // Desaceleração é o sinal mais precoce.
        if (momentum < 1.0) {
            risk += Math.min(0.35, (1.0 - momentum) * 0.7);
        }

        // Cobertura muito acima do ciclo de compra = capital exposto.
        if (coverageDays != null) {
            double days = coverageDays.doubleValue();
            if (days > EXCESS_COVERAGE_DAYS) {
                risk += Math.min(0.30, (days - EXCESS_COVERAGE_DAYS) / 120.0 * 0.30);
            }
        }

        // Silêncio recente: dias sem vender nada.
        if (lastSale != null) {
            long daysSinceSale = java.time.temporal.ChronoUnit.DAYS.between(lastSale, LocalDate.now());
            if (daysSinceSale > 14) {
                risk += Math.min(0.25, (daysSinceSale - 14) / 60.0 * 0.25);
            }
        }

        // Giro baixíssimo na cauda do portfólio.
        if ("C".equals(abcClass) && dailyVelocity < 0.1) {
            risk += 0.10;
        }

        return Math.min(1.0, risk);
    }

    /**
     * Veredito de alocação. A ordem das checagens importa: liquidação e redução
     * vêm primeiro, porque liberar capital preso é mais urgente do que otimizar
     * o que já vai bem.
     */
    private CapitalStatus decideStatus(
        String abcClass, BigDecimal gmroi, BigDecimal coverageDays,
        double momentum, double stagnationRisk, double dailyVelocity
    ) {
        if (stagnationRisk >= 0.60) {
            return CapitalStatus.LIQUIDAR;
        }
        if (coverageDays != null && coverageDays.doubleValue() > EXCESS_COVERAGE_DAYS && momentum < 1.0) {
            return CapitalStatus.REDUZIR;
        }
        if (stagnationRisk >= 0.35) {
            return CapitalStatus.REDUZIR;
        }
        // Produto de peso, girando e devolvendo capital: vale reforçar.
        boolean strongReturn = gmroi == null || gmroi.doubleValue() >= 2.0;
        if (("A".equals(abcClass) || "B".equals(abcClass)) && momentum >= 1.0 && strongReturn && dailyVelocity > 0) {
            return CapitalStatus.INVEST;
        }
        return CapitalStatus.MANTER;
    }

    /**
     * Prioridade de exibição: o que o supermercadista deve olhar primeiro.
     * Não é qualidade do produto — é urgência de decisão.
     */
    private double computePriority(
        CapitalStatus status, String abcClass, BigDecimal gmroi,
        double revenueShare, double stagnationRisk, double momentum
    ) {
        double base = switch (status) {
            case LIQUIDAR -> 70;
            case INVEST   -> 60;
            case REDUZIR  -> 45;
            case MANTER   -> 20;
        };
        double abcWeight = switch (abcClass) {
            case "A" -> 20;
            case "B" -> 10;
            default  -> 0;
        };
        double gmroiWeight = gmroi != null ? Math.min(10, gmroi.doubleValue() * 2) : 0;
        double shareWeight = revenueShare * 100;
        double riskWeight = status == CapitalStatus.LIQUIDAR || status == CapitalStatus.REDUZIR
            ? stagnationRisk * 15
            : 0;
        double momentumWeight = status == CapitalStatus.INVEST ? Math.min(10, (momentum - 1.0) * 20) : 0;

        return Math.max(0, base + abcWeight + gmroiWeight + shareWeight + riskWeight + momentumWeight);
    }

    /** Explicação em português, com os números que sustentam o veredito. */
    private String buildReason(
        CapitalStatus status, String abcClass, String xyzClass,
        BigDecimal gmroi, BigDecimal coverageDays, double momentum,
        double dailyVelocity, BigDecimal marginPercent, String costSource,
        BigDecimal inventoryConfidence
    ) {
        StringBuilder sb = new StringBuilder();

        String gmroiText = gmroi != null
            ? String.format("GMROI %.2f (cada R$ 1 investido devolve R$ %.2f de margem)", gmroi, gmroi)
            : "GMROI indisponível (sem estoque estimado confiável)";
        String coverageText = coverageDays != null
            ? String.format("%.0f dias de cobertura", coverageDays)
            : "cobertura desconhecida";

        switch (status) {
            case INVEST -> sb.append(String.format(
                "Classe %s%s girando %.2f un./dia com %s. %s — vale reforçar a compra.",
                abcClass, xyzClass, dailyVelocity, coverageText, gmroiText));
            case MANTER -> sb.append(String.format(
                "Classe %s%s com giro de %.2f un./dia dentro do esperado e %s. "
                    + "Mantenha o ciclo de reposição atual.",
                abcClass, xyzClass, dailyVelocity, coverageText));
            case REDUZIR -> sb.append(String.format(
                "Capital exposto além do giro: %s para uma venda de %.2f un./dia, "
                    + "com demanda %s (momentum %.2f). Compre menos no próximo ciclo.",
                coverageText, dailyVelocity,
                momentum < 1 ? "desacelerando" : "estável", momentum));
            case LIQUIDAR -> sb.append(String.format(
                "Sinais de estagnação: %s, giro de %.2f un./dia e momentum %.2f. "
                    + "Considere promoção para liberar o capital parado.",
                coverageText, dailyVelocity, momentum));
        }

        if ("MARGIN_ESTIMATE".equals(costSource)) {
            sb.append(String.format(
                " Margem estimada em %.0f%% — registre o custo de compra para um cálculo exato.",
                marginPercent));
        }
        if (inventoryConfidence != null && inventoryConfidence.doubleValue() < 0.4) {
            sb.append(" Estoque estimado com baixa confiança: registre as compras para melhorar a precisão.");
        }

        return sb.toString();
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    private static BigDecimal nonNull(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    /**
     * Converte o array do Postgres na série que o MetricDefinitions espera.
     *
     * Devolve lista vazia (não null) quando não há série: o momentum canônico
     * já trata a lista vazia como neutro, e um null aqui viraria NPE dentro do
     * cálculo de todo produto sem venda.
     */
    private static List<Double> readDailySeries(java.sql.Array array) throws java.sql.SQLException {
        if (array == null) {
            return List.of();
        }
        Object raw = array.getArray();
        if (!(raw instanceof Object[] values)) {
            return List.of();
        }
        List<Double> series = new ArrayList<>(values.length);
        for (Object value : values) {
            if (value instanceof Number n) {
                series.add(n.doubleValue());
            }
        }
        return series;
    }

    /**
     * @param dailyRevenue série diária de receita, ordenada por data crescente,
     *                     com um ponto por dia COM VENDA — o formato que
     *                     {@link MetricDefinitions#momentum} espera
     */
    private record SalesAggregate(
        UUID productId, String name, String category, String ean, String imageUrl,
        BigDecimal revenue, BigDecimal quantity, int salesDays,
        double avgDailyQty, double stddevDailyQty, LocalDate lastSaleDate,
        List<Double> dailyRevenue, int windowDays
    ) {}

    private record CostInfo(
        BigDecimal unitCost, BigDecimal unitSalePrice,
        BigDecimal marginPercent, String costSource
    ) {}

    private record InventoryInfo(
        BigDecimal units, BigDecimal value,
        BigDecimal purchasedUnits, BigDecimal soldUnits,
        BigDecimal confidence, String reason
    ) {}

    /** Resultado por produto, consumido pelo plano de compra e pela API. */
    public record CapitalMetric(
        UUID productId, String name, String category, String ean, String imageUrl,
        BigDecimal revenue, BigDecimal quantitySold,
        BigDecimal grossMarginValue, BigDecimal grossMarginPercent,
        BigDecimal unitCost, BigDecimal unitPrice, String costSource,
        BigDecimal dailyVelocity, BigDecimal demandCv,
        String abcClass, String xyzClass,
        BigDecimal revenueShare, BigDecimal revenueCumulativeShare,
        BigDecimal inventoryUnits, BigDecimal inventoryValue,
        BigDecimal inventoryConfidence, String inventoryReason,
        BigDecimal coverageDays, BigDecimal gmroi,
        BigDecimal reorderPointUnits, BigDecimal suggestedOrderUnits, BigDecimal suggestedOrderValue,
        BigDecimal momentumScore, BigDecimal stagnationRisk,
        CapitalStatus capitalStatus, String capitalReason,
        BigDecimal priorityScore, LocalDate lastSaleDate
    ) {}
}
