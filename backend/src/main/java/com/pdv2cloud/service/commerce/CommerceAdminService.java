package com.pdv2cloud.service.commerce;

import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Controle do superadmin sobre as vendas: quem vende, com que taxa, quais
 * produtos são de qual indústria, e se os acordos de distribuição declarados
 * batem com o que as notas de entrada das lojas mostram.
 */
@Service
public class CommerceAdminService {

    private final NamedParameterJdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final CommerceChannelService channel;
    private final CommerceSellerService sellers;

    public CommerceAdminService(NamedParameterJdbcTemplate jdbc, PasswordEncoder passwords, CommerceChannelService channel,
                                CommerceSellerService sellers) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.channel = channel;
        this.sellers = sellers;
    }

    // ── Vendedores ────────────────────────────────────────────────────────

    public List<Map<String, Object>> list() {
        return jdbc.queryForList("select s.id, s.kind, s.cnpj, s.legal_name, s.trade_name, s.status, s.sales_mode, s.monthly_fee_cents, "
            + "s.order_fee_pct, s.industry_id, s.created_at, "
            + "(select count(*) from commerce_seller_products p where p.seller_id = s.id and p.status = 'ATIVO') as products, "
            + "(select count(*) from commerce_seller_products p where p.seller_id = s.id and p.status = 'PENDENTE') as pending_products, "
            + "(select count(*) from commerce_orders o where o.seller_id = s.id) as orders, "
            + "(select count(*) from users u where u.seller_id = s.id) as users "
            + "from commerce_sellers s order by s.status = 'EM_ANALISE' desc, coalesce(s.trade_name, s.legal_name)", Map.of());
    }

    public Map<String, Object> get(UUID id) {
        Map<String, Object> out = new LinkedHashMap<>(sellers.profile(id));
        out.put("notes", jdbc.queryForMap("select notes from commerce_sellers where id = :id", Map.of("id", id)).get("notes"));
        out.put("users", jdbc.queryForList("select id, email, name, is_active, last_login_at, created_at from users where seller_id = :id "
            + "order by created_at", Map.of("id", id)));
        out.put("agreements", Sql.plain(jdbc.queryForList("select * from commerce_distribution_agreements where industry_seller_id = :id "
            + "order by status, distributor_name", Map.of("id", id))));
        out.put("directAccounts", jdbc.queryForList("select cnpj, label from commerce_direct_accounts where industry_seller_id = :id "
            + "order by label", Map.of("id", id)));
        out.put("products", jdbc.queryForList("select id, gtin, name, brand, owner, base_price, status, status_note from commerce_seller_products "
            + "where seller_id = :id order by status = 'PENDENTE' desc, name limit 500", Map.of("id", id)));
        out.put("events", jdbc.queryForList("select actor, action, detail::text as detail, at from commerce_events where seller_id = :id "
            + "and action <> 'PREVIA_CAMPANHA' order by at desc limit 50", Map.of("id", id)));
        return out;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> b, String actor) {
        String kind = String.valueOf(b.get("kind"));
        if (!List.of("INDUSTRIA", "DISTRIBUIDOR").contains(kind)) {
            throw new IllegalArgumentException("Escolha se o vendedor é indústria ou distribuidor.");
        }
        String cnpj = Sql.cnpj(b.get("cnpj"));
        String legal = Sql.text(b.get("legalName"), 160);
        if (legal == null) {
            throw new IllegalArgumentException("Informe a razão social.");
        }
        UUID industryId = b.get("industryId") == null || String.valueOf(b.get("industryId")).isBlank() ? null : Sql.uuid(b.get("industryId"));
        if (industryId != null && !"INDUSTRIA".equals(kind)) {
            throw new IllegalArgumentException("Só uma indústria pode ser ligada ao portal de dados.");
        }
        if (industryId == null && "INDUSTRIA".equals(kind)) {
            // Indústria que já tem o portal de dados: liga pelo CNPJ, e os acessos dela entram nas vendas.
            List<UUID> same = jdbc.queryForList("select id from industries where cnpj = :c", Map.of("c", cnpj), UUID.class);
            industryId = same.isEmpty() ? null : same.get(0);
        }
        UUID id;
        try {
            id = jdbc.queryForObject("insert into commerce_sellers (kind, cnpj, legal_name, trade_name, industry_id, contact_name, contact_email, "
                + "contact_phone, notes, monthly_fee_cents, order_fee_pct) values (:k, :c, :l, :t, :i, :cn, :ce, :cp, :notes, :fee, :pct) "
                + "returning id", params(b).addValue("k", kind).addValue("c", cnpj).addValue("l", legal).addValue("i", industryId), UUID.class);
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Já existe um vendedor com este CNPJ, ou esta indústria já tem vendedor.");
        }
        // Acordos que já citavam este CNPJ passam a apontar para o vendedor.
        jdbc.update("update commerce_distribution_agreements set distributor_seller_id = :id where distributor_cnpj = :c "
            + "and distributor_seller_id is null", new MapSqlParameterSource().addValue("id", id).addValue("c", cnpj));
        sellers.event(id, actor, "CRIOU_VENDEDOR", Map.of("cnpj", cnpj, "tipo", kind));
        return get(id);
    }

    @Transactional
    public Map<String, Object> update(UUID id, Map<String, Object> b, String actor) {
        String legal = Sql.text(b.get("legalName"), 160);
        if (legal == null) {
            throw new IllegalArgumentException("Informe a razão social.");
        }
        int n = jdbc.update("update commerce_sellers set legal_name = :l, trade_name = :t, contact_name = :cn, contact_email = :ce, "
            + "contact_phone = :cp, notes = :notes, monthly_fee_cents = :fee, order_fee_pct = :pct, updated_at = now() where id = :id",
            params(b).addValue("l", legal).addValue("id", id));
        if (n == 0) {
            throw new IllegalArgumentException("Vendedor não encontrado.");
        }
        sellers.event(id, actor, "EDITOU_VENDEDOR", Map.of());
        return get(id);
    }

    private static MapSqlParameterSource params(Map<String, Object> b) {
        int fee = Sql.intOf(b.get("monthlyFeeCents"), 0);
        BigDecimal pct = b.get("orderFeePct") == null || String.valueOf(b.get("orderFeePct")).isBlank() ? BigDecimal.ZERO
            : new BigDecimal(String.valueOf(b.get("orderFeePct")).replace(',', '.'));
        if (fee < 0 || pct.signum() < 0 || pct.compareTo(BigDecimal.valueOf(30)) > 0) {
            throw new IllegalArgumentException("A mensalidade não pode ser negativa e a taxa por pedido vai de 0% a 30%.");
        }
        return new MapSqlParameterSource().addValue("t", Sql.text(b.get("tradeName"), 120)).addValue("cn", Sql.text(b.get("contactName"), 120))
            .addValue("ce", Sql.text(b.get("contactEmail"), 160)).addValue("cp", Sql.text(b.get("contactPhone"), 30))
            .addValue("notes", Sql.text(b.get("notes"), 4000)).addValue("fee", fee).addValue("pct", pct);
    }

    /** ATIVO libera as vendas; SUSPENSO e ENCERRADO tiram o vendedor do ar na hora e pedem o motivo. */
    @Transactional
    public Map<String, Object> setStatus(UUID id, String status, String reason, String actor) {
        if (!List.of("ATIVO", "SUSPENSO", "ENCERRADO", "EM_ANALISE").contains(status)) {
            throw new IllegalArgumentException("Situação inválida.");
        }
        if (List.of("SUSPENSO", "ENCERRADO").contains(status) && (reason == null || reason.isBlank())) {
            throw new IllegalArgumentException("Escreva o motivo.");
        }
        int n = jdbc.update("update commerce_sellers set status = :s, status_reason = :r, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("s", status).addValue("r", Sql.text(reason, 300)).addValue("id", id));
        if (n == 0) {
            throw new IllegalArgumentException("Vendedor não encontrado.");
        }
        sellers.event(id, actor, "SITUACAO_" + status, Map.of("motivo", reason == null ? "" : reason));
        return get(id);
    }

    @Transactional
    public Map<String, Object> createUser(UUID sellerId, Map<String, Object> b, String actor) {
        sellers.profile(sellerId);
        String email = Sql.text(b.get("email"), 160);
        String name = Sql.text(b.get("name"), 120);
        String password = b.get("password") == null ? "" : String.valueOf(b.get("password"));
        if (email == null || !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            throw new IllegalArgumentException("Informe um e-mail válido.");
        }
        if (name == null) {
            throw new IllegalArgumentException("Informe o nome da pessoa.");
        }
        if (password.length() < 10) {
            throw new IllegalArgumentException("A senha provisória precisa de pelo menos 10 caracteres.");
        }
        Integer exists = jdbc.queryForObject("select count(*) from users where lower(email) = lower(:e)", Map.of("e", email), Integer.class);
        if (exists != null && exists > 0) {
            throw new IllegalArgumentException("Este e-mail já tem acesso ao MercadoFlow.");
        }
        jdbc.update("insert into users (id, email, password, name, role, seller_id, is_active, created_at, updated_at, totp_enabled) "
            + "values (gen_random_uuid(), lower(:e), :p, :n, 'SELLER_USER', :s, true, now(), now(), false)",
            new MapSqlParameterSource().addValue("e", email).addValue("p", passwords.encode(password)).addValue("n", name).addValue("s", sellerId));
        sellers.event(sellerId, actor, "CRIOU_ACESSO", Map.of("email", email.toLowerCase(Locale.ROOT)));
        return get(sellerId);
    }

    @Transactional
    public Map<String, Object> setUserActive(UUID sellerId, UUID userId, boolean active, String actor) {
        int n = jdbc.update("update users set is_active = :a, updated_at = now() where id = :u and seller_id = :s and role = 'SELLER_USER'",
            new MapSqlParameterSource().addValue("a", active).addValue("u", userId).addValue("s", sellerId));
        if (n == 0) {
            throw new IllegalArgumentException("Acesso não encontrado neste vendedor.");
        }
        sellers.event(sellerId, actor, active ? "LIBEROU_ACESSO" : "BLOQUEOU_ACESSO", Map.of("usuario", userId.toString()));
        return get(sellerId);
    }

    // ── Titularidade dos produtos ─────────────────────────────────────────

    /** Produtos de indústria aguardando a conferência de que são dela. */
    public List<Map<String, Object>> pendingProducts() {
        return jdbc.queryForList("select p.id, p.gtin, p.name, p.brand, p.base_price, p.created_at, p.seller_id, "
            + "coalesce(s.trade_name, s.legal_name) as seller_name, "
            + "(select coalesce(o.trade_name, o.legal_name) from commerce_seller_products x join commerce_sellers o on o.id = x.seller_id "
            + " where x.gtin = p.gtin and x.owner and x.status in ('ATIVO', 'PAUSADO') and x.seller_id <> p.seller_id limit 1) as claimed_by "
            + "from commerce_seller_products p join commerce_sellers s on s.id = p.seller_id where p.status = 'PENDENTE' "
            + "order by p.created_at", Map.of());
    }

    @Transactional
    public void decideProduct(UUID productId, boolean approve, String note, String actor) {
        List<Map<String, Object>> r = jdbc.queryForList("select seller_id, gtin from commerce_seller_products where id = :id and status = 'PENDENTE'",
            Map.of("id", productId));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Produto não está aguardando conferência.");
        }
        if (!approve && (note == null || note.isBlank())) {
            throw new IllegalArgumentException("Escreva o motivo da recusa: a indústria vai ler.");
        }
        try {
            jdbc.update("update commerce_seller_products set status = :s, status_note = :n, updated_at = now() where id = :id",
                new MapSqlParameterSource().addValue("s", approve ? "ATIVO" : "NEGADO").addValue("n", approve ? null : Sql.text(note, 300))
                    .addValue("id", productId));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Outra indústria já tem este produto como dela. Resolva a titularidade antes.");
        }
        sellers.event((UUID) r.get(0).get("seller_id"), actor, approve ? "APROVOU_PRODUTO" : "NEGOU_PRODUTO", Map.of("gtin", r.get(0).get("gtin")));
    }

    // ── Canais ────────────────────────────────────────────────────────────

    public List<Map<String, Object>> agreements() {
        return Sql.plain(jdbc.queryForList("select a.*, coalesce(i.trade_name, i.legal_name) as industry_name, i.sales_mode, "
            + "d.status as distributor_status from commerce_distribution_agreements a join commerce_sellers i on i.id = a.industry_seller_id "
            + "left join commerce_sellers d on d.id = a.distributor_seller_id order by a.status, industry_name, a.distributor_name", Map.of()));
    }

    /**
     * Divergências entre o que a indústria declarou e o que as notas de entrada
     * (NF-e do Confere, 180 dias) mostram:
     *  - NAO_DECLARADO: lojas compram produtos da indústria de um CNPJ que não é
     *    ela nem um distribuidor declarado;
     *  - SEM_EVIDENCIA: distribuidor declarado exclusivo que não aparece em
     *    nenhuma nota desses produtos.
     */
    public List<Map<String, Object>> alerts() {
        List<Map<String, Object>> out = new ArrayList<>();
        // Notas de entrada dos produtos que têm indústria dona na plataforma.
        String items = "from nfe_document_items n join commerce_seller_products p on p.owner and p.status in ('ATIVO', 'PAUSADO') "
            + "and p.gtin = " + Sql.canon("n.gtin") + " join commerce_sellers i on i.id = p.seller_id ";
        String recent = "where n.gtin is not null and n.supplier_cnpj is not null and n.issued_at >= now() - interval '180 days' ";
        String bought = items + recent;
        for (Map<String, Object> r : jdbc.queryForList("select i.id as industry_id, coalesce(i.trade_name, i.legal_name) as industry_name, "
            + "n.supplier_cnpj, max(coalesce(s.trade_name, s.name)) as supplier_name, count(distinct n.market_id) as stores, "
            + "count(distinct p.gtin) as products, max(n.issued_at) as last_at " + items
            + "left join nfe_suppliers s on s.cnpj = n.supplier_cnpj " + recent
            + "and n.supplier_cnpj <> i.cnpj and not exists (select 1 from commerce_distribution_agreements a "
            + "where a.industry_seller_id = i.id and a.distributor_cnpj = n.supplier_cnpj and a.status = 'ATIVO') "
            + "group by i.id, 2, n.supplier_cnpj order by stores desc limit 200", Map.of())) {
            Map<String, Object> row = new LinkedHashMap<>(r);
            row.put("kind", "NAO_DECLARADO");
            out.add(row);
        }
        for (Map<String, Object> r : jdbc.queryForList("select a.id as agreement_id, i.id as industry_id, "
            + "coalesce(i.trade_name, i.legal_name) as industry_name, a.distributor_cnpj as supplier_cnpj, a.distributor_name as supplier_name, "
            + "a.starts_on from commerce_distribution_agreements a join commerce_sellers i on i.id = a.industry_seller_id "
            + "where a.status = 'ATIVO' and a.exclusivity = 'EXCLUSIVO' and a.starts_on < current_date - 60 "
            + "and exists (select 1 " + bought + "and i.id = a.industry_seller_id) "
            + "and not exists (select 1 " + bought + "and i.id = a.industry_seller_id and n.supplier_cnpj = a.distributor_cnpj)", Map.of())) {
            Map<String, Object> row = new LinkedHashMap<>(r);
            row.put("kind", "SEM_EVIDENCIA");
            out.add(row);
        }
        return out;
    }

    /** Lojas para o simulador. */
    public List<Map<String, Object>> stores() {
        return jdbc.queryForList("select m.id, m.name, l.city, l.uf from markets m left join market_locations l on l.market_id = m.id "
            + "where coalesce(m.is_active, true) order by m.name", Map.of());
    }

    /** "Por que esta loja vê ou não vê este produto": a decisão do motor para cada vendedor que tem o produto. */
    public Map<String, Object> simulate(UUID marketId, String rawGtin) {
        String gtin = Sql.gtin(rawGtin);
        Rules rules = channel.rules();
        Store store = channel.store(marketId);
        Map<UUID, String> consents = channel.consents(marketId);
        List<Map<String, Object>> decisions = new ArrayList<>();
        for (Map<String, Object> p : jdbc.queryForList("select seller_id, name, owner, status from commerce_seller_products where gtin = :g "
            + "order by owner desc", Map.of("g", gtin))) {
            SellerRow seller = rules.seller((UUID) p.get("seller_id"));
            Decision d = channel.decide(rules, seller, store, gtin, consents.get(seller.id()));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("seller", seller.name());
            row.put("kind", seller.kind());
            row.put("owner", p.get("owner"));
            row.put("productStatus", p.get("status"));
            row.put("allowed", d.allowed());
            row.put("channel", d.channel());
            row.put("distributor", d.distributorName());
            row.put("code", d.code());
            row.put("reason", d.reason());
            decisions.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("store", Map.of("name", store.name(), "located", store.located(), "city", store.city() == null ? "" : store.city(),
            "uf", store.uf() == null ? "" : store.uf(), "receiveCampaigns", store.receiveCampaigns()));
        out.put("gtin", gtin);
        out.put("decisions", decisions);
        return out;
    }

    // ── Volume ────────────────────────────────────────────────────────────

    public Map<String, Object> overview() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sellers", jdbc.queryForList("select kind, status, count(*) as n from commerce_sellers group by kind, status", Map.of()));
        out.put("orders", jdbc.queryForList("select status, count(*) as n, coalesce(sum(total_cents), 0) as cents, "
            + "coalesce(sum(fee_cents), 0) as fee_cents from commerce_orders group by status", Map.of()));
        out.put("campaigns", jdbc.queryForList("select status, count(*) as n from commerce_campaigns group by status", Map.of()));
        out.put("pendingProducts", jdbc.queryForObject("select count(*) from commerce_seller_products where status = 'PENDENTE'", Map.of(), Integer.class));
        out.put("stuckOrders", jdbc.queryForList("select o.number, o.status, o.total_cents, o.created_at, m.name as market_name, "
            + "coalesce(s.trade_name, s.legal_name) as seller_name from commerce_orders o join markets m on m.id = o.market_id "
            + "join commerce_sellers s on s.id = o.seller_id where o.status = 'ENVIADO' and o.created_at < now() - interval '2 days' "
            + "order by o.created_at limit 50", Map.of()));
        out.put("monthlyFeesCents", jdbc.queryForObject("select coalesce(sum(monthly_fee_cents), 0) from commerce_sellers where status = 'ATIVO'",
            Map.of(), Long.class));
        return out;
    }
}
