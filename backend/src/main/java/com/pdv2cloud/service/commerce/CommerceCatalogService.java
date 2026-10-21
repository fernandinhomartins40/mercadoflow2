package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import com.pdv2cloud.service.commerce.SellerAccessService.Seller;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogo e preço do vendedor.
 *
 * O preço de um produto para uma loja é o da tabela vigente de maior
 * prioridade que alcança a loja (território e, na tabela nominal, a
 * autorização dela); sem tabela, vale o preço base do produto.
 */
@Service
public class CommerceCatalogService {

    /** Preço resolvido: valor por unidade de venda e de onde veio (BASE ou TABELA). */
    public record Price(BigDecimal unitPrice, String source, List<Map<String, Object>> tiers) {
    }

    /** Tabelas de um vendedor que alcançam uma loja, já em ordem de prioridade. */
    public static final class PriceBook {
        private final List<Map<String, Map<String, Object>>> lists = new ArrayList<>();

        @SuppressWarnings("unchecked")
        public Price price(String gtin, BigDecimal quantity, BigDecimal basePrice) {
            for (Map<String, Map<String, Object>> list : lists) {
                Map<String, Object> item = list.get(gtin);
                if (item == null) {
                    continue;
                }
                BigDecimal price = (BigDecimal) item.get("unit_price");
                List<Map<String, Object>> tiers = item.get("tiers") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
                BigDecimal best = BigDecimal.ZERO;
                for (Map<String, Object> t : tiers) {
                    BigDecimal min = new BigDecimal(String.valueOf(t.get("minQty")));
                    if (quantity != null && quantity.compareTo(min) >= 0 && min.compareTo(best) >= 0) {
                        best = min;
                        price = new BigDecimal(String.valueOf(t.get("unitPrice")));
                    }
                }
                return new Price(price, "TABELA", tiers);
            }
            return new Price(basePrice, "BASE", List.of());
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CommerceChannelService channel;

    public CommerceCatalogService(NamedParameterJdbcTemplate jdbc, CommerceChannelService channel) {
        this.jdbc = jdbc;
        this.channel = channel;
    }

    // ── Produtos do vendedor ──────────────────────────────────────────────

    public List<Map<String, Object>> products(UUID sellerId) {
        return jdbc.queryForList("select id, gtin, name, brand, owner, unit_type, units_per_pack, min_quantity, multiple_of, base_price, "
            + "in_stock, status, status_note, updated_at from commerce_seller_products where seller_id = :s order by status, name",
            Map.of("s", sellerId));
    }

    /**
     * Cria ou edita um produto do catálogo. Produto de indústria é marcado como
     * próprio (owner) e só fica ATIVO quando a titularidade está conferida: na
     * carteira aprovada do portal de dados, ou pelo superadmin.
     */
    @Transactional
    public Map<String, Object> saveProduct(Seller seller, Map<String, Object> b) {
        String gtin = Sql.gtin(b.get("gtin"));
        String name = Sql.text(b.get("name"), 200);
        if (name == null) {
            throw new IllegalArgumentException("Informe o nome do produto.");
        }
        BigDecimal price = Sql.money(b.get("basePrice"), "o preço");
        BigDecimal min = Sql.qty(b.get("minQuantity"), BigDecimal.ONE);
        BigDecimal multiple = Sql.qty(b.get("multipleOf"), BigDecimal.ONE);
        String unit = Sql.text(b.get("unitType"), 10);
        Object pack = b.get("unitsPerPack");
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("s", seller.id()).addValue("g", gtin).addValue("n", name)
            .addValue("b", Sql.text(b.get("brand"), 120)).addValue("u", unit == null ? "UN" : unit.toUpperCase(Locale.ROOT))
            .addValue("pack", pack == null || String.valueOf(pack).isBlank() ? null : Sql.qty(pack, null))
            .addValue("min", min).addValue("mult", multiple).addValue("price", price)
            .addValue("stock", !Boolean.FALSE.equals(b.get("inStock"))).addValue("owner", seller.industry());

        List<Map<String, Object>> cur = jdbc.queryForList("select id, status from commerce_seller_products where seller_id = :s and gtin = :g", p);
        if (!cur.isEmpty()) {
            jdbc.update("update commerce_seller_products set name = :n, brand = :b, unit_type = :u, units_per_pack = :pack, "
                + "min_quantity = :min, multiple_of = :mult, base_price = :price, in_stock = :stock, updated_at = now() "
                + "where seller_id = :s and gtin = :g", p);
            return product(seller.id(), gtin);
        }
        String status = "ATIVO";
        String note = null;
        if (seller.industry() && !ownsInPortfolio(seller, gtin)) {
            status = "PENDENTE";
            note = "Aguardando a conferência de que o produto é da sua empresa.";
        }
        try {
            jdbc.update("insert into commerce_seller_products (seller_id, gtin, name, brand, owner, unit_type, units_per_pack, min_quantity, "
                + "multiple_of, base_price, in_stock, status, status_note) values (:s, :g, :n, :b, :owner, :u, :pack, :min, :mult, :price, "
                + ":stock, :st, :note)", p.addValue("st", status).addValue("note", note));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Este produto já está no catálogo de outra indústria. Fale com o MercadoFlow se ele é seu.");
        }
        return product(seller.id(), gtin);
    }

    private boolean ownsInPortfolio(Seller seller, String gtin) {
        if (seller.industryId() == null) {
            return false;
        }
        Integer n = jdbc.queryForObject("select count(*) from industry_portfolio where industry_id = :i and gtin = :g and status = 'APROVADO'",
            new MapSqlParameterSource().addValue("i", seller.industryId()).addValue("g", gtin), Integer.class);
        return n != null && n > 0;
    }

    public Map<String, Object> product(UUID sellerId, String gtin) {
        List<Map<String, Object>> r = jdbc.queryForList("select * from commerce_seller_products where seller_id = :s and gtin = :g",
            new MapSqlParameterSource().addValue("s", sellerId).addValue("g", gtin));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Produto não encontrado no seu catálogo.");
        }
        return r.get(0);
    }

