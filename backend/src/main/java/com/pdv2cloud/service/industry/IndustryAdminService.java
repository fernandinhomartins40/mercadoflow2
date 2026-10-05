package com.pdv2cloud.service.industry;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Superadmin da indústria: empresas, acessos, carteira de produtos e contratos.
 *
 * A carteira é a trava contra ver o concorrente: cada GTIN pedido recebe uma
 * pré-classificação (verde: prefixo GS1 da própria empresa; amarelo: só a
 * marca confere; vermelho: prefixo de outra empresa, GTIN já de outra
 * indústria, ou nada confere) e só é aprovado com a evidência que a cor exige.
 */
@Service
public class IndustryAdminService {

    public static final List<String> FEATURES = List.of("SELLOUT", "PRECO", "RUPTURA", "PROMO", "SELLIN", "HORA", "CATEGORIA", "EXPORTACAO");

    private final NamedParameterJdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final ObjectMapper json = new ObjectMapper();

    public IndustryAdminService(NamedParameterJdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    // ── Empresas ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> list() {
        return jdbc.queryForList("select i.id, i.cnpj, i.legal_name, i.trade_name, i.status, i.created_at, "
            + "(select count(*) from industry_portfolio p where p.industry_id = i.id and p.status = 'APROVADO') as approved, "
            + "(select count(*) from industry_portfolio p where p.industry_id = i.id and p.status = 'PEDIDO') as pending, "
            + "(select c.status from industry_contracts c where c.industry_id = i.id order by (c.status in ('ATIVO','SUSPENSO')) desc, "
            + "  c.created_at desc limit 1) as contract_status, "
            + "(select c.plan from industry_contracts c where c.industry_id = i.id and c.status in ('ATIVO','SUSPENSO') limit 1) as plan, "
            + "(select max(at) from industry_access_log l where l.industry_id = i.id and not l.preview) as last_access, "
            + "(select count(*) from users u where u.industry_id = i.id) as users "
            + "from industries i order by i.status = 'EM_ANALISE' desc, coalesce(i.trade_name, i.legal_name)", Map.of());
    }

    public Map<String, Object> get(UUID id) {
        Map<String, Object> out = plain(one("select * from industries where id = :id", id));
        out.put("users", jdbc.queryForList("select id, email, name, is_active, last_login_at, created_at from users "
            + "where industry_id = :id order by created_at", Map.of("id", id)));
        out.put("contracts", plain(jdbc.queryForList("select * from industry_contracts where industry_id = :id order by created_at desc", Map.of("id", id))));
        out.put("events", jdbc.queryForList("select actor, action, detail::text as detail, at from industry_admin_events "
            + "where industry_id = :id order by at desc limit 50", Map.of("id", id)));
        out.put("portfolioSummary", jdbc.queryForList("select status, classification, count(*) as n from industry_portfolio "
            + "where industry_id = :id group by 1, 2 order by 1, 2", Map.of("id", id)));
        return out;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> b, String actor) {
        String cnpj = digits(b.get("cnpj"));
        if (cnpj.length() != 14) {
            throw new IllegalArgumentException("Informe o CNPJ da indústria com 14 dígitos.");
        }
        String legal = text(b.get("legalName"), 160);
        if (legal == null) {
            throw new IllegalArgumentException("Informe a razão social.");
        }
        UUID id;
        try {
            id = jdbc.queryForObject("insert into industries (cnpj, legal_name, trade_name, gs1_prefixes, brands, contact_name, "
                + "contact_email, contact_phone, notes) values (:cnpj, :legal, :trade, cast(:prefixes as text[]), cast(:brands as text[]), "
                + ":cn, :ce, :cp, :notes) returning id", params(b).addValue("cnpj", cnpj).addValue("legal", legal), UUID.class);
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Já existe uma indústria com este CNPJ.");
        }
        event(id, actor, "CRIOU_EMPRESA", Map.of("cnpj", cnpj));
        return get(id);
    }

    @Transactional
    public Map<String, Object> update(UUID id, Map<String, Object> b, String actor) {
        Map<String, Object> cur = one("select * from industries where id = :id", id);
        MapSqlParameterSource p = params(b).addValue("id", id)
            .addValue("legal", b.containsKey("legalName") ? text(b.get("legalName"), 160) : cur.get("legal_name"));
        if (p.getValue("legal") == null) {
            throw new IllegalArgumentException("Informe a razão social.");
        }
        jdbc.update("update industries set legal_name = :legal, trade_name = :trade, gs1_prefixes = cast(:prefixes as text[]), "
            + "brands = cast(:brands as text[]), contact_name = :cn, contact_email = :ce, contact_phone = :cp, notes = :notes, "
            + "updated_at = now() where id = :id", p);
        event(id, actor, "EDITOU_EMPRESA", Map.of());
        return get(id);
    }

