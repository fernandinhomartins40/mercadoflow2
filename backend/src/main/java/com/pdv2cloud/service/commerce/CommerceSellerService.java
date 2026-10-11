package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.commerce.SellerAccessService.Seller;
import java.time.LocalDate;
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
 * O que o vendedor administra sobre si: dados de venda, acordos de
 * distribuição (só indústria), contas diretas e a lista de clientes.
 */
@Service
public class CommerceSellerService {

    /** Versão do termo em que a indústria responde pelos acordos que declara. */
    public static final String DISTRIBUTION_TERMS = "2026-10";

    private final NamedParameterJdbcTemplate jdbc;

    public CommerceSellerService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> profile(UUID sellerId) {
        Map<String, Object> s = Sql.plain(jdbc.queryForMap("select id, kind, cnpj, legal_name, trade_name, coalesce(trade_name, legal_name) as name, "
            + "status, status_reason, industry_id, sales_mode, service_ufs, service_cities, min_order_cents, payment_terms, delivery_terms, "
            + "contact_name, contact_email, contact_phone, monthly_fee_cents, order_fee_pct, attested_at, attested_by "
            + "from commerce_sellers where id = :id", Map.of("id", sellerId)));
        s.put("termsVersion", DISTRIBUTION_TERMS);
        return s;
    }

    @Transactional
    public Map<String, Object> updateProfile(Seller seller, Map<String, Object> b) {
        int min = Sql.intOf(b.get("minOrderCents"), 0);
        if (min < 0) {
            throw new IllegalArgumentException("O pedido mínimo não pode ser negativo.");
        }
        jdbc.update("update commerce_sellers set service_ufs = cast(:ufs as text[]), service_cities = cast(:cities as text[]), "
            + "min_order_cents = :min, payment_terms = :pay, delivery_terms = :del, contact_name = :cn, contact_email = :ce, "
            + "contact_phone = :cp, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("id", seller.id()).addValue("ufs", Sql.pgArray(Sql.ufs(b.get("serviceUfs"))))
                .addValue("cities", Sql.pgArray(Sql.cities(b.get("serviceCities")))).addValue("min", min)
                .addValue("pay", Sql.text(b.get("paymentTerms"), 300)).addValue("del", Sql.text(b.get("deliveryTerms"), 300))
                .addValue("cn", Sql.text(b.get("contactName"), 120)).addValue("ce", Sql.text(b.get("contactEmail"), 160))
                .addValue("cp", Sql.text(b.get("contactPhone"), 30)));
        event(seller.id(), seller.userEmail(), "EDITOU_PERFIL", Map.of());
        return profile(seller.id());
    }

    // ── Distribuição (só indústria) ───────────────────────────────────────

    public Map<String, Object> distribution(Seller seller) {
        requireIndustry(seller);
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> p = profile(seller.id());
        out.put("salesMode", p.get("sales_mode"));
        out.put("attestedAt", p.get("attested_at"));
        out.put("attestedBy", p.get("attested_by"));
        out.put("termsVersion", DISTRIBUTION_TERMS);
        out.put("agreements", Sql.plain(jdbc.queryForList("select a.*, d.status as distributor_status from commerce_distribution_agreements a "
            + "left join commerce_sellers d on d.id = a.distributor_seller_id where a.industry_seller_id = :s "
            + "order by a.status, a.distributor_name", Map.of("s", seller.id()))));
        out.put("directAccounts", jdbc.queryForList("select id, cnpj, label, created_at from commerce_direct_accounts "
            + "where industry_seller_id = :s order by label, cnpj", Map.of("s", seller.id())));
        return out;
    }

