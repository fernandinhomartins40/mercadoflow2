package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.SupplierOrderService;
import com.pdv2cloud.service.commerce.CommerceCatalogService.Price;
import com.pdv2cloud.service.commerce.CommerceCatalogService.PriceBook;
import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pedido da loja ao vendedor.
 *
 *   ENVIADO ─► CONFIRMADO ─► FATURADO ─► ENTREGUE
 *      └─► RECUSADO / CANCELADO   └─► CANCELADO
 *
 * O preço é sempre calculado aqui (tabela ou campanha), nunca aceito do
 * navegador, e o motor de canal é conferido de novo na hora do pedido. Todo
 * pedido também entra em Comprar → Pedidos da loja (supplier_orders), para o
 * recebimento e o histórico de custo seguirem como já funcionam.
 */
@Service
public class CommerceOrderService {

    private record Line(String gtin, String name, String unitType, BigDecimal unitsPerPack, BigDecimal quantity,
                        BigDecimal unitPrice, String source) {

        long subtotalCents() {
            return Sql.cents(quantity.multiply(unitPrice));
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CommerceChannelService channel;
    private final CommerceCatalogService catalog;
    private final SupplierOrderService supplierOrders;

    public CommerceOrderService(NamedParameterJdbcTemplate jdbc, CommerceChannelService channel, CommerceCatalogService catalog,
                                SupplierOrderService supplierOrders) {
        this.jdbc = jdbc;
        this.channel = channel;
        this.catalog = catalog;
        this.supplierOrders = supplierOrders;
    }

    // ── Loja: criar ───────────────────────────────────────────────────────

    /**
     * Pedido do catálogo de um vendedor, ou de uma campanha recebida
     * (deliveryId). Devolve o pedido; quando a campanha é atendida por um
     * distribuidor que não está na plataforma, devolve o rascunho criado em
     * Comprar → Pedidos, já com os preços da campanha.
     */
    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> create(UUID marketId, Map<String, Object> body, String actor) {
        if (!(body.get("items") instanceof List<?> rawItems) || rawItems.isEmpty()) {
            throw new IllegalArgumentException("O pedido não tem itens.");
        }
        Map<String, BigDecimal> wanted = new LinkedHashMap<>();
        for (Object o : rawItems) {
            Map<String, Object> it = (Map<String, Object>) o;
            BigDecimal quantity = Sql.qty(it.get("quantity"), null);
            if (quantity == null) {
                throw new IllegalArgumentException("Informe a quantidade de cada item.");
            }
            wanted.merge(Sql.gtin(it.get("gtin")), quantity, BigDecimal::add);
        }
        String notes = Sql.text(body.get("notes"), 1000);
        return body.get("deliveryId") != null
            ? fromCampaign(marketId, Sql.uuid(body.get("deliveryId")), wanted, notes, actor)
            : fromCatalog(marketId, Sql.uuid(body.get("sellerId")), wanted, notes, actor);
    }

    private Map<String, Object> fromCatalog(UUID marketId, UUID sellerId, Map<String, BigDecimal> wanted, String notes, String actor) {
        Rules rules = channel.rules();
        SellerRow seller = rules.seller(sellerId);
        if (seller == null) {
            throw new IllegalArgumentException("Vendedor não encontrado.");
        }
        Store store = channel.store(marketId);
        String consent = channel.consents(marketId).get(sellerId);
        PriceBook book = catalog.priceBook(sellerId, store, consent);
        Map<String, Map<String, Object>> products = productsOf(sellerId);
        List<Line> lines = new ArrayList<>();
        for (Map.Entry<String, BigDecimal> w : wanted.entrySet()) {
            Map<String, Object> p = products.get(w.getKey());
            if (p == null || !"ATIVO".equals(p.get("status"))) {
                throw new IllegalArgumentException("Produto fora do catálogo: " + w.getKey());
            }
            if (!Boolean.TRUE.equals(p.get("in_stock"))) {
                throw new IllegalArgumentException(p.get("name") + " está sem estoque no vendedor.");
            }
            Decision d = channel.decide(rules, seller, store, w.getKey(), consent);
            if (!d.allowed() || !CommerceChannelService.DIRETO.equals(d.channel())) {
                throw new IllegalArgumentException(p.get("name") + " não pode ser comprado deste vendedor pela sua loja. " + d.reason());
            }
            checkQuantity(p, w.getValue(), (BigDecimal) p.get("min_quantity"));
            Price price = book.price(w.getKey(), w.getValue(), (BigDecimal) p.get("base_price"));
            lines.add(line(p, w.getValue(), price.unitPrice(), price.source()));
        }
        return place(marketId, sellerId, null, null, CommerceChannelService.DIRETO, lines, notes, actor);
    }

    private Map<String, Object> fromCampaign(UUID marketId, UUID deliveryId, Map<String, BigDecimal> wanted, String notes, String actor) {
        List<Map<String, Object>> rows = jdbc.queryForList("select d.id, d.status, d.channel, d.fulfilling_seller_id, d.distributor_cnpj, "
            + "d.distributor_name, c.id as campaign_id, c.seller_id, c.number, c.title, c.status as campaign_status, "
            + "current_date between c.valid_from and c.valid_until as vigente from commerce_campaign_deliveries d "
            + "join commerce_campaigns c on c.id = d.campaign_id where d.id = :d and d.market_id = :m",
            new MapSqlParameterSource().addValue("d", deliveryId).addValue("m", marketId));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Campanha não encontrada.");
        }
        Map<String, Object> d = rows.get(0);
        if (!"ENVIADA".equals(d.get("campaign_status")) || !Boolean.TRUE.equals(d.get("vigente"))) {
            throw new IllegalArgumentException("Esta campanha não está mais valendo.");
        }
        if ("RECUSADA".equals(d.get("status"))) {
            throw new IllegalArgumentException("Sua loja recusou esta campanha.");
        }
        UUID campaignId = (UUID) d.get("campaign_id");
        UUID campaignSeller = (UUID) d.get("seller_id");
        Map<String, Map<String, Object>> products = productsOf(campaignSeller);
        Map<String, Map<String, Object>> offer = new HashMap<>();
        for (Map<String, Object> it : jdbc.queryForList("select gtin, unit_price, min_quantity from commerce_campaign_items "
            + "where campaign_id = :c", Map.of("c", campaignId))) {
            offer.put((String) it.get("gtin"), it);
        }
        List<Line> lines = new ArrayList<>();
        for (Map.Entry<String, BigDecimal> w : wanted.entrySet()) {
            Map<String, Object> it = offer.get(w.getKey());
            Map<String, Object> p = products.get(w.getKey());
            if (it == null || p == null) {
                throw new IllegalArgumentException("Produto fora da campanha: " + w.getKey());
            }
            checkQuantity(p, w.getValue(), (BigDecimal) it.get("min_quantity"));
            lines.add(line(p, w.getValue(), (BigDecimal) it.get("unit_price"), "CAMPANHA"));
        }
        String campaignNote = "Campanha " + d.get("number") + " - " + d.get("title");
        String fullNotes = notes == null ? campaignNote : campaignNote + ". " + notes;

        String ch = (String) d.get("channel");
        UUID fulfilling = CommerceChannelService.DIRETO.equals(ch) ? campaignSeller : (UUID) d.get("fulfilling_seller_id");
        if (fulfilling != null) {
            SellerRow f = channel.rules().seller(fulfilling);
            if (f == null || !"ATIVO".equals(f.status())) {
                if (CommerceChannelService.DIRETO.equals(ch)) {
                    throw new IllegalArgumentException("O vendedor desta campanha não está mais ativo.");
                }
                // Distribuidor saiu da plataforma: segue como distribuidor de fora.
                fulfilling = null;
            }
        }
        Map<String, Object> out;
        if (fulfilling != null) {
            out = place(marketId, fulfilling, campaignId, campaignSeller, ch, lines, fullNotes, actor);
        } else {
            // Distribuidor fora da plataforma: a loja fecha com ele por fora, com o pedido já montado.
            UUID supplierOrderId = mirror(marketId, (String) d.get("distributor_cnpj"), (String) d.get("distributor_name"),
                lines, fullNotes + ". Condição da indústria, atendida pelo distribuidor.", false);
            out = new LinkedHashMap<>();
            out.put("kind", "RASCUNHO_FORNECEDOR");
            out.put("supplierOrderId", supplierOrderId);
            out.put("distributorName", d.get("distributor_name"));
        }
        jdbc.update("update commerce_campaign_deliveries set status = 'PEDIDO', decided_at = now(), decided_by = :a, "
            + "seen_at = coalesce(seen_at, now()) where id = :d", new MapSqlParameterSource().addValue("a", actor).addValue("d", deliveryId));
        return out;
    }

    private Map<String, Map<String, Object>> productsOf(UUID sellerId) {
        Map<String, Map<String, Object>> out = new HashMap<>();
        for (Map<String, Object> p : jdbc.queryForList("select gtin, name, unit_type, units_per_pack, min_quantity, multiple_of, base_price, "
            + "in_stock, status from commerce_seller_products where seller_id = :s", Map.of("s", sellerId))) {
            out.put((String) p.get("gtin"), p);
        }
        return out;
    }

    private static void checkQuantity(Map<String, Object> product, BigDecimal quantity, BigDecimal minimum) {
        if (quantity.compareTo(minimum) < 0) {
            throw new IllegalArgumentException("O mínimo de " + product.get("name") + " é " + minimum.stripTrailingZeros().toPlainString() + ".");
        }
        BigDecimal multiple = (BigDecimal) product.get("multiple_of");
        if (multiple != null && multiple.signum() > 0 && quantity.remainder(multiple).signum() != 0) {
            throw new IllegalArgumentException(product.get("name") + " é vendido em múltiplos de "
                + multiple.stripTrailingZeros().toPlainString() + ".");
        }
    }

    private static Line line(Map<String, Object> p, BigDecimal quantity, BigDecimal unitPrice, String source) {
        return new Line((String) p.get("gtin"), (String) p.get("name"), (String) p.get("unit_type"), (BigDecimal) p.get("units_per_pack"),
            quantity, unitPrice, source);
    }

    private Map<String, Object> place(UUID marketId, UUID sellerId, UUID campaignId, UUID campaignSellerId, String ch, List<Line> lines,
                                      String notes, String actor) {
        Map<String, Object> seller = jdbc.queryForMap("select cnpj, legal_name, coalesce(trade_name, legal_name) as name, status, "
            + "min_order_cents, payment_terms, delivery_terms, order_fee_pct from commerce_sellers where id = :s", Map.of("s", sellerId));
        if (!"ATIVO".equals(seller.get("status"))) {
            throw new IllegalArgumentException("Este vendedor não está recebendo pedidos agora.");
        }
        long total = lines.stream().mapToLong(Line::subtotalCents).sum();
        int min = ((Number) seller.get("min_order_cents")).intValue();
        if (total < min) {
            throw new IllegalArgumentException("O pedido mínimo de " + seller.get("name") + " é " + brl(min) + ". Este pedido soma " + brl(total) + ".");
        }
        String number = jdbc.queryForObject("select 'PV-' || to_char(current_date, 'YYYY') || '-' || "
            + "lpad(nextval('commerce_order_number_seq')::text, 6, '0')", Map.of(), String.class);
        UUID supplierOrderId = mirror(marketId, (String) seller.get("cnpj"), (String) seller.get("legal_name"), lines,
            "Pedido digital " + number + (notes == null ? "" : ". " + notes), true);
        UUID id = jdbc.queryForObject("insert into commerce_orders (number, market_id, seller_id, campaign_id, campaign_seller_id, channel, "
            + "total_cents, payment_terms, delivery_terms, notes, order_fee_pct, supplier_order_id, created_by) values (:n, :m, :s, :c, :cs, "
            + ":ch, :t, :pay, :del, :notes, :fee, :so, :a) returning id",
            new MapSqlParameterSource().addValue("n", number).addValue("m", marketId).addValue("s", sellerId).addValue("c", campaignId)
                .addValue("cs", campaignSellerId).addValue("ch", ch).addValue("t", total).addValue("pay", seller.get("payment_terms"))
                .addValue("del", seller.get("delivery_terms")).addValue("notes", notes).addValue("fee", seller.get("order_fee_pct"))
                .addValue("so", supplierOrderId).addValue("a", actor), UUID.class);
        for (Line l : lines) {
            jdbc.update("insert into commerce_order_items (order_id, gtin, name, unit_type, units_per_pack, quantity, unit_price, "
                + "price_source, subtotal_cents) values (:o, :g, :n, :u, :pack, :q, :p, :src, :sub)",
                new MapSqlParameterSource().addValue("o", id).addValue("g", l.gtin()).addValue("n", l.name()).addValue("u", l.unitType())
                    .addValue("pack", l.unitsPerPack()).addValue("q", l.quantity()).addValue("p", l.unitPrice())
                    .addValue("src", l.source()).addValue("sub", l.subtotalCents()));
        }
        event(id, actor, "LOJA", null, "ENVIADO", null);
        Map<String, Object> out = forMarket(marketId, id);
        out.put("kind", "PEDIDO");
        return out;
    }

    /**
     * Espelha o pedido em Comprar → Pedidos da loja. Só entram os itens que
     * existem no catálogo de produtos; sem nenhum, não há espelho.
     */
    private UUID mirror(UUID marketId, String cnpj, String name, List<Line> lines, String notes, boolean send) {
        Map<String, UUID> productIds = new HashMap<>();
        for (Line l : lines) {
            String core = l.gtin().replaceFirst("^0+", "");
            List<UUID> ids = jdbc.queryForList("select id from products where ean in (:e) limit 1",
                Map.of("e", List.of(l.gtin(), core, "0".repeat(Math.max(0, 14 - core.length())) + core)), UUID.class);
            if (!ids.isEmpty()) {
                productIds.put(l.gtin(), ids.get(0));
            }
        }
        if (productIds.isEmpty()) {
            return null;
        }
        UUID supplierId = jdbc.queryForObject("insert into suppliers (market_id, cnpj, razao_social, is_active) values (:m, :c, :n, true) "
            + "on conflict (market_id, cnpj) do update set updated_at = now() returning id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("c", cnpj).addValue("n", name), UUID.class);
        UUID orderId = supplierOrders.createOrder(marketId, supplierId, notes.length() > 1000 ? notes.substring(0, 1000) : notes).id();
        for (Line l : lines) {
            UUID productId = productIds.get(l.gtin());
            if (productId != null) {
                supplierOrders.addItem(marketId, orderId, productId, l.quantity(), l.unitType(), l.unitsPerPack(), l.unitPrice(), null, null);
            }
        }
        if (send) {
            // O pedido já foi ao vendedor pela plataforma: o espelho nasce enviado,
            // sem passar pelo envio manual (nem pelo aviso ao ERP, que é para pedido
            // que a loja manda por fora).
            jdbc.update("update supplier_orders set status = 'ENVIADO', sent_at = now(), updated_at = now() where id = :o and market_id = :m",
                new MapSqlParameterSource().addValue("o", orderId).addValue("m", marketId));
        }
        return orderId;
    }

    // ── Loja: acompanhar ──────────────────────────────────────────────────

    public List<Map<String, Object>> listForMarket(UUID marketId) {
        return jdbc.queryForList("select o.id, o.number, o.status, o.total_cents, o.channel, o.created_at, o.nfe_number, "
            + "coalesce(s.trade_name, s.legal_name) as seller_name, s.kind as seller_kind, c.number as campaign_number, c.title as campaign_title, "
            + "(select count(*) from commerce_order_items i where i.order_id = o.id) as items "
            + "from commerce_orders o join commerce_sellers s on s.id = o.seller_id left join commerce_campaigns c on c.id = o.campaign_id "
            + "where o.market_id = :m order by o.created_at desc limit 200", Map.of("m", marketId));
    }

    public Map<String, Object> forMarket(UUID marketId, UUID orderId) {
        List<Map<String, Object>> r = jdbc.queryForList("select o.*, coalesce(s.trade_name, s.legal_name) as seller_name, s.kind as seller_kind, "
            + "s.contact_name as seller_contact, s.contact_email as seller_email, s.contact_phone as seller_phone, "
            + "c.number as campaign_number, c.title as campaign_title from commerce_orders o join commerce_sellers s on s.id = o.seller_id "
            + "left join commerce_campaigns c on c.id = o.campaign_id where o.id = :o and o.market_id = :m",
            new MapSqlParameterSource().addValue("o", orderId).addValue("m", marketId));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Pedido não encontrado.");
        }
        return withDetail(r.get(0));
    }

    /** A loja desiste antes de o vendedor confirmar. */
    @Transactional
    public Map<String, Object> cancelByMarket(UUID marketId, UUID orderId, String reason, String actor) {
        Map<String, Object> o = forMarket(marketId, orderId);
        if (!"ENVIADO".equals(o.get("status"))) {
            throw new IllegalArgumentException("O vendedor já confirmou este pedido. Fale com ele para cancelar.");
        }
        move(orderId, "ENVIADO", "CANCELADO", Sql.text(reason, 300), actor, "LOJA", "");
        cancelMirror(o, "Pedido digital cancelado pela loja");
        return forMarket(marketId, orderId);
    }

    /** A loja confirma que a mercadoria chegou. */
    @Transactional
    public Map<String, Object> receivedByMarket(UUID marketId, UUID orderId, String actor) {
        Map<String, Object> o = forMarket(marketId, orderId);
        if (!List.of("CONFIRMADO", "FATURADO").contains(o.get("status"))) {
            throw new IllegalArgumentException("Este pedido não está a caminho.");
        }
        deliver(orderId, (String) o.get("status"), actor, "LOJA");
        return forMarket(marketId, orderId);
    }

    // ── Vendedor ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> listForSeller(UUID sellerId, String status) {
        return jdbc.queryForList("select o.id, o.number, o.status, o.total_cents, o.channel, o.created_at, o.nfe_number, m.name as market_name, "
            + "l.city, l.uf, c.number as campaign_number, (select count(*) from commerce_order_items i where i.order_id = o.id) as items "
            + "from commerce_orders o join markets m on m.id = o.market_id left join market_locations l on l.market_id = o.market_id "
            + "left join commerce_campaigns c on c.id = o.campaign_id where o.seller_id = :s "
            + (status == null || status.isBlank() ? "" : "and o.status = :st ") + "order by o.created_at desc limit 300",
            new MapSqlParameterSource().addValue("s", sellerId).addValue("st", status));
    }

