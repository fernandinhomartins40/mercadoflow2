package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inteligência de rede: comparação entre filiais, transferência de estoque e
 * benchmark de preço.
 *
 * ESTE ERA O ACHADO MAIS CRÍTICO DA AUDITORIA (§12). A hierarquia rede→filial
 * existe no banco desde a V34 (`markets.parent_market_id`), mas era usada
 * apenas para billing e limites de plano: um grep por `parentMarket` nos
 * serviços analíticos não retornava nada. Cada filial tinha sua inteligência
 * isolada e o dono da rede não conseguia comparar nada.
 *
 * Lê as tabelas materializadas pela Fase 2 (`product_capital_metrics`), e não
 * `invoice_items`. A diferença não é de estilo: comparar N filiais recalculando
 * o portfólio de cada uma por request seria proibitivo — é justamente por isso
 * que a materialização vinha antes desta feature no plano.
 *
 * <b>Escopo de acesso:</b> todos os métodos partem do mercado-raiz e só
 * enxergam ele e suas filiais diretas. O modelo permite dois níveis apenas (a
 * V34 tem trigger impedindo filial de filial), então não há recursão a tratar.
 */
@Service
@Slf4j
public class NetworkIntelligenceService {

    /**
     * Cobertura abaixo da qual a filial está sob risco de faltar produto.
     * Mesmo corte do detector de oportunidades, para os dois não discordarem.
     */
    private static final double LOW_COVERAGE_DAYS = 7.0;

    /** Acima disso há excesso: sobra que pode abastecer outra filial. */
    private static final double EXCESS_COVERAGE_DAYS = 45.0;

    /**
     * Diferença de preço a partir da qual vale sinalizar divergência.
     *
     * 10% porque abaixo disso a variação é explicável por promoção pontual,
     * arredondamento de etiqueta ou diferença de fornecedor — sinalizar tudo
     * viraria ruído e o lojista pararia de olhar.
     */
    private static final double PRICE_DIVERGENCE_PERCENT = 10.0;

    /** Mínimo de filiais com o produto para a comparação significar algo. */
    private static final int MIN_BRANCHES_FOR_COMPARISON = 2;

    private final NamedParameterJdbcTemplate jdbc;
    private final MarketRepository marketRepository;

    public NetworkIntelligenceService(
        NamedParameterJdbcTemplate jdbc,
        MarketRepository marketRepository
    ) {
        this.jdbc = jdbc;
        this.marketRepository = marketRepository;
    }

    /** Uma loja da rede e o resumo do que ela vende. */
    public record BranchSummary(
        UUID marketId,
        String name,
        boolean isHeadquarters,
        BigDecimal revenue,
        long products,
        BigDecimal inventoryValue,
        BigDecimal frozenValue,
        BigDecimal frozenPercent
    ) { }

    /** O mesmo produto visto em várias filiais. */
    public record ProductAcrossBranches(
        UUID productId,
        String productName,
        List<BranchMetric> branches,
        /** Quanto a melhor filial vende a mais que a pior, em %. */
        BigDecimal spreadPercent
    ) { }

    public record BranchMetric(
        UUID marketId,
        String branchName,
        BigDecimal dailyVelocity,
        BigDecimal coverageDays,
        BigDecimal unitPrice,
        BigDecimal inventoryUnits,
        String capitalStatus
    ) { }

    /**
     * Sugestão de mover estoque entre lojas.
     *
     * @param suggestedUnits quanto transferir. Limitado pelo excesso da origem
     *                       E pela necessidade do destino — o menor dos dois,
     *                       porque mover mais que isso só troca o problema de
     *                       lugar
     */
    public record TransferSuggestion(
        UUID productId,
        String productName,
        UUID fromMarketId,
        String fromBranch,
        UUID toMarketId,
        String toBranch,
        BigDecimal suggestedUnits,
        BigDecimal estimatedValue,
        BigDecimal fromCoverageDays,
        BigDecimal toCoverageDays,
        String reason
    ) { }

    /** Mesmo produto com preços diferentes entre filiais. */
    public record PriceDivergence(
        UUID productId,
        String productName,
        String cheapestBranch,
        BigDecimal cheapestPrice,
        String priciestBranch,
        BigDecimal priciestPrice,
        BigDecimal differencePercent
    ) { }

    /** É uma rede (tem filiais)? Decide se a UI mostra a visão de rede. */
    public boolean isNetwork(UUID marketId) {
        return !marketRepository.findByParentMarketId(marketId).isEmpty();
    }