    /**
     * ATIVA, SUSPENSA (corta o acesso na hora) ou ENCERRADA. Suspender e
     * encerrar pedem o motivo, que a indústria vê ao entrar.
     */
    @Transactional
    public Map<String, Object> setStatus(UUID id, String status, String reason, String actor) {
        if (!List.of("ATIVA", "SUSPENSA", "ENCERRADA", "EM_ANALISE").contains(status)) {
            throw new IllegalArgumentException("Situação inválida.");
        }
        if (!"ATIVA".equals(status) && !"EM_ANALISE".equals(status) && (reason == null || reason.isBlank())) {
            throw new IllegalArgumentException("Escreva o motivo.");
        }
        one("select id from industries where id = :id", id);
        jdbc.update("update industries set status = :s, status_reason = :r, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("s", status).addValue("r", text(reason, 300)).addValue("id", id));
        event(id, actor, "SITUACAO_" + status, Map.of("motivo", reason == null ? "" : reason));
        return get(id);
    }

    // ── Acessos ───────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> createUser(UUID industryId, Map<String, Object> b, String actor) {
        one("select id from industries where id = :id", industryId);
        String email = text(b.get("email"), 160);
        String name = text(b.get("name"), 120);
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
        jdbc.update("insert into users (id, email, password, name, role, industry_id, is_active, created_at, updated_at, totp_enabled) "
            + "values (gen_random_uuid(), lower(:e), :p, :n, 'INDUSTRY_USER', :i, true, now(), now(), false)",
            new MapSqlParameterSource().addValue("e", email).addValue("p", passwords.encode(password)).addValue("n", name).addValue("i", industryId));
        event(industryId, actor, "CRIOU_ACESSO", Map.of("email", email.toLowerCase(Locale.ROOT)));
        return get(industryId);
    }

    @Transactional
    public Map<String, Object> setUserActive(UUID industryId, UUID userId, boolean active, String actor) {
        int n = jdbc.update("update users set is_active = :a, updated_at = now() where id = :u and industry_id = :i and role = 'INDUSTRY_USER'",
            new MapSqlParameterSource().addValue("a", active).addValue("u", userId).addValue("i", industryId));
        if (n == 0) {
            throw new IllegalArgumentException("Acesso não encontrado nesta indústria.");
        }
        event(industryId, actor, active ? "LIBEROU_ACESSO" : "BLOQUEOU_ACESSO", Map.of("usuario", userId.toString()));
        return get(industryId);
    }