    /**
     * Forma de venda da indústria. Mudar a forma, ou declarar acordos, exige o
     * aceite do termo: é a indústria que responde por respeitar os contratos
     * com os seus distribuidores.
     */
    @Transactional
    public Map<String, Object> setSalesMode(Seller seller, String mode, boolean acceptTerms) {
        requireIndustry(seller);
        if (!List.of("DIRETO", "DISTRIBUIDOR", "MISTO").contains(mode)) {
            throw new IllegalArgumentException("Forma de venda inválida.");
        }
        if (!acceptTerms) {
            throw new IllegalArgumentException("Confirme o termo de responsabilidade sobre os acordos de distribuição.");
        }
        jdbc.update("update commerce_sellers set sales_mode = :m, attested_at = now(), attested_by = :a, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("m", mode).addValue("a", seller.userEmail()).addValue("id", seller.id()));
        event(seller.id(), seller.userEmail(), "FORMA_DE_VENDA", Map.of("forma", mode, "termo", DISTRIBUTION_TERMS));
        return distribution(seller);
    }

    @Transactional
    public Map<String, Object> saveAgreement(Seller seller, UUID id, Map<String, Object> b) {
        requireIndustry(seller);
        requireAttested(seller);
        String cnpj = Sql.cnpj(b.get("distributorCnpj"));
        if (cnpj.equals(seller.cnpj())) {
            throw new IllegalArgumentException("O distribuidor não pode ser a própria indústria.");
        }
        String name = Sql.text(b.get("distributorName"), 160);
        if (name == null) {
            throw new IllegalArgumentException("Informe o nome do distribuidor.");
        }
        String exclusivity = "NAO_EXCLUSIVO".equals(b.get("exclusivity")) ? "NAO_EXCLUSIVO" : "EXCLUSIVO";
        List<String> ufs = Sql.ufs(b.get("scopeUfs"));
        List<String> cities = Sql.cities(b.get("scopeCities"));
        LocalDate start = Sql.date(b.get("startsOn"), LocalDate.now());
        LocalDate end = Sql.date(b.get("endsOn"), null);
        if (end != null && end.isBefore(start)) {
            throw new IllegalArgumentException("O fim do acordo vem depois do início.");
        }
        List<String> gtins = Sql.strings(b.get("scopeGtins")).stream().map(Sql::gtin).distinct().toList();
        List<String> brands = Sql.strings(b.get("scopeBrands")).stream().map(s -> s.toUpperCase(Locale.ROOT)).distinct().toList();
        // Distribuidor que já vende na plataforma é ligado pelo CNPJ.
        List<UUID> linked = jdbc.queryForList("select id from commerce_sellers where cnpj = :c", Map.of("c", cnpj), UUID.class);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("s", seller.id()).addValue("d", linked.isEmpty() ? null : linked.get(0))
            .addValue("cnpj", cnpj).addValue("name", name).addValue("ex", exclusivity)
            .addValue("block", "EXCLUSIVO".equals(exclusivity) && Boolean.TRUE.equals(b.get("blockOtherSellers")))
            .addValue("ufs", Sql.pgArray(ufs)).addValue("cities", Sql.pgArray(cities))
            .addValue("brands", Sql.pgArray(brands)).addValue("gtins", Sql.pgArray(gtins))
            .addValue("start", java.sql.Date.valueOf(start)).addValue("end", end == null ? null : java.sql.Date.valueOf(end))
            .addValue("cn", Sql.text(b.get("contactName"), 120)).addValue("ce", Sql.text(b.get("contactEmail"), 160))
            .addValue("cp", Sql.text(b.get("contactPhone"), 30)).addValue("notes", Sql.text(b.get("notes"), 1000))
            .addValue("a", seller.userEmail());
        if (id == null) {
            jdbc.update("insert into commerce_distribution_agreements (industry_seller_id, distributor_seller_id, distributor_cnpj, "
                + "distributor_name, exclusivity, block_other_sellers, scope_ufs, scope_cities, scope_brands, scope_gtins, starts_on, ends_on, "
                + "contact_name, contact_email, contact_phone, notes, created_by) values (:s, :d, :cnpj, :name, :ex, :block, "
                + "cast(:ufs as text[]), cast(:cities as text[]), cast(:brands as text[]), cast(:gtins as text[]), :start, :end, :cn, :ce, :cp, "
                + ":notes, :a)", p);
            event(seller.id(), seller.userEmail(), "CRIOU_ACORDO", Map.of("distribuidor", cnpj, "exclusividade", exclusivity));
        } else {
            int n = jdbc.update("update commerce_distribution_agreements set distributor_seller_id = :d, distributor_cnpj = :cnpj, "
                + "distributor_name = :name, exclusivity = :ex, block_other_sellers = :block, scope_ufs = cast(:ufs as text[]), "
                + "scope_cities = cast(:cities as text[]), scope_brands = cast(:brands as text[]), scope_gtins = cast(:gtins as text[]), "
                + "starts_on = :start, ends_on = :end, contact_name = :cn, contact_email = :ce, contact_phone = :cp, notes = :notes, "
                + "updated_at = now() where id = :id and industry_seller_id = :s and status = 'ATIVO'", p.addValue("id", id));
            if (n == 0) {
                throw new IllegalArgumentException("Acordo não encontrado ou já encerrado.");
            }
            event(seller.id(), seller.userEmail(), "EDITOU_ACORDO", Map.of("acordo", id.toString()));
        }
        return distribution(seller);
    }

    @Transactional
    public Map<String, Object> endAgreement(Seller seller, UUID id) {
        requireIndustry(seller);
        int n = jdbc.update("update commerce_distribution_agreements set status = 'ENCERRADO', ends_on = least(coalesce(ends_on, current_date), "
            + "current_date), updated_at = now() where id = :id and industry_seller_id = :s and status = 'ATIVO'",
            new MapSqlParameterSource().addValue("id", id).addValue("s", seller.id()));
        if (n == 0) {
            throw new IllegalArgumentException("Acordo não encontrado ou já encerrado.");
        }
        event(seller.id(), seller.userEmail(), "ENCERROU_ACORDO", Map.of("acordo", id.toString()));
        return distribution(seller);
    }

    @Transactional
    public Map<String, Object> addDirectAccount(Seller seller, Map<String, Object> b) {
        requireIndustry(seller);
        requireAttested(seller);
        String cnpj = Sql.cnpj(b.get("cnpj"));
        try {
            jdbc.update("insert into commerce_direct_accounts (industry_seller_id, cnpj, label, created_by) values (:s, :c, :l, :a)",
                new MapSqlParameterSource().addValue("s", seller.id()).addValue("c", cnpj).addValue("l", Sql.text(b.get("label"), 160))
                    .addValue("a", seller.userEmail()));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Este CNPJ já está nas contas diretas.");
        }
        event(seller.id(), seller.userEmail(), "CRIOU_CONTA_DIRETA", Map.of("cnpj", cnpj));
        return distribution(seller);
    }

    @Transactional
    public Map<String, Object> removeDirectAccount(Seller seller, UUID id) {
        requireIndustry(seller);
        jdbc.update("delete from commerce_direct_accounts where id = :id and industry_seller_id = :s",
            new MapSqlParameterSource().addValue("id", id).addValue("s", seller.id()));
        event(seller.id(), seller.userEmail(), "REMOVEU_CONTA_DIRETA", Map.of("conta", id.toString()));
        return distribution(seller);
    }

    private static void requireIndustry(Seller seller) {
        if (!seller.industry()) {
            throw new IllegalArgumentException("Só a indústria declara acordos de distribuição.");
        }
    }

    private void requireAttested(Seller seller) {
        Object at = jdbc.queryForMap("select attested_at from commerce_sellers where id = :id", Map.of("id", seller.id())).get("attested_at");
        if (at == null) {
            throw new IllegalArgumentException("Antes, escolha a forma de venda e confirme o termo de responsabilidade.");
        }
    }

    // ── Clientes ──────────────────────────────────────────────────────────

    /**
     * Lojas que o vendedor conhece pelo nome: as que o autorizaram e as que já
     * compraram dele ou de uma campanha dele. Nenhuma outra loja aparece aqui.
     */
    public List<Map<String, Object>> clients(UUID sellerId) {
        return jdbc.queryForList("select m.id, m.name, l.city, l.uf, coalesce(c.status = 'AUTORIZADA', false) as authorized, "
            + "o.orders, o.last_order_at, o.total_cents from markets m "
            + "left join market_locations l on l.market_id = m.id "
            + "left join market_seller_consents c on c.market_id = m.id and c.seller_id = :s "
            + "left join (select market_id, count(*) as orders, max(created_at) as last_order_at, "
            + "  sum(total_cents) filter (where status not in ('RECUSADO', 'CANCELADO')) as total_cents from commerce_orders "
            + "  where seller_id = :s or campaign_seller_id = :s group by market_id) o on o.market_id = m.id "
            + "where (c.status = 'AUTORIZADA' or o.orders > 0) and coalesce(c.status, '') <> 'BLOQUEADA' "
            + "order by o.last_order_at desc nulls last, m.name", Map.of("s", sellerId));
    }

    /** Números da tela inicial do portal de vendas. */
    public Map<String, Object> dashboard(UUID sellerId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", jdbc.queryForList("select status, count(*) as n, coalesce(sum(total_cents), 0) as cents from commerce_orders "
            + "where seller_id = :s group by status", Map.of("s", sellerId)));
        out.put("products", jdbc.queryForList("select status, count(*) as n from commerce_seller_products where seller_id = :s group by status",
            Map.of("s", sellerId)));
        out.put("activeCampaigns", jdbc.queryForObject("select count(*) from commerce_campaigns where seller_id = :s and status = 'ENVIADA' "
            + "and valid_until >= current_date", Map.of("s", sellerId), Integer.class));
        out.put("clients", clients(sellerId).size());
        out.put("last30Cents", jdbc.queryForObject("select coalesce(sum(total_cents), 0) from commerce_orders where seller_id = :s "
            + "and status in ('CONFIRMADO', 'FATURADO', 'ENTREGUE') and created_at >= now() - interval '30 days'", Map.of("s", sellerId), Long.class));
        return out;
    }

    public void event(UUID sellerId, String actor, String action, Map<String, ?> detail) {
        jdbc.update("insert into commerce_events (seller_id, actor, action, detail) values (:s, :a, :ac, cast(:d as jsonb))",
            new MapSqlParameterSource().addValue("s", sellerId).addValue("a", actor).addValue("ac", action).addValue("d", Sql.toJson(detail)));
    }
}
