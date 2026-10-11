package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import com.pdv2cloud.service.commerce.SellerAccessService.Seller;
import com.pdv2cloud.service.industry.PrivacyPolicyService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Campanhas: condição de preço com prazo, entregue a um público.
 *
 *  - PUBLICO: o vendedor descreve o público (área e comportamento de venda) e a
 *    plataforma entrega sem dizer quais lojas receberam. Só sai se alcançar o
 *    mínimo de lojas da regra de anonimato, para a contagem não revelar uma loja.
 *  - NOMINAL: lojas escolhidas entre as que autorizaram o vendedor.
 *
 * O motor de canal decide loja a loja se a campanha vai direto, via
 * distribuidor ou não vai. O vendedor só conhece a loja quando ela pede.
 */
@Service
public class CommerceCampaignService {

    static final List<String> AUDIENCES = List.of("TODAS", "VENDEM", "NAO_VENDEM", "RUPTURA");
    /** Consultas de alcance por dia: muitas contagens seguidas serviriam para cercar uma loja. */
    static final int PREVIEWS_PER_DAY = 30;
    static final int SENDS_PER_WEEK = 10;

    private record Reached(Store store, Decision decision) {
    }

    private record Reach(List<Reached> reached, Map<String, Integer> barred) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CommerceChannelService channel;
    private final CommerceCatalogService catalog;
    private final CommerceSellerService sellers;
    private final PrivacyPolicyService policies;

    public CommerceCampaignService(NamedParameterJdbcTemplate jdbc, CommerceChannelService channel, CommerceCatalogService catalog,
                                   CommerceSellerService sellers, PrivacyPolicyService policies) {
        this.jdbc = jdbc;
        this.channel = channel;
        this.catalog = catalog;
        this.sellers = sellers;
        this.policies = policies;
    }

