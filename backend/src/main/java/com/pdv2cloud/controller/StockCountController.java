package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.decision.DecisionInputsService;
import com.pdv2cloud.service.intelligence.CapitalScoreboardService;
import com.pdv2cloud.service.intelligence.ProductIntelligenceMaterializer;
import com.pdv2cloud.tenancy.TenantContext;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
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

/**
 * Contagem rápida (F7 do plano de experiência): os produtos que mais vendem e
 * ainda não têm estoque medido, para o dono contar no celular em minutos. É o
 * dado que liga dinheiro parado, dias de estoque e compra certa. Depois de
 * salvar, o capital da loja é recalculado em segundo plano.
 */
@Slf4j
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}/stock-count")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class StockCountController {

    private static final ExecutorService RECALC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "stock-count-recalc");
        t.setDaemon(true);
        return t;
    });
    private static final Set<UUID> PENDING = ConcurrentHashMap.newKeySet();

    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;
    private final DecisionInputsService inputs;
    private final ProductIntelligenceMaterializer materializer;
    private final CapitalScoreboardService scoreboard;

    public StockCountController(MarketAccessService access, NamedParameterJdbcTemplate jdbc, DecisionInputsService inputs,
                                ProductIntelligenceMaterializer materializer, CapitalScoreboardService scoreboard) {
        this.access = access;
        this.jdbc = jdbc;
        this.inputs = inputs;
        this.materializer = materializer;
        this.scoreboard = scoreboard;
    }

    /** Os que mais vendem (90 dias) sem contagem nos últimos 30 dias e sem estoque confiável. */
    @GetMapping("/suggested")
    public List<Map<String, Object>> suggested(@PathVariable("id") UUID id, @RequestParam(value = "limit", defaultValue = "20") int limit,
                                               Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        return jdbc.queryForList(
            "with sold as ( "
                + "  select it.product_id, sum(it.valor_total) as rev, sum(it.quantidade) as qty "
                + "  from invoice_items it join invoices i on i.id = it.invoice_id "
                + "  where i.market_id = :m and i.data_emissao >= now() - interval '90 days' and it.product_id is not null "
                + "  group by it.product_id) "
                + "select p.id as \"productId\", p.name, p.image_url as \"imageUrl\", p.ean, coalesce(p.unit, 'UN') as unit, "
                + "  round(s.qty / 90.0, 1) as \"perDay\" "
                + "from sold s join products p on p.id = s.product_id "
                + "where not exists (select 1 from stock_counts c where c.market_id = :m and c.product_id = p.id and c.counted_at > now() - interval '30 days') "
                + "  and not exists (select 1 from product_inventory_estimates e where e.market_id = :m and e.product_id = p.id and e.confidence_score >= 0.4) "
                + "order by s.rev desc limit :n",
            new MapSqlParameterSource("m", id).addValue("n", Math.max(1, Math.min(limit, 50))));
    }

    /** Salva a contagem (unidades na loja agora) e recalcula o capital em segundo plano. */
    @PostMapping
    public Map<String, Object> save(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        List<DecisionInputsService.Input> list = new ArrayList<>();
        if (body.get("items") instanceof List<?> l) {
            for (Object o : l) {
                if (!(o instanceof Map<?, ?> m) || m.get("productId") == null || m.get("units") == null) continue;
                BigDecimal units = new BigDecimal(String.valueOf(m.get("units")).replace(",", "."));
                list.add(new DecisionInputsService.Input(UUID.fromString(String.valueOf(m.get("productId"))), null, null, units));
            }
        }
        if (list.isEmpty()) throw new IllegalArgumentException("Conte ao menos um produto.");
        if (list.size() > 200) throw new IllegalArgumentException("No máximo 200 produtos por vez.");
        DecisionInputsService.Saved saved = inputs.save(id, authentication.getName(), null, list);
        boolean scheduled = PENDING.add(id);
        if (scheduled) {
            RECALC.submit(() -> {
                try {
                    TenantContext.runAsSystem(() -> {
                        materializer.materializeMarket(id);
                        scoreboard.snapshot(id);
                    });
                } catch (Exception e) {
                    log.warn("Recálculo após contagem falhou (mercado {}): {}", id, e.getMessage());
                } finally {
                    PENDING.remove(id);
                }
            });
        }
        return Map.of("counted", saved.counts(), "recalculating", true);
    }
}