    /**
     * As lojas da rede, com o resumo de cada uma.
     *
     * Inclui a matriz: ela também vende, e deixá-la de fora daria ao dono uma
     * visão parcial do próprio negócio.
     */
    @Transactional(readOnly = true)
    public List<BranchSummary> branchOverview(UUID rootMarketId) {
        List<UUID> ids = networkIds(rootMarketId);
        if (ids.size() < MIN_BRANCHES_FOR_COMPARISON) {
            return List.of();
        }
        Map<UUID, String> names = namesOf(ids);

        String sql = """
            select market_id,
                   count(*) as produtos,
                   coalesce(sum(revenue), 0) as receita,
                   coalesce(sum(inventory_value), 0) as valor_estoque,
                   coalesce(sum(inventory_value) filter (
                     where capital_status in ('LIQUIDAR', 'REDUZIR')), 0) as valor_parado
            from product_capital_metrics
            where market_id in (:ids)
            group by market_id
            """;

        List<BranchSummary> out = new ArrayList<>();
        jdbc.query(sql, new MapSqlParameterSource("ids", ids), rs -> {
            UUID id = UUID.fromString(rs.getString("market_id"));
            BigDecimal inventory = rs.getBigDecimal("valor_estoque");
            BigDecimal frozen = rs.getBigDecimal("valor_parado");
            out.add(new BranchSummary(
                id,
                names.getOrDefault(id, "—"),
                id.equals(rootMarketId),
                scale(rs.getBigDecimal("receita")),
                rs.getLong("produtos"),
                scale(inventory),
                scale(frozen),
                percentOf(frozen, inventory)
            ));
        });

        out.sort(Comparator.comparing(BranchSummary::revenue).reversed());
        return out;
    }

