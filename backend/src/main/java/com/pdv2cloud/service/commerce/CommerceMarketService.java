package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.commerce.CommerceCatalogService.Price;
import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O lado da loja: quem pode vendê-la, o catálogo com o preço que vale para
 * ela, e o que ela decide sobre campanhas e vendedores.
 */
@Service
public class CommerceMarketService {

    private final NamedParameterJdbcTemplate jdbc;
    private final CommerceChannelService channel;
    private final CommerceCatalogService catalog;

    public CommerceMarketService(NamedParameterJdbcTemplate jdbc, CommerceChannelService channel, CommerceCatalogService catalog) {
        this.jdbc = jdbc;
        this.channel = channel;
        this.catalog = catalog;
    }

    /** Vendedores com algo que a loja pode comprar, mais os que ela autorizou ou bloqueou. */
    public List<Map<String, Object>> sellers(UUID marketId) {
        Rules rules = channel.rules();
        Store store = channel.store(marketId);
        Map<UUID, String> consents = channel.consents(marketId);
        // Quem já mandou campanha à loja aparece mesmo sem vender direto a ela
        // (indústria em área de distribuidor exclusivo): a loja pode autorizar ou bloquear.
        java.util.Set<UUID> campaigned = new java.util.HashSet<>(jdbc.queryForList("select distinct seller_id from "
            + "commerce_campaign_deliveries where market_id = :m", Map.of("m", marketId), UUID.class));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> s : jdbc.queryForList("select id, kind, coalesce(trade_name, legal_name) as name, min_order_cents, "
            + "payment_terms, delivery_terms from commerce_sellers where status = 'ATIVO' order by 3", Map.of())) {
            UUID id = (UUID) s.get("id");
            String consent = consents.get(id);
            int products = "BLOQUEADA".equals(consent) ? 0 : catalog.catalogFor(rules, rules.seller(id), store, consent, null).size();
            if (products == 0 && consent == null && !campaigned.contains(id)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>(s);
            row.put("products", products);
            row.put("consent", consent);
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> catalog(UUID marketId, UUID sellerId, String query) {
        Rules rules = channel.rules();
        SellerRow seller = rules.seller(sellerId);
        if (seller == null) {
            throw new IllegalArgumentException("Vendedor não encontrado.");
        }
        return catalog.catalogFor(rules, seller, channel.store(marketId), channel.consents(marketId).get(sellerId), query);
    }

    /** "Quem me atende e por quanto": as ofertas de todos os vendedores para um produto, da mais barata à mais cara. */
    public List<Map<String, Object>> offers(UUID marketId, String rawGtin) {
        String gtin = Sql.gtin(rawGtin);
        Rules rules = channel.rules();
        Store store = channel.store(marketId);
        Map<UUID, String> consents = channel.consents(marketId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> p : jdbc.queryForList("select seller_id, name, unit_type, units_per_pack, min_quantity, multiple_of, base_price, "
            + "in_stock from commerce_seller_products where gtin = :g and status = 'ATIVO'", Map.of("g", gtin))) {
            UUID sellerId = (UUID) p.get("seller_id");
            SellerRow seller = rules.seller(sellerId);
            String consent = consents.get(sellerId);
            Decision d = channel.decide(rules, seller, store, gtin, consent);
            if (!d.allowed() || !CommerceChannelService.DIRETO.equals(d.channel())) {
                continue;
            }
            Price price = catalog.priceBook(sellerId, store, consent).price(gtin, (BigDecimal) p.get("min_quantity"), (BigDecimal) p.get("base_price"));
            Map<String, Object> row = new LinkedHashMap<>(p);
            row.remove("base_price");
            row.put("seller_name", seller.name());
            row.put("seller_kind", seller.kind());
            row.put("unit_price", price.unitPrice());
            row.put("tiers", price.tiers());
            out.add(row);
        }
        out.sort(Comparator.comparing(r -> (BigDecimal) r.get("unit_price")));
        return out;
    }

    // ── Preferências e autorizações ───────────────────────────────────────

    public Map<String, Object> preferences(UUID marketId) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Boolean> r = jdbc.queryForList("select receive_campaigns from market_commerce_preferences where market_id = :m",
            Map.of("m", marketId), Boolean.class);
        out.put("receiveCampaigns", r.isEmpty() || Boolean.TRUE.equals(r.get(0)));
        out.put("stores", jdbc.queryForObject("select count(*) from markets where parent_market_id = :m", Map.of("m", marketId), Integer.class));
        out.put("consents", jdbc.queryForList("select c.seller_id, c.status, c.changed_at, coalesce(s.trade_name, s.legal_name) as seller_name, "
            + "s.kind as seller_kind from market_seller_consents c join commerce_sellers s on s.id = c.seller_id where c.market_id = :m "
            + "order by 4", Map.of("m", marketId)));
        return out;
    }

    @Transactional
    public Map<String, Object> setReceiveCampaigns(UUID marketId, boolean receive, boolean wholeNetwork, String actor) {
        for (UUID m : scope(marketId, wholeNetwork)) {
            jdbc.update("insert into market_commerce_preferences (market_id, receive_campaigns, updated_by) values (:m, :r, :a) "
                + "on conflict (market_id) do update set receive_campaigns = excluded.receive_campaigns, updated_at = now(), "
                + "updated_by = excluded.updated_by", new MapSqlParameterSource().addValue("m", m).addValue("r", receive).addValue("a", actor));
        }
        return preferences(marketId);
    }

    /**
     * AUTORIZADA: o vendedor passa a ver a loja pelo nome e pode mandar campanha
     * e tabela de preço nominais. BLOQUEADA: nada dele chega. null: volta ao
     * padrão (só campanhas para o público e o catálogo).
     */
    @Transactional
    public Map<String, Object> setConsent(UUID marketId, UUID sellerId, String status, boolean wholeNetwork, String actor) {
        if (status != null && !List.of("AUTORIZADA", "BLOQUEADA").contains(status)) {
            throw new IllegalArgumentException("Escolha autorizar ou bloquear.");
        }
        Integer exists = jdbc.queryForObject("select count(*) from commerce_sellers where id = :s", Map.of("s", sellerId), Integer.class);
        if (exists == null || exists == 0) {
            throw new IllegalArgumentException("Vendedor não encontrado.");
        }
        for (UUID m : scope(marketId, wholeNetwork)) {
            MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", m).addValue("s", sellerId).addValue("st", status).addValue("a", actor);
            if (status == null) {
                jdbc.update("delete from market_seller_consents where market_id = :m and seller_id = :s", p);
            } else {
                jdbc.update("insert into market_seller_consents (market_id, seller_id, status, changed_by) values (:m, :s, :st, :a) "
                    + "on conflict (market_id, seller_id) do update set status = excluded.status, changed_at = now(), "
                    + "changed_by = excluded.changed_by", p);
            }
        }
        return preferences(marketId);
    }

    /**
     * A loja, ou a loja e as filiais quando a matriz decide pela rede. Com a
     * rede, quem chama roda como sistema: a sessão da matriz só enxerga as
     * próprias linhas.
     */
    private List<UUID> scope(UUID marketId, boolean wholeNetwork) {
        List<UUID> out = new ArrayList<>(List.of(marketId));
        if (wholeNetwork) {
            out.addAll(jdbc.queryForList("select id from markets where parent_market_id = :m", Map.of("m", marketId), UUID.class));
        }
        return out;
    }
}
