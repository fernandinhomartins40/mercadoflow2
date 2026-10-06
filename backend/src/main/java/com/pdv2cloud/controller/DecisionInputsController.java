package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.decision.DecisionInputsService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Custo, preço e estoque informados nas decisões, e quanto do vendido tem custo conhecido. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class DecisionInputsController {

    private final DecisionInputsService inputs;
    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;

    public DecisionInputsController(DecisionInputsService inputs, MarketAccessService access, NamedParameterJdbcTemplate jdbc) {
        this.inputs = inputs;
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping("/decision-inputs")
    public List<DecisionInputsService.Known> known(@PathVariable("id") UUID id, @RequestParam("productIds") String productIds,
                                                    Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        List<UUID> ids = Arrays.stream(productIds.split(",")).map(String::trim).filter(s -> !s.isEmpty())
            .limit(200).map(UUID::fromString).toList();
        return inputs.known(id, ids);
    }

    @PostMapping("/decision-inputs")
    public DecisionInputsService.Saved save(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        UUID rec = body.get("recommendationId") != null ? UUID.fromString(String.valueOf(body.get("recommendationId"))) : null;
        List<DecisionInputsService.Input> list = new ArrayList<>();
        Object items = body.get("items");
        if (items instanceof List<?> l) {
            for (Object o : l) {
                if (!(o instanceof Map<?, ?> m) || m.get("productId") == null) continue;
                list.add(new DecisionInputsService.Input(
                    UUID.fromString(String.valueOf(m.get("productId"))),
                    decimal(m.get("unitCost")), decimal(m.get("actionPrice")), decimal(m.get("stockUnits"))));
            }
        }
        if (list.size() > 200) {
            throw new IllegalArgumentException("No máximo 200 itens por vez.");
        }
        return inputs.save(id, authentication.getName(), rec, list);
    }

    /**
     * Quanto do que a loja vende tem custo real e estoque conhecido (pelo
     * faturamento de 90 dias), e quantas notas de entrada do Confere esperam
     * conferência — é de lá que custo e estoque viriam sem digitar.
     */
    @GetMapping("/analytics/cost-coverage")
    public Map<String, Object> costCoverage(@PathVariable("id") UUID id, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        MapSqlParameterSource p = new MapSqlParameterSource("m", id);
        Map<String, Object> out = new LinkedHashMap<>(jdbc.queryForMap(
            "select coalesce(sum(revenue), 0) as revenue, " +
            "  coalesce(sum(revenue) filter (where cost_source <> 'MARGIN_ESTIMATE'), 0) as revenue_with_cost, " +
            "  coalesce(sum(revenue) filter (where inventory_units is not null), 0) as revenue_with_stock, " +
            "  count(*) as products, count(*) filter (where cost_source <> 'MARGIN_ESTIMATE') as products_with_cost " +
            "from product_capital_metrics where market_id = :m", p));
        BigDecimal revenue = (BigDecimal) out.get("revenue");
        out.put("costShare", share((BigDecimal) out.get("revenue_with_cost"), revenue));
        out.put("stockShare", share((BigDecimal) out.get("revenue_with_stock"), revenue));
        out.put("bySource", jdbc.queryForList(
            "select cost_source as source, count(*) as products from product_capital_metrics where market_id = :m group by 1", p));
        out.put("pendingNfe", jdbc.queryForObject(
            "select count(*) from nfe_documents n where n.market_id = :m and n.created_at >= now() - interval '60 days' " +
            "  and not exists (select 1 from confere_stock_entries e where e.document_id = n.id)", p, Long.class));
        return out;
    }

    private static double share(BigDecimal part, BigDecimal total) {
        return total == null || total.signum() == 0 ? 0 : part.divide(total, 4, java.math.RoundingMode.HALF_UP).doubleValue();
    }

    private static BigDecimal decimal(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        return new BigDecimal(String.valueOf(v).replace(",", "."));
    }
}