    // ── Vendedor ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> list(UUID sellerId) {
        return Sql.plain(jdbc.queryForList("select c.id, c.number, c.title, c.target_type, c.target, c.valid_from, c.valid_until, c.status, "
            + "c.created_at, c.sent_at, (select count(*) from commerce_campaign_items i where i.campaign_id = c.id) as items, "
            + "(select count(*) from commerce_campaign_deliveries d where d.campaign_id = c.id) as delivered, "
            + "(select count(*) from commerce_campaign_deliveries d where d.campaign_id = c.id and d.status = 'PEDIDO') as ordered "
            + "from commerce_campaigns c where c.seller_id = :s order by c.created_at desc limit 200", Map.of("s", sellerId)));
    }

    public Map<String, Object> get(UUID sellerId, UUID id) {
        Map<String, Object> c = new LinkedHashMap<>(campaign(sellerId, id));
        c.put("items", jdbc.queryForList("select i.gtin, i.unit_price, i.min_quantity, p.name, p.base_price, p.unit_type "
            + "from commerce_campaign_items i left join commerce_seller_products p on p.seller_id = :s and p.gtin = i.gtin "
            + "where i.campaign_id = :c order by p.name", new MapSqlParameterSource().addValue("s", sellerId).addValue("c", id)));
        c.put("targets", jdbc.queryForList("select m.id, m.name from commerce_campaign_targets t join markets m on m.id = t.market_id "
            + "where t.campaign_id = :c order by m.name", Map.of("c", id)));
        if (!"RASCUNHO".equals(c.get("status"))) {
            c.put("results", results(sellerId, id));
        }
        return c;
    }

    private Map<String, Object> campaign(UUID sellerId, UUID id) {
        List<Map<String, Object>> r = jdbc.queryForList("select * from commerce_campaigns where id = :id and seller_id = :s",
            new MapSqlParameterSource().addValue("id", id).addValue("s", sellerId));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Campanha não encontrada.");
        }
        return Sql.plain(r.get(0));
    }

    /** Cria ou edita o rascunho. Campanha enviada não muda mais: as lojas já viram a condição. */
    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> save(Seller seller, UUID id, Map<String, Object> b) {
        String title = Sql.text(b.get("title"), 120);
        if (title == null) {
            throw new IllegalArgumentException("Dê um título à campanha.");
        }
        LocalDate from = Sql.date(b.get("validFrom"), LocalDate.now());
        LocalDate until = Sql.date(b.get("validUntil"), null);
        if (until == null || until.isBefore(from) || until.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("Informe até quando a campanha vale, de hoje em diante.");
        }
        if (until.isAfter(from.plusDays(120))) {
            throw new IllegalArgumentException("Uma campanha vale por até 120 dias.");
        }
        boolean nominal = "NOMINAL".equals(b.get("targetType"));
        Map<String, Object> target = new LinkedHashMap<>();
        if (!nominal) {
            Map<String, Object> t = b.get("target") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
            String audience = String.valueOf(t.getOrDefault("audience", "TODAS"));
            if (!AUDIENCES.contains(audience)) {
                throw new IllegalArgumentException("Público inválido.");
            }
            target.put("ufs", Sql.ufs(t.get("ufs")));
            target.put("cities", Sql.cities(t.get("cities")));
            target.put("audience", audience);
        }
        if (!(b.get("items") instanceof List<?> items) || items.isEmpty()) {
            throw new IllegalArgumentException("Inclua ao menos um produto na campanha.");
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("s", seller.id()).addValue("t", title)
            .addValue("msg", Sql.text(b.get("message"), 2000)).addValue("tt", nominal ? "NOMINAL" : "PUBLICO")
            .addValue("target", Sql.toJson(target)).addValue("from", java.sql.Date.valueOf(from))
            .addValue("until", java.sql.Date.valueOf(until)).addValue("a", seller.userEmail());
        if (id == null) {
            String number = jdbc.queryForObject("select 'CP-' || to_char(current_date, 'YYYY') || '-' || "
                + "lpad(nextval('commerce_campaign_number_seq')::text, 5, '0')", Map.of(), String.class);
            id = jdbc.queryForObject("insert into commerce_campaigns (seller_id, number, title, message, target_type, target, valid_from, "
                + "valid_until, created_by) values (:s, :n, :t, :msg, :tt, cast(:target as jsonb), :from, :until, :a) returning id",
                p.addValue("n", number), UUID.class);
        } else {
            int n = jdbc.update("update commerce_campaigns set title = :t, message = :msg, target_type = :tt, target = cast(:target as jsonb), "
                + "valid_from = :from, valid_until = :until where id = :id and seller_id = :s and status = 'RASCUNHO'", p.addValue("id", id));
            if (n == 0) {
                throw new IllegalArgumentException("Só o rascunho pode ser editado. Campanha enviada não muda mais.");
            }
        }
        jdbc.update("delete from commerce_campaign_items where campaign_id = :c", Map.of("c", id));
        for (Object o : items) {
            Map<String, Object> it = (Map<String, Object>) o;
            String gtin = Sql.gtin(it.get("gtin"));
            Map<String, Object> product = catalog.product(seller.id(), gtin);
            if (!"ATIVO".equals(product.get("status"))) {
                throw new IllegalArgumentException(product.get("name") + " não está ativo no seu catálogo.");
            }
            jdbc.update("insert into commerce_campaign_items (campaign_id, gtin, unit_price, min_quantity) values (:c, :g, :p, :q) "
                + "on conflict (campaign_id, gtin) do update set unit_price = excluded.unit_price, min_quantity = excluded.min_quantity",
                new MapSqlParameterSource().addValue("c", id).addValue("g", gtin)
                    .addValue("p", Sql.money(it.get("unitPrice"), "o preço da campanha"))
                    .addValue("q", Sql.qty(it.get("minQuantity"), (java.math.BigDecimal) product.get("min_quantity"))));
        }
        jdbc.update("delete from commerce_campaign_targets where campaign_id = :c", Map.of("c", id));
        if (nominal) {
            List<String> markets = Sql.strings(b.get("marketIds"));
            if (markets.isEmpty()) {
                throw new IllegalArgumentException("Escolha as lojas da campanha nominal.");
            }
            for (String m : markets) {
                UUID marketId = Sql.uuid(m);
                catalog.requireAuthorized(seller.id(), marketId);
                jdbc.update("insert into commerce_campaign_targets (campaign_id, market_id) values (:c, :m) on conflict do nothing",
                    new MapSqlParameterSource().addValue("c", id).addValue("m", marketId));
            }
        }
        return get(seller.id(), id);
    }

    /**
     * Quantas lojas a campanha alcançaria, por canal e por motivo de barreira.
     * Só contagens. Público pequeno demais devolve só o aviso.
     */
    @Transactional
    public Map<String, Object> preview(Seller seller, UUID id) {
        Integer today = jdbc.queryForObject("select count(*) from commerce_events where seller_id = :s and action = 'PREVIA_CAMPANHA' "
            + "and at >= current_date", Map.of("s", seller.id()), Integer.class);
        if (today != null && today >= PREVIEWS_PER_DAY) {
            throw new SellerAccessService.Denied(429, "Você chegou ao limite de consultas de alcance de hoje. Volte amanhã.");
        }
        Map<String, Object> c = campaign(seller.id(), id);
        Reach reach = reach(seller, c);
        sellers.event(seller.id(), seller.userEmail(), "PREVIA_CAMPANHA", Map.of("campanha", c.get("number")));
        return summary(c, reach);
    }

    private Map<String, Object> summary(Map<String, Object> c, Reach reach) {
        Map<String, Object> out = new LinkedHashMap<>();
        int min = policies.current().minStoresPerCell();
        boolean open = "PUBLICO".equals(c.get("target_type"));
        if (open && reach.reached().size() < min) {
            out.put("tooSmall", true);
            out.put("minStores", min);
            return out;
        }
        out.put("tooSmall", false);
        out.put("reach", reach.reached().size());
        out.put("direct", reach.reached().stream().filter(r -> CommerceChannelService.DIRETO.equals(r.decision().channel())).count());
        out.put("viaDistributor", reach.reached().stream().filter(r -> CommerceChannelService.DISTRIBUIDOR.equals(r.decision().channel())).count());
        Map<String, Integer> byDistributor = new TreeMap<>();
        reach.reached().stream().filter(r -> CommerceChannelService.DISTRIBUIDOR.equals(r.decision().channel()))
            .forEach(r -> byDistributor.merge(r.decision().distributorName(), 1, Integer::sum));
        // Distribuidor com poucas lojas não é detalhado: a contagem apontaria a loja.
        byDistributor.entrySet().removeIf(e -> open && e.getValue() < min);
        out.put("byDistributor", byDistributor);
        Map<String, Integer> barred = new TreeMap<>(reach.barred());
        barred.entrySet().removeIf(e -> open && e.getValue() < min);
        out.put("barred", barred);
        return out;
    }

    /** Envia: grava uma entrega por loja alcançada. Daí em diante a campanha não muda. */
    @Transactional
    public Map<String, Object> send(Seller seller, UUID id) {
        Map<String, Object> c = campaign(seller.id(), id);
        if (!"RASCUNHO".equals(c.get("status"))) {
            throw new IllegalArgumentException("Esta campanha já foi enviada.");
        }
        Integer week = jdbc.queryForObject("select count(*) from commerce_campaigns where seller_id = :s and sent_at >= now() - interval '7 days'",
            Map.of("s", seller.id()), Integer.class);
        if (week != null && week >= SENDS_PER_WEEK) {
            throw new SellerAccessService.Denied(429, "Limite de " + SENDS_PER_WEEK + " campanhas por semana atingido.");
        }
        Reach reach = reach(seller, c);
        Map<String, Object> summary = summary(c, reach);
        if (Boolean.TRUE.equals(summary.get("tooSmall"))) {
            throw new IllegalArgumentException("O público desta campanha é pequeno demais. Ela precisa alcançar ao menos "
                + summary.get("minStores") + " lojas, para nenhuma loja ser identificada. Amplie a área ou o público.");
        }
        if (reach.reached().isEmpty()) {
            throw new IllegalArgumentException("Nenhuma loja pode receber esta campanha agora.");
        }
        for (Reached r : reach.reached()) {
            Decision d = r.decision();
            jdbc.update("insert into commerce_campaign_deliveries (campaign_id, seller_id, market_id, channel, fulfilling_seller_id, "
                + "distributor_cnpj, distributor_name, channel_reason) values (:c, :s, :m, :ch, :f, :dc, :dn, :r)",
                new MapSqlParameterSource().addValue("c", id).addValue("s", seller.id()).addValue("m", r.store().id())
                    .addValue("ch", d.channel()).addValue("f", d.fulfillingSellerId()).addValue("dc", d.distributorCnpj())
                    .addValue("dn", d.distributorName()).addValue("r", d.reason()));
        }
        jdbc.update("update commerce_campaigns set status = 'ENVIADA', sent_at = now(), stats = cast(:st as jsonb) where id = :id",
            new MapSqlParameterSource().addValue("st", Sql.toJson(summary)).addValue("id", id));
        sellers.event(seller.id(), seller.userEmail(), "ENVIOU_CAMPANHA", Map.of("campanha", c.get("number"), "lojas", reach.reached().size()));
        return get(seller.id(), id);
    }

    /** Encerra antes do prazo: as lojas deixam de poder pedir. Rascunho é cancelado. */
    @Transactional
    public Map<String, Object> close(Seller seller, UUID id) {
        Map<String, Object> c = campaign(seller.id(), id);
        String to = "RASCUNHO".equals(c.get("status")) ? "CANCELADA" : "ENCERRADA";
        int n = jdbc.update("update commerce_campaigns set status = :to, closed_at = now() where id = :id and status in ('RASCUNHO', 'ENVIADA')",
            new MapSqlParameterSource().addValue("to", to).addValue("id", id));
        if (n == 0) {
            throw new IllegalArgumentException("Esta campanha já foi encerrada.");
        }
        sellers.event(seller.id(), seller.userEmail(), "ENCERROU_CAMPANHA", Map.of("campanha", c.get("number")));
        return get(seller.id(), id);
    }

    /** Resultado: contagens por situação; nome da loja só de quem pediu. */
    private Map<String, Object> results(UUID sellerId, UUID id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("byStatus", jdbc.queryForList("select status, channel, count(*) as n from commerce_campaign_deliveries "
            + "where campaign_id = :c group by status, channel", Map.of("c", id)));
        out.put("orders", jdbc.queryForList("select o.number, o.status, o.total_cents, o.created_at, m.name as market_name, l.city, l.uf, "
            + "coalesce(s.trade_name, s.legal_name) as fulfilled_by from commerce_orders o join markets m on m.id = o.market_id "
            + "left join market_locations l on l.market_id = o.market_id join commerce_sellers s on s.id = o.seller_id "
            + "where o.campaign_id = :c and o.campaign_seller_id = :s order by o.created_at desc",
            new MapSqlParameterSource().addValue("c", id).addValue("s", sellerId)));
        return out;
    }

    // ── Alcance ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Reach reach(Seller seller, Map<String, Object> c) {
        UUID id = (UUID) c.get("id");
        List<String> gtins = jdbc.queryForList("select gtin from commerce_campaign_items where campaign_id = :c", Map.of("c", id), String.class);
        Rules rules = channel.rules();
        SellerRow v = rules.seller(seller.id());
        Map<UUID, String> consents = channel.consentsOf(seller.id());
        boolean nominal = "NOMINAL".equals(c.get("target_type"));
        Map<String, Object> target = c.get("target") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        List<String> ufs = Sql.strings(target.get("ufs"));
        List<String> cities = Sql.strings(target.get("cities"));
        String audience = String.valueOf(target.getOrDefault("audience", "TODAS"));

        Set<UUID> named = nominal ? new HashSet<>(jdbc.queryForList("select market_id from commerce_campaign_targets where campaign_id = :c",
            Map.of("c", id), UUID.class)) : Set.of();
        Set<UUID> sold = !nominal && !"TODAS".equals(audience) ? soldRecently(gtins, 0, 28) : Set.of();
        Set<UUID> soldBefore = !nominal && "RUPTURA".equals(audience) ? soldRecently(gtins, 7, 35) : Set.of();
        Set<UUID> soldLastWeek = !nominal && "RUPTURA".equals(audience) ? soldRecently(gtins, 0, 7) : Set.of();

        List<Reached> reached = new ArrayList<>();
        Map<String, Integer> barred = new TreeMap<>();
        for (Store s : channel.stores()) {
            String consent = consents.get(s.id());
            if (nominal) {
                if (!named.contains(s.id())) {
                    continue;
                }
                if (!"AUTORIZADA".equals(consent)) {
                    barred.merge("AUTORIZACAO_RETIRADA", 1, Integer::sum);
                    continue;
                }
            } else {
                if (!ufs.isEmpty() || !cities.isEmpty()) {
                    if (!s.located() || (!ufs.contains(s.uf()) && (s.cityCode() == null || !cities.contains(s.cityCode())))) {
                        continue;
                    }
                }
                if (!"TODAS".equals(audience)) {
                    // Público por comportamento de venda só usa lojas que participam dos dados.
                    if (!s.sharesData()) {
                        continue;
                    }
                    boolean in = switch (audience) {
                        case "VENDEM" -> sold.contains(s.id());
                        case "NAO_VENDEM" -> !sold.contains(s.id());
                        default -> soldBefore.contains(s.id()) && !soldLastWeek.contains(s.id());
                    };
                    if (!in) {
                        continue;
                    }
                }
            }
            if (!s.receiveCampaigns()) {
                barred.merge("LOJA_NAO_RECEBE", 1, Integer::sum);
                continue;
            }
            Decision d = channel.decideAll(rules, v, s, gtins, consent);
            if (!d.allowed()) {
                barred.merge(d.code(), 1, Integer::sum);
                continue;
            }
            reached.add(new Reached(s, d));
        }
        return new Reach(reached, barred);
    }

    /** Lojas que venderam algum dos produtos entre {@code fromDaysAgo} e {@code toDaysAgo} dias atrás. */
    private Set<UUID> soldRecently(List<String> gtins, int fromDaysAgo, int toDaysAgo) {
        if (gtins.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.queryForList("select distinct i.market_id from invoices i join invoice_items it on it.invoice_id = i.id "
            + "where i.data_emissao >= now() - make_interval(days => :to) and i.data_emissao < now() - make_interval(days => :from) "
            + "and it.quantidade > 0 and it.codigo_ean ~ '^([0-9]{8}|[0-9]{12,14})$' and " + Sql.canon("it.codigo_ean") + " in (:g)",
            new MapSqlParameterSource().addValue("to", toDaysAgo).addValue("from", fromDaysAgo).addValue("g", gtins), UUID.class));
    }

    // ── Loja ──────────────────────────────────────────────────────────────

    /** Campanhas que chegaram à loja: as que ainda valem e as já respondidas (90 dias). */
    public List<Map<String, Object>> inbox(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select d.id, d.status, d.channel, d.distributor_name, d.channel_reason, "
            + "d.delivered_at, d.decided_at, d.fulfilling_seller_id, c.id as campaign_id, c.number, c.title, c.message, c.valid_from, "
            + "c.valid_until, c.status as campaign_status, c.seller_id, coalesce(s.trade_name, s.legal_name) as seller_name, s.kind as seller_kind, "
            + "(c.status = 'ENVIADA' and current_date between c.valid_from and c.valid_until) as open, "
            + "coalesce(f.trade_name, f.legal_name) as fulfilled_by, f.min_order_cents as fulfilled_min_order_cents "
            + "from commerce_campaign_deliveries d join commerce_campaigns c on c.id = d.campaign_id "
            + "join commerce_sellers s on s.id = c.seller_id left join commerce_sellers f on f.id = coalesce(d.fulfilling_seller_id, "
            + "case when d.channel = 'DIRETO' then c.seller_id end) "
            + "where d.market_id = :m and d.delivered_at >= now() - interval '90 days' order by d.delivered_at desc", Map.of("m", marketId));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> row = new LinkedHashMap<>(r);
            row.put("items", jdbc.queryForList("select i.gtin, i.unit_price, i.min_quantity, p.name, p.brand, p.unit_type, p.units_per_pack, "
                + "p.multiple_of from commerce_campaign_items i left join commerce_seller_products p on p.seller_id = :s and p.gtin = i.gtin "
                + "where i.campaign_id = :c order by p.name", new MapSqlParameterSource().addValue("s", r.get("seller_id")).addValue("c", r.get("campaign_id"))));
            out.add(row);
        }
        return out;
    }

    @Transactional
    public void seen(UUID marketId, UUID deliveryId) {
        jdbc.update("update commerce_campaign_deliveries set status = 'VISTA', seen_at = now() where id = :d and market_id = :m "
            + "and status = 'ENTREGUE'", new MapSqlParameterSource().addValue("d", deliveryId).addValue("m", marketId));
    }

    @Transactional
    public void refuse(UUID marketId, UUID deliveryId, String reason, String actor) {
        int n = jdbc.update("update commerce_campaign_deliveries set status = 'RECUSADA', decided_at = now(), decided_by = :a, "
            + "refuse_reason = :r, seen_at = coalesce(seen_at, now()) where id = :d and market_id = :m and status in ('ENTREGUE', 'VISTA')",
            new MapSqlParameterSource().addValue("d", deliveryId).addValue("m", marketId).addValue("a", actor)
                .addValue("r", Sql.text(reason, 300)));
        if (n == 0) {
            throw new IllegalArgumentException("Esta campanha já foi respondida.");
        }
    }
}