    /** Pedidos das campanhas da indústria atendidos por distribuidor: ela acompanha, sem agir. */
    public List<Map<String, Object>> listFulfilledByOthers(UUID campaignSellerId) {
        return jdbc.queryForList("select o.number, o.status, o.total_cents, o.created_at, m.name as market_name, l.city, l.uf, "
            + "c.number as campaign_number, coalesce(s.trade_name, s.legal_name) as distributor_name from commerce_orders o "
            + "join markets m on m.id = o.market_id left join market_locations l on l.market_id = o.market_id "
            + "join commerce_sellers s on s.id = o.seller_id left join commerce_campaigns c on c.id = o.campaign_id "
            + "where o.campaign_seller_id = :s and o.seller_id <> :s order by o.created_at desc limit 300", Map.of("s", campaignSellerId));
    }

    public Map<String, Object> forSeller(UUID sellerId, UUID orderId) {
        List<Map<String, Object>> r = jdbc.queryForList("select o.*, m.name as market_name, regexp_replace(coalesce(m.cnpj, ''), '\\D', '', 'g') "
            + "as market_cnpj, l.street, l.number as street_number, l.neighborhood, l.city, l.uf, l.postal_code, "
            + "c.number as campaign_number, c.title as campaign_title from commerce_orders o join markets m on m.id = o.market_id "
            + "left join market_locations l on l.market_id = o.market_id left join commerce_campaigns c on c.id = o.campaign_id "
            + "where o.id = :o and o.seller_id = :s", new MapSqlParameterSource().addValue("o", orderId).addValue("s", sellerId));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Pedido não encontrado.");
        }
        return withDetail(r.get(0));
    }

    /** Confirma o pedido; o vendedor pode confirmar menos do que foi pedido em cada item. */
    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> confirm(UUID sellerId, UUID orderId, Map<String, Object> body, String actor) {
        forSeller(sellerId, orderId);
        Map<UUID, BigDecimal> confirmed = new HashMap<>();
        if (body.get("items") instanceof List<?> items) {
            for (Object o : items) {
                Map<String, Object> it = (Map<String, Object>) o;
                BigDecimal q = new BigDecimal(String.valueOf(it.get("quantityConfirmed")).replace(',', '.')).setScale(3, RoundingMode.HALF_UP);
                if (q.signum() < 0) {
                    throw new IllegalArgumentException("Quantidade confirmada não pode ser negativa.");
                }
                confirmed.put(Sql.uuid(it.get("id")), q);
            }
        }
        long total = 0;
        for (Map<String, Object> it : jdbc.queryForList("select id, quantity, unit_price from commerce_order_items where order_id = :o",
            Map.of("o", orderId))) {
            BigDecimal asked = (BigDecimal) it.get("quantity");
            BigDecimal q = confirmed.getOrDefault((UUID) it.get("id"), asked);
            if (q.compareTo(asked) > 0) {
                throw new IllegalArgumentException("Não é possível confirmar mais do que a loja pediu.");
            }
            long sub = Sql.cents(q.multiply((BigDecimal) it.get("unit_price")));
            total += sub;
            jdbc.update("update commerce_order_items set quantity_confirmed = :q, subtotal_cents = :s where id = :id",
                new MapSqlParameterSource().addValue("q", q).addValue("s", sub).addValue("id", it.get("id")));
        }
        if (total <= 0) {
            throw new IllegalArgumentException("Sem nenhum item para atender, recuse o pedido.");
        }
        move(orderId, "ENVIADO", "CONFIRMADO", Sql.text(body.get("note"), 300), actor, "VENDEDOR", ", confirmed_at = now(), total_cents = " + total);
        return forSeller(sellerId, orderId);
    }

    @Transactional
    public Map<String, Object> refuse(UUID sellerId, UUID orderId, String reason, String actor) {
        Map<String, Object> o = forSeller(sellerId, orderId);
        String why = Sql.text(reason, 300);
        if (why == null) {
            throw new IllegalArgumentException("Escreva o motivo para a loja.");
        }
        String from = (String) o.get("status");
        if (!List.of("ENVIADO", "CONFIRMADO").contains(from)) {
            throw new IllegalArgumentException("Este pedido não pode mais ser recusado ou cancelado.");
        }
        move(orderId, from, "ENVIADO".equals(from) ? "RECUSADO" : "CANCELADO", why, actor, "VENDEDOR", "");
        cancelMirror(o, "Pedido digital " + ("ENVIADO".equals(from) ? "recusado" : "cancelado") + " pelo vendedor: " + why);
        return forSeller(sellerId, orderId);
    }

    @Transactional
    public Map<String, Object> invoice(UUID sellerId, UUID orderId, Map<String, Object> body, String actor) {
        forSeller(sellerId, orderId);
        String number = Sql.text(body.get("nfeNumber"), 20);
        String key = Sql.digits(body.get("nfeKey"));
        if (number == null) {
            throw new IllegalArgumentException("Informe o número da nota fiscal.");
        }
        if (!key.isEmpty() && key.length() != 44) {
            throw new IllegalArgumentException("A chave da nota tem 44 dígitos.");
        }
        jdbc.update("update commerce_orders set nfe_number = :n, nfe_key = :k where id = :o",
            new MapSqlParameterSource().addValue("n", number).addValue("k", key.isEmpty() ? null : key).addValue("o", orderId));
        move(orderId, "CONFIRMADO", "FATURADO", "NF " + number, actor, "VENDEDOR", ", invoiced_at = now()");
        return forSeller(sellerId, orderId);
    }

    @Transactional
    public Map<String, Object> delivered(UUID sellerId, UUID orderId, String actor) {
        Map<String, Object> o = forSeller(sellerId, orderId);
        if (!"FATURADO".equals(o.get("status"))) {
            throw new IllegalArgumentException("Registre a nota fiscal antes de marcar a entrega.");
        }
        deliver(orderId, "FATURADO", actor, "VENDEDOR");
        return forSeller(sellerId, orderId);
    }

    // ── Comum ─────────────────────────────────────────────────────────────

    /** Entrega: fixa a taxa do MercadoFlow sobre o valor entregue. */
    private void deliver(UUID orderId, String from, String actor, String side) {
        move(orderId, from, "ENTREGUE", null, actor, side,
            ", delivered_at = now(), fee_cents = round(total_cents * order_fee_pct / 100.0)");
    }

    /** Troca o status só se o pedido ainda estiver no status esperado (duas pessoas agindo ao mesmo tempo). */
    private void move(UUID orderId, String from, String to, String note, String actor, String side, String extraSet) {
        int n = jdbc.update("update commerce_orders set status = :to, status_reason = :note, updated_at = now()" + extraSet
            + " where id = :o and status = :from", new MapSqlParameterSource().addValue("to", to).addValue("note", note)
            .addValue("o", orderId).addValue("from", from));
        if (n == 0) {
            throw new IllegalArgumentException("O pedido mudou de situação. Atualize a tela.");
        }
        event(orderId, actor, side, from, to, note);
    }

    private void cancelMirror(Map<String, Object> order, String reason) {
        UUID supplierOrderId = (UUID) order.get("supplier_order_id");
        if (supplierOrderId != null) {
            try {
                supplierOrders.cancelOrder((UUID) order.get("market_id"), supplierOrderId, reason.length() > 500 ? reason.substring(0, 500) : reason);
            } catch (IllegalStateException | IllegalArgumentException e) {
                // A loja já recebeu ou cancelou o espelho por conta própria: nada a desfazer.
            }
        }
    }

    private void event(UUID orderId, String actor, String side, String from, String to, String note) {
        jdbc.update("insert into commerce_order_events (order_id, actor, actor_side, from_status, to_status, note) values (:o, :a, :s, :f, :t, :n)",
            new MapSqlParameterSource().addValue("o", orderId).addValue("a", actor).addValue("s", side).addValue("f", from)
                .addValue("t", to).addValue("n", note));
    }

    private Map<String, Object> withDetail(Map<String, Object> order) {
        Map<String, Object> out = new LinkedHashMap<>(order);
        out.put("items", jdbc.queryForList("select id, gtin, name, unit_type, units_per_pack, quantity, quantity_confirmed, unit_price, "
            + "price_source, subtotal_cents from commerce_order_items where order_id = :o order by name", Map.of("o", order.get("id"))));
        out.put("events", jdbc.queryForList("select actor_side, from_status, to_status, note, at from commerce_order_events "
            + "where order_id = :o order by at", Map.of("o", order.get("id"))));
        return out;
    }

    private static String brl(long cents) {
        return "R$ " + BigDecimal.valueOf(cents, 2).setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }
}