    /** O vendedor pausa ou reativa; PENDENTE e NEGADO só o superadmin muda. */
    @Transactional
    public Map<String, Object> pauseProduct(UUID sellerId, String rawGtin, boolean paused) {
        String gtin = Sql.gtin(rawGtin);
        int n = jdbc.update("update commerce_seller_products set status = :to, updated_at = now() where seller_id = :s and gtin = :g "
            + "and status = :from", new MapSqlParameterSource().addValue("s", sellerId).addValue("g", gtin)
            .addValue("to", paused ? "PAUSADO" : "ATIVO").addValue("from", paused ? "ATIVO" : "PAUSADO"));
        if (n == 0) {
            throw new IllegalArgumentException("Este produto não pode ser " + (paused ? "pausado" : "reativado") + " agora.");
        }
        return product(sellerId, gtin);
    }

    @Transactional
    public void removeProduct(UUID sellerId, String rawGtin) {
        String gtin = Sql.gtin(rawGtin);
        jdbc.update("delete from commerce_price_list_items where gtin = :g and price_list_id in "
            + "(select id from commerce_price_lists where seller_id = :s)", new MapSqlParameterSource().addValue("s", sellerId).addValue("g", gtin));
        jdbc.update("delete from commerce_seller_products where seller_id = :s and gtin = :g",
            new MapSqlParameterSource().addValue("s", sellerId).addValue("g", gtin));
    }

    // ── Tabelas de preço ──────────────────────────────────────────────────

    public List<Map<String, Object>> priceLists(UUID sellerId) {
        List<Map<String, Object>> lists = Sql.plain(jdbc.queryForList("select l.*, (select count(*) from commerce_price_list_items i "
            + "where i.price_list_id = l.id) as items_count from commerce_price_lists l where l.seller_id = :s order by l.priority desc, l.created_at desc",
            Map.of("s", sellerId)));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> l : lists) {
            Map<String, Object> row = new LinkedHashMap<>(l);
            row.put("items", Sql.plain(jdbc.queryForList("select i.gtin, i.unit_price, i.tiers, p.name from commerce_price_list_items i "
                + "left join commerce_seller_products p on p.seller_id = :s and p.gtin = i.gtin where i.price_list_id = :l order by p.name",
                new MapSqlParameterSource().addValue("s", sellerId).addValue("l", l.get("id")))));
            row.put("markets", jdbc.queryForList("select m.id, m.name from commerce_price_list_markets lm join markets m on m.id = lm.market_id "
                + "where lm.price_list_id = :l order by m.name", Map.of("l", l.get("id"))));
            out.add(row);
        }
        return out;
    }