    // ── Carteira ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> portfolio(UUID industryId, String status) {
        return jdbc.queryForList("select p.*, (select coalesce(i.trade_name, i.legal_name) from industry_portfolio o "
            + "join industries i on i.id = o.industry_id where o.gtin = p.gtin and o.status = 'APROVADO' and o.industry_id <> p.industry_id "
            + "limit 1) as owned_by from industry_portfolio p where p.industry_id = :i and (cast(:s as varchar) is null or p.status = :s) "
            + "order by p.status = 'PEDIDO' desc, p.classification, p.product_name limit 2000",
            new MapSqlParameterSource().addValue("i", industryId).addValue("s", blank(status)));
    }

    /**
     * Pede GTINs para a carteira (pela indústria no portal ou pelo superadmin).
     * GTIN negado ou revogado volta para análise; aprovado continua aprovado.
     */
    @Transactional
    public Map<String, Object> request(UUID industryId, List<String> raw, String requestedBy) {
        Map<String, Object> ind = one("select * from industries where id = :id", industryId);
        Set<String> gtins = new LinkedHashSet<>();
        List<String> invalid = new ArrayList<>();
        for (String r : raw) {
            if (r == null || r.isBlank()) {
                continue;
            }
            String c = SellOutAggregator.canonical(r);
            if (c == null || c.replaceFirst("^0+", "").startsWith("2")) {
                invalid.add(r.trim());
            } else {
                gtins.add(c);
            }
        }
        if (gtins.size() > 2000) {
            throw new IllegalArgumentException("Envie até 2.000 códigos por vez.");
        }
        int added = 0;
        for (String g : gtins) {
            Map<String, Object> prod = productOf(g);
            String brand = prod == null ? null : (String) prod.get("brand");
            String[] cls = classify(industryId, ind, g, brand);
            int n = jdbc.update("insert into industry_portfolio (industry_id, gtin, product_name, brand, classification, classification_reason, "
                + "requested_by) values (:i, :g, :name, :brand, :c, :cr, :by) on conflict (industry_id, gtin) do update set "
                + "status = case when industry_portfolio.status = 'APROVADO' then 'APROVADO' else 'PEDIDO' end, "
                + "classification = excluded.classification, classification_reason = excluded.classification_reason, "
                + "product_name = coalesce(excluded.product_name, industry_portfolio.product_name), "
                + "brand = coalesce(excluded.brand, industry_portfolio.brand), "
                + "requested_at = case when industry_portfolio.status = 'APROVADO' then industry_portfolio.requested_at else now() end, "
                + "requested_by = case when industry_portfolio.status = 'APROVADO' then industry_portfolio.requested_by else excluded.requested_by end",
                new MapSqlParameterSource().addValue("i", industryId).addValue("g", g)
                    .addValue("name", prod == null ? null : text(prod.get("name"), 200)).addValue("brand", text(brand, 120))
                    .addValue("c", cls[0]).addValue("cr", cls[1]).addValue("by", requestedBy));
            added += n;
        }
        event(industryId, requestedBy, "PEDIU_PRODUTOS", Map.of("quantidade", gtins.size(), "invalidos", invalid.size()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("received", gtins.size());
        out.put("saved", added);
        out.put("invalid", invalid);
        return out;
    }

    /** Pede todos os GTINs do catálogo com a marca dada (até 2.000). */
    @Transactional
    public Map<String, Object> requestBrand(UUID industryId, String brand, String requestedBy) {
        String b = text(brand, 120);
        if (b == null || b.length() < 2) {
            throw new IllegalArgumentException("Informe a marca.");
        }
        List<String> eans = jdbc.queryForList("select ean from products where ean is not null and upper(trim(brand)) = upper(trim(:b)) limit 2000",
            Map.of("b", b), String.class);
        if (eans.isEmpty()) {
            throw new IllegalArgumentException("Nenhum produto do catálogo tem a marca \"" + b + "\".");
        }
        return request(industryId, eans, requestedBy);
    }

    /**
     * Decide uma lista de pedidos. Verde aprova com o prefixo como evidência;
     * amarelo exige documento ou licença; vermelho só com licença.
     */
    @Transactional
    public Map<String, Object> decide(UUID industryId, List<String> gtins, String decision, String evidenceType, String evidenceRef,
                                      String note, String actor) {
        if (!List.of("APROVADO", "NEGADO", "REVOGADO").contains(decision)) {
            throw new IllegalArgumentException("Decisão inválida.");
        }
        if (gtins == null || gtins.isEmpty()) {
            throw new IllegalArgumentException("Escolha pelo menos um produto.");
        }
        List<String> errors = new ArrayList<>();
        int done = 0;
        for (String g : gtins) {
            List<Map<String, Object>> rows = jdbc.queryForList("select * from industry_portfolio where industry_id = :i and gtin = :g",
                new MapSqlParameterSource().addValue("i", industryId).addValue("g", g));
            if (rows.isEmpty()) {
                errors.add(g + ": não está na carteira");
                continue;
            }
            Map<String, Object> r = rows.get(0);
            String cls = (String) r.get("classification");
            String status = (String) r.get("status");
            if ("APROVADO".equals(decision)) {
                String ev = evidenceType;
                if ("VERDE".equals(cls) && (ev == null || ev.isBlank())) {
                    ev = "PREFIXO_GS1";
                }
                if ("AMARELO".equals(cls) && !(("DOCUMENTO".equals(ev) || "LICENCA".equals(ev)) && !blankStr(evidenceRef))) {
                    errors.add(g + ": produto amarelo precisa de documento ou licença com a referência");
                    continue;
                }
                if ("VERMELHO".equals(cls) && !("LICENCA".equals(ev) && !blankStr(evidenceRef))) {
                    errors.add(g + ": produto vermelho só com licença do titular e a referência do documento");
                    continue;
                }
                if (!contractRoom(industryId)) {
                    errors.add(g + ": o contrato vigente já está no limite de produtos");
                    continue;
                }
                // Checa antes: a violação do índice único abortaria a transação inteira.
                Integer taken = jdbc.queryForObject("select count(*) from industry_portfolio where gtin = :g and status = 'APROVADO' "
                    + "and industry_id <> :i", new MapSqlParameterSource().addValue("g", g).addValue("i", industryId), Integer.class);
                if (taken != null && taken > 0) {
                    errors.add(g + ": já é de outra indústria");
                    continue;
                }
                try {
                    jdbc.update("update industry_portfolio set status = 'APROVADO', evidence_type = :ev, evidence_ref = :ref, decided_at = now(), "
                        + "decided_by = :a, decision_note = :n, approved_at = now(), revoked_at = null where id = :id",
                        new MapSqlParameterSource().addValue("ev", ev).addValue("ref", text(evidenceRef, 300)).addValue("a", actor)
                            .addValue("n", text(note, 300)).addValue("id", r.get("id")));
                } catch (DuplicateKeyException e) {
                    errors.add(g + ": já é de outra indústria");
                    continue;
                }
            } else if ("REVOGADO".equals(decision)) {
                if (!"APROVADO".equals(status)) {
                    errors.add(g + ": só se revoga produto aprovado");
                    continue;
                }
                jdbc.update("update industry_portfolio set status = 'REVOGADO', decided_at = now(), decided_by = :a, decision_note = :n, "
                    + "revoked_at = now() where id = :id",
                    new MapSqlParameterSource().addValue("a", actor).addValue("n", text(note, 300)).addValue("id", r.get("id")));
            } else {
                if ("APROVADO".equals(status)) {
                    errors.add(g + ": aprovado se revoga, não se nega");
                    continue;
                }
                jdbc.update("update industry_portfolio set status = 'NEGADO', decided_at = now(), decided_by = :a, decision_note = :n where id = :id",
                    new MapSqlParameterSource().addValue("a", actor).addValue("n", text(note, 300)).addValue("id", r.get("id")));
            }
            done++;
        }
        event(industryId, actor, "CARTEIRA_" + decision, Map.of("quantidade", done, "recusados", errors.size()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("done", done);
        out.put("errors", errors);
        return out;
    }

    /** Cabe mais um produto aprovado? Sem contrato vigente, a carteira pode crescer (a cobrança só vale com contrato). */
    private boolean contractRoom(UUID industryId) {
        List<Integer> limit = jdbc.queryForList("select gtin_limit from industry_contracts where industry_id = :i and status in ('ATIVO','SUSPENSO')",
            Map.of("i", industryId), Integer.class);
        if (limit.isEmpty()) {
            return true;
        }
        Integer approved = jdbc.queryForObject("select count(*) from industry_portfolio where industry_id = :i and status = 'APROVADO'",
            Map.of("i", industryId), Integer.class);
        return approved == null || approved < limit.get(0);
    }

    /** {cor, motivo}. */
    String[] classify(UUID industryId, Map<String, Object> industry, String gtin, String brand) {
        List<String> owner = jdbc.queryForList("select coalesce(i.trade_name, i.legal_name) from industry_portfolio p join industries i "
            + "on i.id = p.industry_id where p.gtin = :g and p.status = 'APROVADO' and p.industry_id <> :i",
            new MapSqlParameterSource().addValue("g", gtin).addValue("i", industryId), String.class);
        if (!owner.isEmpty()) {
            return new String[] {"VERMELHO", "Já aprovado para outra indústria (" + owner.get(0) + ")"};
        }
        String body = gtin.length() == 14 ? gtin.substring(1) : gtin;
        String own = longestPrefix(body, IndustryAccessService.array(industry.get("gs1_prefixes")));
        String other = null;
        String otherName = null;
        for (Map<String, Object> o : jdbc.queryForList("select coalesce(trade_name, legal_name) as name, gs1_prefixes from industries "
            + "where id <> :i and cardinality(gs1_prefixes) > 0", Map.of("i", industryId))) {
            String p = longestPrefix(body, IndustryAccessService.array(o.get("gs1_prefixes")));
            if (p != null && (other == null || p.length() > other.length())) {
                other = p;
                otherName = (String) o.get("name");
            }
        }
        if (other != null && (own == null || other.length() > own.length())) {
            return new String[] {"VERMELHO", "Prefixo GS1 de outra empresa cadastrada (" + otherName + ")"};
        }
        if (own != null) {
            return new String[] {"VERDE", "Prefixo GS1 " + own + " é da empresa"};
        }
        List<String> brands = IndustryAccessService.array(industry.get("brands"));
        if (brand != null && brands.stream().anyMatch(x -> x.equalsIgnoreCase(brand.trim()))) {
            return new String[] {"AMARELO", "A marca confere, mas o prefixo GS1 não"};
        }
        return new String[] {"VERMELHO", "Nem o prefixo GS1 nem a marca são da empresa"};
    }

    static String longestPrefix(String gtin, List<String> prefixes) {
        String best = null;
        for (String p : prefixes) {
            String d = p.replaceAll("\\D", "");
            if (!d.isEmpty() && gtin.startsWith(d) && (best == null || d.length() > best.length())) {
                best = d;
            }
        }
        return best;
    }

    private Map<String, Object> productOf(String gtin) {
        // As grafias possíveis do mesmo GTIN (8, 12, 13 e 14 dígitos), para usar o índice de ean.
        String t = gtin.replaceFirst("^0+", "");
        List<String> forms = new ArrayList<>();
        for (int len : new int[] {8, 12, 13, 14}) {
            if (t.length() <= len) {
                forms.add("0".repeat(len - t.length()) + t);
            }
        }
        List<Map<String, Object>> r = jdbc.queryForList("select name, brand from products where ean in (:f) "
            + "order by observation_count desc nulls last limit 1", Map.of("f", forms));
        return r.isEmpty() ? null : r.get(0);
    }

    // ── Contratos ─────────────────────────────────────────────────────────

    public List<Map<String, Object>> plans() {
        return plain(jdbc.queryForList("select * from industry_plans order by sort_order", Map.of()));
    }

    @Transactional
    public Map<String, Object> createContract(UUID industryId, Map<String, Object> b, String actor) {
        one("select id from industries where id = :id", industryId);
        String plan = String.valueOf(b.getOrDefault("plan", "")).toUpperCase(Locale.ROOT);
        List<Map<String, Object>> pl = jdbc.queryForList("select * from industry_plans where code = :c", Map.of("c", plan));
        if (pl.isEmpty()) {
            throw new IllegalArgumentException("Escolha o pacote.");
        }
        MapSqlParameterSource p = contractParams(b, pl.get(0));
        String number = jdbc.queryForObject("select 'IND-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('industry_contract_number_seq')::text, 4, '0')",
            Map.of(), String.class);
        UUID id = jdbc.queryForObject("insert into industry_contracts (industry_id, number, plan, features, scope_ufs, scope_cities, "
            + "allow_neighborhood, gtin_limit, base_fee_cents, price_per_gtin_cents, discount_pct, billing_day, starts_on, ends_on, "
            + "signed_document_ref, notes, created_by) values (:i, :number, :plan, cast(:features as text[]), cast(:ufs as text[]), "
            + "cast(:cities as text[]), :nb, :limit, :base, :per, :disc, :bday, :start, :end, :doc, :notes, :a) returning id",
            p.addValue("i", industryId).addValue("number", number).addValue("plan", plan).addValue("a", actor), UUID.class);
        event(industryId, actor, "CRIOU_CONTRATO", Map.of("numero", number, "pacote", plan));
        return contract(id);
    }

    @Transactional
    public Map<String, Object> updateContract(UUID contractId, Map<String, Object> b, String actor) {
        Map<String, Object> c = contract(contractId);
        if (!"RASCUNHO".equals(c.get("status"))) {
            throw new IllegalArgumentException("Só contrato em rascunho pode ser editado. Encerre e crie outro para mudar as condições.");
        }
        Map<String, Object> pl = jdbc.queryForMap("select * from industry_plans where code = :c", Map.of("c", c.get("plan")));
        MapSqlParameterSource p = contractParams(b, pl).addValue("id", contractId);
        jdbc.update("update industry_contracts set features = cast(:features as text[]), scope_ufs = cast(:ufs as text[]), "
            + "scope_cities = cast(:cities as text[]), allow_neighborhood = :nb, gtin_limit = :limit, base_fee_cents = :base, "
            + "price_per_gtin_cents = :per, discount_pct = :disc, billing_day = :bday, starts_on = :start, ends_on = :end, "
            + "signed_document_ref = :doc, notes = :notes, preview_approved_at = null, preview_approved_by = null, updated_at = now() "
            + "where id = :id", p);
        event((UUID) c.get("industry_id"), actor, "EDITOU_CONTRATO", Map.of("numero", c.get("number")));
        return contract(contractId);
    }

    private MapSqlParameterSource contractParams(Map<String, Object> b, Map<String, Object> plan) {
        List<String> features = strings(b.get("features"));
        if (features.isEmpty()) {
            features = IndustryAccessService.array(plan.get("features"));
        }
        for (String f : features) {
            if (!FEATURES.contains(f)) {
                throw new IllegalArgumentException("Recurso desconhecido: " + f);
            }
        }
        if (!features.contains("SELLOUT")) {
            features = new ArrayList<>(features);
            features.add(0, "SELLOUT");
        }
        List<String> ufs = strings(b.get("scopeUfs")).stream().map(s -> s.toUpperCase(Locale.ROOT)).toList();
        List<String> cities = strings(b.get("scopeCities")).stream().map(s -> s.replaceAll("\\D", "")).filter(s -> s.length() == 7).toList();
        for (String uf : ufs) {
            if (!uf.matches("[A-Z]{2}")) {
                throw new IllegalArgumentException("UF inválida: " + uf);
            }
        }
        Integer maxUfs = (Integer) plan.get("max_ufs");
        Integer maxCities = (Integer) plan.get("max_cities");
        if (maxUfs != null && ufs.size() > maxUfs) {
            throw new IllegalArgumentException(maxUfs == 0 ? "O pacote " + plan.get("name") + " é por cidade: escolha as cidades, não UFs."
                : "O pacote " + plan.get("name") + " vai até " + maxUfs + " UFs.");
        }
        if (maxCities != null && cities.size() > maxCities) {
            throw new IllegalArgumentException("O pacote " + plan.get("name") + " vai até " + maxCities + " cidades.");
        }
        if ((maxUfs != null || maxCities != null) && ufs.isEmpty() && cities.isEmpty()) {
            throw new IllegalArgumentException("Escolha a área do contrato: o pacote " + plan.get("name") + " não é nacional.");
        }
        int limit = intOf(b.get("gtinLimit"), 0);
        if (limit < 1 || limit > 20000) {
            throw new IllegalArgumentException("Informe quantos produtos o contrato cobre (1 a 20.000).");
        }
        LocalDate start = dateOf(b.get("startsOn"), LocalDate.now());
        LocalDate end = dateOf(b.get("endsOn"), start.plusYears(1).minusDays(1));
        if (end.isBefore(start)) {
            throw new IllegalArgumentException("O fim do contrato vem depois do início.");
        }
        int bday = intOf(b.get("billingDay"), 10);
        if (bday < 1 || bday > 28) {
            throw new IllegalArgumentException("O dia de vencimento vai de 1 a 28.");
        }
        double disc = b.get("discountPct") == null ? 0 : Double.parseDouble(String.valueOf(b.get("discountPct")).replace(',', '.'));
        if (disc < 0 || disc > 60) {
            throw new IllegalArgumentException("O desconto vai de 0% a 60%.");
        }
        return new MapSqlParameterSource().addValue("features", pgArray(features)).addValue("ufs", pgArray(ufs))
            .addValue("cities", pgArray(cities)).addValue("nb", !Boolean.FALSE.equals(b.get("allowNeighborhood")))
            .addValue("limit", limit)
            .addValue("base", intOf(b.get("baseFeeCents"), (Integer) plan.get("base_fee_cents")))
            .addValue("per", intOf(b.get("pricePerGtinCents"), (Integer) plan.get("price_per_gtin_cents")))
            .addValue("disc", disc).addValue("bday", bday)
            .addValue("start", Date.valueOf(start)).addValue("end", Date.valueOf(end))
            .addValue("doc", text(b.get("signedDocumentRef"), 300)).addValue("notes", text(b.get("notes"), 2000));
    }

    public Map<String, Object> contract(UUID id) {
        return plain(one("select c.*, coalesce(i.trade_name, i.legal_name) as industry_name, i.status as industry_status, "
            + "(select count(*) from industry_portfolio p where p.industry_id = c.industry_id and p.status = 'APROVADO') as approved_gtins "
            + "from industry_contracts c join industries i on i.id = c.industry_id where c.id = :id", id));
    }

    /** O superadmin viu a prévia e confirma que é isso que a indústria pode ver. */
    @Transactional
    public Map<String, Object> approvePreview(UUID contractId, String actor) {
        Map<String, Object> c = contract(contractId);
        jdbc.update("update industry_contracts set preview_approved_at = now(), preview_approved_by = :a, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("a", actor).addValue("id", contractId));
        event((UUID) c.get("industry_id"), actor, "APROVOU_PREVIA", Map.of("numero", c.get("number")));
        return contract(contractId);
    }

    @Transactional
    public Map<String, Object> activate(UUID contractId, String actor) {
        Map<String, Object> c = contract(contractId);
        if (!"RASCUNHO".equals(c.get("status")) && !"SUSPENSO".equals(c.get("status"))) {
            throw new IllegalArgumentException("Este contrato não pode ser ativado.");
        }
        if (!"ATIVA".equals(c.get("industry_status"))) {
            throw new IllegalArgumentException("Aprove o cadastro da empresa antes de ativar o contrato.");
        }
        if (c.get("preview_approved_at") == null) {
            throw new IllegalArgumentException("Veja e aprove a prévia do que a indústria vai ver antes de ativar.");
        }
        if (blankStr((String) c.get("signed_document_ref"))) {
            throw new IllegalArgumentException("Registre a referência do contrato assinado antes de ativar.");
        }
        if (((Number) c.get("approved_gtins")).intValue() > ((Number) c.get("gtin_limit")).intValue()) {
            throw new IllegalArgumentException("A carteira aprovada passa do limite de produtos do contrato.");
        }
        try {
            jdbc.update("update industry_contracts set status = 'ATIVO', status_reason = null, activated_at = coalesce(activated_at, now()), "
                + "updated_at = now() where id = :id", Map.of("id", contractId));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("A empresa já tem outro contrato vigente. Encerre o anterior primeiro.");
        }
        event((UUID) c.get("industry_id"), actor, "ATIVOU_CONTRATO", Map.of("numero", c.get("number")));
        return contract(contractId);
    }

    @Transactional
    public Map<String, Object> setContractStatus(UUID contractId, String status, String reason, String actor) {
        if (!List.of("SUSPENSO", "ENCERRADO").contains(status)) {
            throw new IllegalArgumentException("Situação inválida.");
        }
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Escreva o motivo.");
        }
        Map<String, Object> c = contract(contractId);
        jdbc.update("update industry_contracts set status = :s, status_reason = :r, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("s", status).addValue("r", text(reason, 300)).addValue("id", contractId));
        event((UUID) c.get("industry_id"), actor, status.equals("SUSPENSO") ? "SUSPENDEU_CONTRATO" : "ENCERROU_CONTRATO",
            Map.of("numero", c.get("number"), "motivo", reason));
        return contract(contractId);
    }

    // ── Auditoria ─────────────────────────────────────────────────────────

    /**
     * Consultas por dia com sinais de tentativa de triangular: muitas consultas
     * no bairro ou muitos recortes diferentes num dia.
     */
    public Map<String, Object> audit(UUID industryId, int maxQueriesPerDay) {
        List<Map<String, Object>> days = jdbc.queryForList("select cast(at as date) as day, count(*) as queries, "
            + "count(*) filter (where filters->>'level' = 'BAIRRO') as neighborhood_queries, count(distinct filters::text) as distinct_filters, "
            + "count(distinct user_email) as users, sum(cells_returned) as cells "
            + "from industry_access_log where industry_id = :i and not preview and at >= current_date - 30 group by 1 order by 1 desc",
            Map.of("i", industryId));
        for (Map<String, Object> d : days) {
            List<String> flags = new ArrayList<>();
            if (((Number) d.get("queries")).intValue() > 0.8 * maxQueriesPerDay) {
                flags.add("Perto do limite diário de consultas");
            }
            if (((Number) d.get("neighborhood_queries")).intValue() > 150) {
                flags.add("Muitas consultas por bairro");
            }
            if (((Number) d.get("distinct_filters")).intValue() > 300) {
                flags.add("Muitos recortes diferentes no mesmo dia");
            }
            d.put("flags", flags);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("recent", jdbc.queryForList("select at, user_email, endpoint, filters::text as filters, cells_returned, preview "
            + "from industry_access_log where industry_id = :i order by at desc limit 100", Map.of("i", industryId)));
        return out;
    }

    /** O que a regra de anonimato escondeu nos produtos desta indústria (só superadmin vê). */
    public Map<String, Object> suppressed(UUID industryId, int days) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("i", industryId).addValue("a", Date.valueOf(LocalDate.now().minusDays(days)));
        String gtins = "(select gtin from industry_portfolio where industry_id = :i and status in ('APROVADO', 'PEDIDO'))";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("byReason", jdbc.queryForList("select level, coalesce(suppress_reason, 'PUBLICADA') as reason, count(*) as cells "
            + "from mf_sellout_daily where day >= :a and gtin in " + gtins + " group by 1, 2 order by 1, 2", p));
        out.put("samples", jdbc.queryForList("select day, gtin, level, uf, city, neighborhood, suppress_reason, stores from mf_sellout_daily "
            + "where day >= :a and not published and gtin in " + gtins + " order by day desc, level limit 60", p));
        out.put("noData", jdbc.queryForList("select p.gtin, p.product_name from industry_portfolio p where p.industry_id = :i "
            + "and p.status in ('APROVADO', 'PEDIDO') and not exists (select 1 from mf_sellout_daily d where d.gtin = p.gtin "
            + "and d.day >= :a) order by p.product_name limit 100", p));
        return out;
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    /** Array do Postgres vira lista: o objeto do driver não serializa em JSON. */
    static Map<String, Object> plain(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.replaceAll((k, v) -> v instanceof java.sql.Array ? IndustryAccessService.array(v) : v);
        return out;
    }

    static List<Map<String, Object>> plain(List<Map<String, Object>> rows) {
        return rows.stream().map(IndustryAdminService::plain).toList();
    }

    public void event(UUID industryId, String actor, String action, Map<String, ?> detail) {
        String d;
        try {
            d = json.writeValueAsString(detail);
        } catch (Exception e) {
            d = "{}";
        }
        jdbc.update("insert into industry_admin_events (industry_id, actor, action, detail) values (:i, :a, :ac, cast(:d as jsonb))",
            new MapSqlParameterSource().addValue("i", industryId).addValue("a", actor).addValue("ac", action).addValue("d", d));
    }

    private Map<String, Object> one(String sql, UUID id) {
        List<Map<String, Object>> r = jdbc.queryForList(sql, Map.of("id", id));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Registro não encontrado.");
        }
        return r.get(0);
    }

    private MapSqlParameterSource params(Map<String, Object> b) {
        List<String> prefixes = strings(b.get("gs1Prefixes")).stream().map(s -> s.replaceAll("\\D", "")).filter(s -> !s.isEmpty()).toList();
        for (String p : prefixes) {
            if (p.length() < 6 || p.length() > 12) {
                throw new IllegalArgumentException("Prefixo GS1 tem de 6 a 12 dígitos: " + p);
            }
        }
        List<String> brands = strings(b.get("brands")).stream().map(s -> s.trim().toUpperCase(Locale.ROOT)).filter(s -> !s.isEmpty()).toList();
        return new MapSqlParameterSource().addValue("trade", text(b.get("tradeName"), 120))
            .addValue("prefixes", pgArray(prefixes)).addValue("brands", pgArray(brands))
            .addValue("cn", text(b.get("contactName"), 120)).addValue("ce", text(b.get("contactEmail"), 160))
            .addValue("cp", text(b.get("contactPhone"), 30)).addValue("notes", text(b.get("notes"), 4000));
    }

    /** Literal de array do Postgres ({"a","b"}), para cast(:x as text[]). */
    static String pgArray(List<String> items) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(items.get(i).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }

    public static List<String> strings(Object v) {
        if (v == null) {
            return List.of();
        }
        if (v instanceof List<?> l) {
            return l.stream().filter(x -> x != null && !String.valueOf(x).isBlank()).map(x -> String.valueOf(x).trim()).toList();
        }
        return Arrays.stream(String.valueOf(v).split("[,;\\n]")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    static String text(Object v, int max) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    static String digits(Object v) {
        return v == null ? "" : String.valueOf(v).replaceAll("\\D", "");
    }

    static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    static boolean blankStr(String v) {
        return v == null || v.isBlank();
    }

    static int intOf(Object v, int fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        try {
            return v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Número inválido: " + v);
        }
    }

    static LocalDate dateOf(Object v, LocalDate fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(String.valueOf(v).substring(0, 10));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Data inválida: " + v);
        }
    }
}