    /**
     * O mesmo produto lado a lado nas filiais que o vendem.
     *
     * Responde a pergunta que a auditoria registrou como impossível hoje:
     * "sua filial vende este produto 40% abaixo da irmã".
     */
    @Transactional(readOnly = true)
    public List<ProductAcrossBranches> compareProducts(UUID rootMarketId, int limit) {
        List<UUID> ids = networkIds(rootMarketId);
        if (ids.size() < MIN_BRANCHES_FOR_COMPARISON) {
            return List.of();
        }
        Map<UUID, String> names = namesOf(ids);

        // Só produtos presentes em mais de uma filial: comparar um produto que
        // existe numa loja só não diz nada.
        String sql = """
            with presentes as (
              select product_id
              from product_capital_metrics
              where market_id in (:ids)
              group by product_id
              having count(distinct market_id) >= :minFiliais
              order by sum(revenue) desc
              limit :limite
            )
            select m.product_id, p.name as produto, m.market_id,
                   m.daily_velocity, m.coverage_days, m.unit_price,
                   m.inventory_units, m.capital_status
            from product_capital_metrics m
            join presentes pr on pr.product_id = m.product_id
            join products p on p.id = m.product_id
            where m.market_id in (:ids)
            order by p.name, m.daily_velocity desc
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("ids", ids)
            .addValue("minFiliais", MIN_BRANCHES_FOR_COMPARISON)
            .addValue("limite", Math.max(1, Math.min(limit, 100)));

        Map<UUID, List<BranchMetric>> byProduct = new LinkedHashMap<>();
        Map<UUID, String> productNames = new LinkedHashMap<>();

        jdbc.query(sql, params, rs -> {
            UUID productId = UUID.fromString(rs.getString("product_id"));
            UUID marketId = UUID.fromString(rs.getString("market_id"));
            productNames.putIfAbsent(productId, rs.getString("produto"));
            byProduct.computeIfAbsent(productId, k -> new ArrayList<>())
                .add(new BranchMetric(
                    marketId,
                    names.getOrDefault(marketId, "—"),
                    scale4(rs.getBigDecimal("daily_velocity")),
                    scale1(rs.getBigDecimal("coverage_days")),
                    scale(rs.getBigDecimal("unit_price")),
                    scale0(rs.getBigDecimal("inventory_units")),
                    rs.getString("capital_status")
                ));
        });

        List<ProductAcrossBranches> out = new ArrayList<>();
        byProduct.forEach((productId, metrics) -> out.add(new ProductAcrossBranches(
            productId, productNames.get(productId), metrics, spreadOf(metrics))));

        // Maior discrepância primeiro: é onde há mais a aprender ou a corrigir.
        out.sort(Comparator.comparing(
            (ProductAcrossBranches p) -> p.spreadPercent() == null
                ? BigDecimal.ZERO : p.spreadPercent()).reversed());
        return out;
    }

    /**
     * Transferências que fazem sentido: sobra numa filial, falta na outra.
     *
     * <b>Limite assumido:</b> o custo logístico é ignorado nesta versão. Mover
     * caixas entre lojas tem custo real (frete, pessoa, tempo) que o sistema
     * não conhece — por isso a sugestão vem com o valor estimado, para o dono
     * julgar se compensa. Sinalizar isso é mais honesto que embutir um custo
     * inventado no cálculo.
     */
    @Transactional(readOnly = true)
    public List<TransferSuggestion> transferOpportunities(UUID rootMarketId, int limit) {
        List<UUID> ids = networkIds(rootMarketId);
        if (ids.size() < MIN_BRANCHES_FOR_COMPARISON) {
            return List.of();
        }
        Map<UUID, String> names = namesOf(ids);

        /*
         * A origem precisa de excesso E estoque real; o destino precisa de
         * cobertura curta E venda ativa. A checagem de daily_velocity > 0 no
         * destino é o que separa "está faltando" de "não vende mesmo" — mandar
         * produto para uma loja que não o vende só transfere o capital parado.
         */
        String sql = """
            with origem as (
              select m.market_id, m.product_id, m.inventory_units, m.coverage_days,
                     m.unit_price, m.daily_velocity
              from product_capital_metrics m
              where m.market_id in (:ids)
                and m.coverage_days > :excesso
                and m.inventory_units > 0
            ),
            destino as (
              select m.market_id, m.product_id, m.coverage_days, m.daily_velocity
              from product_capital_metrics m
              where m.market_id in (:ids)
                and m.coverage_days < :baixa
                and m.daily_velocity > 0
            )
            select o.product_id, p.name as produto,
                   o.market_id as de, d.market_id as para,
                   o.inventory_units, o.coverage_days as cobertura_origem,
                   o.unit_price, o.daily_velocity as giro_origem,
                   d.coverage_days as cobertura_destino, d.daily_velocity as giro_destino
            from origem o
            join destino d on d.product_id = o.product_id and d.market_id <> o.market_id
            join products p on p.id = o.product_id
            order by (o.coverage_days - d.coverage_days) desc
            limit :limite
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("ids", ids)
            .addValue("excesso", EXCESS_COVERAGE_DAYS)
            .addValue("baixa", LOW_COVERAGE_DAYS)
            .addValue("limite", Math.max(1, Math.min(limit, 50)));

        List<TransferSuggestion> out = new ArrayList<>();
        jdbc.query(sql, params, rs -> {
            UUID from = UUID.fromString(rs.getString("de"));
            UUID to = UUID.fromString(rs.getString("para"));

            BigDecimal originUnits = nz(rs.getBigDecimal("inventory_units"));
            BigDecimal originVelocity = nz(rs.getBigDecimal("giro_origem"));
            BigDecimal destVelocity = nz(rs.getBigDecimal("giro_destino"));
            BigDecimal destCoverage = nz(rs.getBigDecimal("cobertura_destino"));

            /*
             * Quanto mover: o MENOR entre o que sobra na origem e o que falta
             * no destino.
             *
             * Sobra = estoque acima do que a origem consome no ciclo alvo.
             * Falta = o que o destino precisa para chegar ao ciclo alvo.
             * Mover mais que a sobra criaria ruptura na origem; mais que a
             * falta, capital parado no destino.
             */
            BigDecimal originNeed = originVelocity
                .multiply(BigDecimal.valueOf(EXCESS_COVERAGE_DAYS));
            BigDecimal surplus = originUnits.subtract(originNeed).max(BigDecimal.ZERO);

            BigDecimal destTarget = destVelocity
                .multiply(BigDecimal.valueOf(LOW_COVERAGE_DAYS * 3));
            BigDecimal destHas = destVelocity.multiply(destCoverage);
            BigDecimal need = destTarget.subtract(destHas).max(BigDecimal.ZERO);

            BigDecimal units = surplus.min(need).setScale(0, RoundingMode.DOWN);
            if (units.signum() <= 0) {
                return;
            }

            BigDecimal price = nz(rs.getBigDecimal("unit_price"));
            out.add(new TransferSuggestion(
                UUID.fromString(rs.getString("product_id")),
                rs.getString("produto"),
                from, names.getOrDefault(from, "—"),
                to, names.getOrDefault(to, "—"),
                units,
                scale(units.multiply(price)),
                scale1(rs.getBigDecimal("cobertura_origem")),
                scale1(destCoverage),
                String.format(
                    "%s tem estoque para %.0f dias; %s tem para %.0f e continua vendendo.",
                    names.getOrDefault(from, "a origem"),
                    nz(rs.getBigDecimal("cobertura_origem")).doubleValue(),
                    names.getOrDefault(to, "o destino"),
                    destCoverage.doubleValue())
            ));
        });
        return out;
    }