    /** Cria ou substitui uma tabela de preço com os itens e, na nominal, as lojas. */
    @Transactional
    @SuppressWarnings("unchecked")
    public void savePriceList(Seller seller, UUID id, Map<String, Object> b) {
        String name = Sql.text(b.get("name"), 120);
        if (name == null) {
            throw new IllegalArgumentException("Dê um nome à tabela de preço.");
        }
        String audience = "NOMINAL".equals(b.get("audience")) ? "NOMINAL" : "TODAS";
        LocalDate from = Sql.date(b.get("validFrom"), LocalDate.now());
        LocalDate until = Sql.date(b.get("validUntil"), null);
        if (until != null && until.isBefore(from)) {
            throw new IllegalArgumentException("O fim da tabela vem depois do início.");
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("s", seller.id()).addValue("n", name)
            .addValue("pr", Sql.intOf(b.get("priority"), 0)).addValue("a", audience)
            .addValue("ufs", Sql.pgArray(Sql.ufs(b.get("scopeUfs")))).addValue("cities", Sql.pgArray(Sql.cities(b.get("scopeCities"))))
            .addValue("from", java.sql.Date.valueOf(from)).addValue("until", until == null ? null : java.sql.Date.valueOf(until))
            .addValue("st", "PAUSADA".equals(b.get("status")) ? "PAUSADA" : "ATIVA");
        if (id == null) {
            id = jdbc.queryForObject("insert into commerce_price_lists (seller_id, name, priority, audience, scope_ufs, scope_cities, "
                + "valid_from, valid_until, status) values (:s, :n, :pr, :a, cast(:ufs as text[]), cast(:cities as text[]), :from, :until, :st) "
                + "returning id", p, UUID.class);
        } else {
            int n = jdbc.update("update commerce_price_lists set name = :n, priority = :pr, audience = :a, scope_ufs = cast(:ufs as text[]), "
                + "scope_cities = cast(:cities as text[]), valid_from = :from, valid_until = :until, status = :st, updated_at = now() "
                + "where id = :id and seller_id = :s", p.addValue("id", id));
            if (n == 0) {
                throw new IllegalArgumentException("Tabela de preço não encontrada.");
            }
        }
        jdbc.update("delete from commerce_price_list_items where price_list_id = :l", Map.of("l", id));
        Object rawItems = b.get("items");
        if (rawItems instanceof List<?> items) {
            for (Object o : items) {
                Map<String, Object> it = (Map<String, Object>) o;
                String gtin = Sql.gtin(it.get("gtin"));
                product(seller.id(), gtin);
                List<Map<String, Object>> tiers = new ArrayList<>();
                if (it.get("tiers") instanceof List<?> raw) {
                    for (Object t : raw) {
                        Map<String, Object> tier = (Map<String, Object>) t;
                        tiers.add(Map.of("minQty", Sql.qty(tier.get("minQty"), null), "unitPrice", Sql.money(tier.get("unitPrice"), "o preço da faixa")));
                    }
                }
                jdbc.update("insert into commerce_price_list_items (price_list_id, gtin, unit_price, tiers) values (:l, :g, :p, cast(:t as jsonb))",
                    new MapSqlParameterSource().addValue("l", id).addValue("g", gtin)
                        .addValue("p", Sql.money(it.get("unitPrice"), "o preço")).addValue("t", Sql.toJson(tiers)));
            }
        }
        jdbc.update("delete from commerce_price_list_markets where price_list_id = :l", Map.of("l", id));
        if ("NOMINAL".equals(audience)) {
            List<String> markets = Sql.strings(b.get("marketIds"));
            if (markets.isEmpty()) {
                throw new IllegalArgumentException("Escolha as lojas da tabela nominal.");
            }
            for (String m : markets) {
                UUID marketId = Sql.uuid(m);
                requireAuthorized(seller.id(), marketId);
                jdbc.update("insert into commerce_price_list_markets (price_list_id, market_id) values (:l, :m) on conflict do nothing",
                    new MapSqlParameterSource().addValue("l", id).addValue("m", marketId));
            }
        }
    }

    @Transactional
    public void deletePriceList(UUID sellerId, UUID id) {
        jdbc.update("delete from commerce_price_lists where id = :id and seller_id = :s",
            new MapSqlParameterSource().addValue("id", id).addValue("s", sellerId));
    }

    /** Só loja que autorizou o vendedor pode ser escolhida pelo nome. */
    public void requireAuthorized(UUID sellerId, UUID marketId) {
        Integer n = jdbc.queryForObject("select count(*) from market_seller_consents where seller_id = :s and market_id = :m "
            + "and status = 'AUTORIZADA'", new MapSqlParameterSource().addValue("s", sellerId).addValue("m", marketId), Integer.class);
        if (n == null || n == 0) {
            throw new IllegalArgumentException("Só é possível escolher pelo nome uma loja que autorizou a sua empresa.");
        }
    }

    // ── Preço e catálogo para uma loja ────────────────────────────────────

    /** Tabelas do vendedor que alcançam a loja. */
    public PriceBook priceBook(UUID sellerId, Store store, String consent) {
        PriceBook book = new PriceBook();
        List<Map<String, Object>> lists = Sql.plain(jdbc.queryForList("select l.id, l.audience, l.scope_ufs, l.scope_cities, "
            + "exists (select 1 from commerce_price_list_markets lm where lm.price_list_id = l.id and lm.market_id = :m) as listed "
            + "from commerce_price_lists l where l.seller_id = :s and l.status = 'ATIVA' and l.valid_from <= current_date "
            + "and (l.valid_until is null or l.valid_until >= current_date) order by l.priority desc, l.created_at desc",
            new MapSqlParameterSource().addValue("s", sellerId).addValue("m", store.id())));
        for (Map<String, Object> l : lists) {
            List<String> ufs = Sql.array(l.get("scope_ufs"));
            List<String> cities = Sql.array(l.get("scope_cities"));
            boolean inArea = (ufs.isEmpty() && cities.isEmpty())
                || (store.located() && (ufs.contains(store.uf()) || (store.cityCode() != null && cities.contains(store.cityCode()))));
            boolean nominalOk = !"NOMINAL".equals(l.get("audience")) || (Boolean.TRUE.equals(l.get("listed")) && "AUTORIZADA".equals(consent));
            if (!inArea || !nominalOk) {
                continue;
            }
            Map<String, Map<String, Object>> items = new HashMap<>();
            for (Map<String, Object> it : Sql.plain(jdbc.queryForList("select gtin, unit_price, tiers from commerce_price_list_items "
                + "where price_list_id = :l", Map.of("l", l.get("id"))))) {
                items.put((String) it.get("gtin"), it);
            }
            book.lists.add(items);
        }
        return book;
    }

    /**
     * Produtos de um vendedor que a loja pode comprar direto dele, com o preço
     * que vale para ela. Produto que só chega via distribuidor não aparece
     * aqui: a loja o compra no catálogo do distribuidor.
     */
    public List<Map<String, Object>> catalogFor(Rules rules, SellerRow seller, Store store, String consent, String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        PriceBook book = priceBook(seller.id(), store, consent);
        List<Map<String, Object>> out = new ArrayList<>();
        // A foto vem do cadastro de produtos pelo código de barras: o painel mostra a miniatura de todo produto.
        for (Map<String, Object> p : jdbc.queryForList("select sp.gtin, sp.name, sp.brand, sp.unit_type, sp.units_per_pack, sp.min_quantity, sp.multiple_of, "
            + "sp.base_price, sp.in_stock, (select pr.image_url from products pr where pr.ean = sp.gtin and pr.image_url is not null limit 1) as image_url "
            + "from commerce_seller_products sp where sp.seller_id = :s and sp.status = 'ATIVO' order by sp.name",
            Map.of("s", seller.id()))) {
            String gtin = (String) p.get("gtin");
            if (!q.isEmpty() && !(String.valueOf(p.get("name")).toLowerCase(Locale.ROOT).contains(q) || gtin.contains(q)
                || String.valueOf(p.get("brand")).toLowerCase(Locale.ROOT).contains(q))) {
                continue;
            }
            Decision d = channel.decide(rules, seller, store, gtin, consent);
            if (!d.allowed() || !CommerceChannelService.DIRETO.equals(d.channel())) {
                continue;
            }
            Price price = book.price(gtin, (BigDecimal) p.get("min_quantity"), (BigDecimal) p.get("base_price"));
            Map<String, Object> row = new LinkedHashMap<>(p);
            row.remove("base_price");
            row.put("unit_price", price.unitPrice());
            row.put("price_source", price.source());
            row.put("tiers", price.tiers());
            out.add(row);
        }
        return out;
    }
}