    /**
     * Mesmo produto com preços diferentes entre filiais.
     *
     * Nem toda divergência é erro — bairros diferentes suportam preços
     * diferentes. O que o dono precisa é enxergar, não ser corrigido.
     */
    @Transactional(readOnly = true)
    public List<PriceDivergence> priceDivergences(UUID rootMarketId, int limit) {
        List<UUID> ids = networkIds(rootMarketId);
        if (ids.size() < MIN_BRANCHES_FOR_COMPARISON) {
            return List.of();
        }
        Map<UUID, String> names = namesOf(ids);

        String sql = """
            with precos as (
              select m.product_id, m.market_id, m.unit_price
              from product_capital_metrics m
              where m.market_id in (:ids) and m.unit_price > 0
            ),
            extremos as (
              select product_id,
                     min(unit_price) as menor, max(unit_price) as maior,
                     count(distinct market_id) as filiais
              from precos group by product_id
              having count(distinct market_id) >= :minFiliais
            )
            select e.product_id, p.name as produto, e.menor, e.maior,
                   (select market_id from precos x
                      where x.product_id = e.product_id and x.unit_price = e.menor limit 1) as barato,
                   (select market_id from precos x
                      where x.product_id = e.product_id and x.unit_price = e.maior limit 1) as caro
            from extremos e
            join products p on p.id = e.product_id
            where e.menor > 0 and ((e.maior - e.menor) / e.menor) * 100 >= :corte
            order by ((e.maior - e.menor) / e.menor) desc
            limit :limite
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("ids", ids)
            .addValue("minFiliais", MIN_BRANCHES_FOR_COMPARISON)
            .addValue("corte", PRICE_DIVERGENCE_PERCENT)
            .addValue("limite", Math.max(1, Math.min(limit, 50)));

        List<PriceDivergence> out = new ArrayList<>();
        jdbc.query(sql, params, rs -> {
            BigDecimal cheapest = rs.getBigDecimal("menor");
            BigDecimal priciest = rs.getBigDecimal("maior");
            UUID cheapId = UUID.fromString(rs.getString("barato"));
            UUID priceyId = UUID.fromString(rs.getString("caro"));

            out.add(new PriceDivergence(
                UUID.fromString(rs.getString("product_id")),
                rs.getString("produto"),
                names.getOrDefault(cheapId, "—"), scale(cheapest),
                names.getOrDefault(priceyId, "—"), scale(priciest),
                percentOf(priciest.subtract(cheapest), cheapest)
            ));
        });
        return out;
    }

    /** Ids da rede: a raiz e suas filiais. */
    private List<UUID> networkIds(UUID rootMarketId) {
        List<UUID> ids = new ArrayList<>();
        ids.add(rootMarketId);
        marketRepository.findByParentMarketId(rootMarketId)
            .forEach(m -> ids.add(m.getId()));
        return ids;
    }

    private Map<UUID, String> namesOf(List<UUID> ids) {
        Map<UUID, String> names = new LinkedHashMap<>();
        for (Market m : marketRepository.findAllById(ids)) {
            names.put(m.getId(), m.getName());
        }
        return names;
    }

    /** Quanto a melhor filial vende a mais que a pior, em %. */
    private BigDecimal spreadOf(List<BranchMetric> metrics) {
        BigDecimal best = null;
        BigDecimal worst = null;
        for (BranchMetric m : metrics) {
            BigDecimal v = m.dailyVelocity();
            if (v == null) {
                continue;
            }
            if (best == null || v.compareTo(best) > 0) {
                best = v;
            }
            if (worst == null || v.compareTo(worst) < 0) {
                worst = v;
            }
        }
        if (best == null || worst == null || worst.signum() <= 0) {
            return null;
        }
        return percentOf(best.subtract(worst), worst);
    }

    private static BigDecimal percentOf(BigDecimal part, BigDecimal total) {
        if (part == null || total == null || total.signum() <= 0) {
            return null;
        }
        return part.multiply(BigDecimal.valueOf(100))
            .divide(total, 1, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale0(BigDecimal v) {
        return v == null ? null : v.setScale(0, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale1(BigDecimal v) {
        return v == null ? null : v.setScale(1, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale4(BigDecimal v) {
        return v == null ? null : v.setScale(4, RoundingMode.HALF_UP);
    }
}
