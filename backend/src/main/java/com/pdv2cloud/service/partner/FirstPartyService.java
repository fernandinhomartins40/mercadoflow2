package com.pdv2cloud.service.partner;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.service.InvoiceProcessingService;
import com.pdv2cloud.service.localprice.LocalPriceService;
import com.pdv2cloud.tenancy.TenantContext;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import java.net.URI;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O que só o parceiro da casa (Bipae) faz, sempre com a autorização da loja
 * (docs/INTEGRACAO-BIPAE.md):
 *  - vendas do caixa direto, no mesmo formato e com as mesmas regras (cota do
 *    plano, duplicidade pela chave) das notas que o agente lê;
 *  - catálogo por GTIN, para cadastrar o produto na hora em que é bipado;
 *  - a fila de decisões do Tino, os preços da região e os encartes publicados,
 *    para o sistema mostrar e aplicar sem o dono digitar duas vezes;
 *  - "Conectar ao MercadoFlow": o pedido de conexão que o dono aprova no painel.
 */
@Service
@Profile("!jobs")
public class FirstPartyService {

    public static final int MAX_SALES_BATCH = 500;
    public static final int MAX_LOOKUP = 200;
    public static final int MAX_DECISIONS = 100;
    public static final int CONNECT_DAYS = 7;
    public static final String CODE_PREFIX = "mfx_";

    private final NamedParameterJdbcTemplate jdbc;
    private final InvoiceProcessingService invoices;
    private final LocalPriceService localPrices;
    private final PartnerWebhookService webhooks;
    private final Validator validator;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final String publicBaseUrl;

    public FirstPartyService(NamedParameterJdbcTemplate jdbc, InvoiceProcessingService invoices, LocalPriceService localPrices,
                             PartnerWebhookService webhooks, Validator validator,
                             @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.localPrices = localPrices;
        this.webhooks = webhooks;
        this.validator = validator;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    private String absolute(String url) {
        return url == null ? null : url.startsWith("http") ? url : publicBaseUrl + url;
    }

    // ── Vendas do caixa ─────────────────────────────────────────────────────

    /** Chave de acesso da NFC-e/NF-e: 44 dígitos. */
    static boolean validAccessKey(String key) {
        return key != null && key.matches("\\d{44}");
    }

    /**
     * Cada venda entra como a nota que o agente leria do XML. Cota estourada
     * vale para o resto do lote (como no agente): os itens seguintes voltam
     * LIMITE_DO_PLANO sem tentar.
     */
    public PartnerIngestService.BatchResult sales(UUID partnerId, UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        if (items == null || items.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 venda em \"items\".");
        if (items.size() > MAX_SALES_BATCH) throw new IllegalArgumentException("No máximo " + MAX_SALES_BATCH + " vendas por lote.");
        List<PartnerIngestService.ItemResult> out = new ArrayList<>();
        int ok = 0;
        String quotaMessage = null;
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> raw = items.get(i);
            String ref = raw == null ? null : PartnerIngestService.text(raw.get("chaveNFe"), 60);
            if (quotaMessage != null) {
                out.add(new PartnerIngestService.ItemResult(i, ref, "LIMITE_DO_PLANO", quotaMessage));
                continue;
            }
            InvoiceDTO dto;
            try {
                dto = json.convertValue(raw, InvoiceDTO.class);
            } catch (IllegalArgumentException e) {
                out.add(new PartnerIngestService.ItemResult(i, ref, "RECUSADO", "formato inválido: " + rootMessage(e)));
                continue;
            }
            String problem = validate(dto);
            if (problem != null) {
                out.add(new PartnerIngestService.ItemResult(i, ref, "RECUSADO", problem));
                continue;
            }
            if (dryRun) {
                out.add(new PartnerIngestService.ItemResult(i, ref, "VALIDO", null));
                ok++;
                continue;
            }
            IngestResponse r;
            try {
                r = invoices.processInvoice(dto, marketId);
            } catch (RuntimeException e) {
                // Uma nota que derruba a transação não pode levar o lote junto.
                out.add(new PartnerIngestService.ItemResult(i, ref, "RECUSADO", "erro ao gravar: " + rootMessage(e)));
                continue;
            }
            switch (r.getStatus()) {
                case "SUCCESS" -> {
                    out.add(new PartnerIngestService.ItemResult(i, ref, "GRAVADO", null));
                    ok++;
                }
                case "DUPLICATE" -> {
                    out.add(new PartnerIngestService.ItemResult(i, ref, "JA_RECEBIDA", null));
                    ok++;
                }
                case "QUOTA_EXCEEDED" -> {
                    quotaMessage = r.getMessage();
                    out.add(new PartnerIngestService.ItemResult(i, ref, "LIMITE_DO_PLANO", quotaMessage));
                }
                default -> out.add(new PartnerIngestService.ItemResult(i, ref, "RECUSADO", r.getMessage()));
            }
        }
        PartnerIngestService.BatchResult result = new PartnerIngestService.BatchResult(items.size(), ok, items.size() - ok, dryRun, out);
        if (!dryRun && ok > 0) {
            jdbc.update("update partner_market_links set last_sales_at = now() where market_id = :m and partner_id = :p and status = 'ATIVO'",
                new MapSqlParameterSource("m", marketId).addValue("p", partnerId));
        }
        return result;
    }

    private String validate(InvoiceDTO dto) {
        if (dto == null) return "venda vazia";
        Set<ConstraintViolation<InvoiceDTO>> violations = validator.validate(dto);
        if (!violations.isEmpty()) {
            return violations.stream()
                .map(v -> v.getPropertyPath() + " " + v.getMessage())
                .sorted().collect(Collectors.joining("; "));
        }
        if (!validAccessKey(dto.getChaveNFe())) return "chaveNFe precisa ter os 44 dígitos da chave de acesso";
        if (dto.getItems().isEmpty()) return "a venda precisa ter ao menos 1 item";
        return null;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null) t = t.getCause();
        String m = t.getMessage();
        return m == null ? t.getClass().getSimpleName() : m.length() > 200 ? m.substring(0, 200) : m;
    }

    /**
     * Venda cancelada no caixa: sai da base. Os números do dia são refeitos na
     * agregação noturna, então o cancelamento no mesmo dia (prazo da NFC-e) não
     * deixa rastro.
     */
    @Transactional
    public PartnerIngestService.BatchResult cancelSales(UUID marketId, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 chave em \"items\".");
        if (items.size() > MAX_SALES_BATCH) throw new IllegalArgumentException("No máximo " + MAX_SALES_BATCH + " por lote.");
        List<PartnerIngestService.ItemResult> out = new ArrayList<>();
        int ok = 0;
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> it = items.get(i);
            String key = it == null ? null : PartnerIngestService.digits(it.get("chaveNFe"));
            if (!validAccessKey(key)) {
                out.add(new PartnerIngestService.ItemResult(i, key, "RECUSADO", "chaveNFe precisa ter 44 dígitos"));
                continue;
            }
            List<UUID> found = jdbc.query("select id from invoices where chave_nfe = :k and market_id = :m",
                new MapSqlParameterSource("k", key).addValue("m", marketId), (rs, n) -> rs.getObject("id", UUID.class));
            if (found.isEmpty()) {
                // Cancelada antes de chegar aqui: nada a desfazer, e reenviar não pode dar erro.
                out.add(new PartnerIngestService.ItemResult(i, key, "NAO_ENCONTRADA", null));
                ok++;
                continue;
            }
            MapSqlParameterSource p = new MapSqlParameterSource("i", found.get(0));
            jdbc.update("delete from product_observations where invoice_id = :i", p);
            jdbc.update("delete from invoice_items where invoice_id = :i", p);
            jdbc.update("delete from invoices where id = :i", p);
            out.add(new PartnerIngestService.ItemResult(i, key, "CANCELADA", null));
            ok++;
        }
        return new PartnerIngestService.BatchResult(items.size(), ok, items.size() - ok, false, out);
    }

    // ── Catálogo por GTIN ───────────────────────────────────────────────────

    /**
     * Cadastro pronto para o código bipado: nome padronizado, marca, categoria,
     * embalagem e foto do catálogo geral; NCM das notas de entrada desta loja.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> catalog(UUID marketId, List<String> rawGtins) {
        List<String> gtins = new ArrayList<>();
        for (String g : rawGtins) {
            String d = PartnerIngestService.digits(g);
            if (d != null && !d.isEmpty() && !gtins.contains(d)) gtins.add(d);
        }
        if (gtins.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 código de barras.");
        if (gtins.size() > MAX_LOOKUP) throw new IllegalArgumentException("No máximo " + MAX_LOOKUP + " códigos por consulta.");
        Map<String, String> variantToGtin = new HashMap<>();
        for (String g : gtins) {
            if (PartnerIngestService.validGtin(g)) {
                for (String v : PartnerIngestService.gtinVariants(g)) variantToGtin.putIfAbsent(v, g);
            }
        }
        Map<String, Map<String, Object>> byGtin = new HashMap<>();
        Map<String, String> ncm = new HashMap<>();
        if (!variantToGtin.isEmpty()) {
            MapSqlParameterSource params = new MapSqlParameterSource("g", variantToGtin.keySet()).addValue("m", marketId);
            jdbc.queryForList(
                "select ean, name, brand, category, unit, package_description, image_url from products where ean in (:g)", params)
                .forEach(r -> byGtin.putIfAbsent(variantToGtin.get(String.valueOf(r.get("ean"))), r));
            jdbc.queryForList(
                "select distinct on (gtin) gtin, ncm from nfe_document_items where market_id = :m and gtin in (:g) and ncm is not null " +
                "order by gtin, issued_at desc", params)
                .forEach(r -> ncm.putIfAbsent(variantToGtin.get(String.valueOf(r.get("gtin"))), (String) r.get("ncm")));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (String g : gtins) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gtin", g);
            if (!PartnerIngestService.validGtin(g)) {
                m.put("found", false);
                m.put("reason", "GTIN_INVALIDO");
                out.add(m);
                continue;
            }
            Map<String, Object> p = byGtin.get(g);
            m.put("found", p != null);
            if (p != null) {
                m.put("description", p.get("name"));
                m.put("brand", p.get("brand"));
                m.put("department", p.get("category"));
                m.put("unit", p.get("unit"));
                m.put("packageDescription", p.get("package_description"));
                m.put("imageUrl", absolute((String) p.get("image_url")));
            }
            m.put("ncm", ncm.get(g));
            out.add(m);
        }
        return out;
    }

    // ── Decisões do Tino ────────────────────────────────────────────────────

    /**
     * As decisões que esperam o dono, para o sistema mostrar com o link que abre
     * cada uma no MercadoFlow. O plano da loja vale aqui também: o que ele não
     * deixa ver vem só contado.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> decisions(UUID marketId, String actionType, int limit, boolean fullInsights,
                                         Set<String> paidTypes) {
        int size = Math.max(1, Math.min(limit, MAX_DECISIONS));
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select r.id, r.action_type, r.title, r.rationale, r.parameters::text as parameters, r.expected_impact_value, " +
            "  r.confidence, r.created_at, o.type as opportunity_type, p.ean, p.name as product_name, p.image_url " +
            "from recommendations r join opportunities o on o.id = r.opportunity_id left join products p on p.id = o.product_id " +
            "where r.market_id = :m and r.status = 'PROPOSTA' and o.status in ('NOVA', 'VISTA', 'EM_ACAO') " +
            "  and (cast(:t as varchar) is null or r.action_type = :t) " +
            "order by r.expected_impact_value desc nulls last, r.created_at desc",
            new MapSqlParameterSource("m", marketId).addValue("t", actionType));
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Integer> byType = new LinkedHashMap<>();
        int locked = 0;
        BigDecimal impact = BigDecimal.ZERO;
        for (Map<String, Object> r : rows) {
            if (!fullInsights && paidTypes.contains(String.valueOf(r.get("opportunity_type")))) {
                locked++;
                continue;
            }
            String type = String.valueOf(r.get("action_type"));
            byType.merge(type, 1, Integer::sum);
            if (r.get("expected_impact_value") instanceof BigDecimal b) impact = impact.add(b);
            if (out.size() >= size) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id"));
            m.put("actionType", type);
            m.put("title", r.get("title"));
            m.put("rationale", r.get("rationale"));
            m.put("gtin", r.get("ean"));
            m.put("productName", r.get("product_name"));
            m.put("imageUrl", absolute((String) r.get("image_url")));
            m.put("expectedImpactValue", r.get("expected_impact_value"));
            m.put("confidence", r.get("confidence"));
            m.put("suggestion", suggestion(type, (String) r.get("parameters")));
            m.put("createdAt", ((Timestamp) r.get("created_at")).toLocalDateTime());
            m.put("url", publicBaseUrl + "/app/decidir?item=rec:" + r.get("id"));
            out.add(m);
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("total", byType.values().stream().mapToInt(Integer::intValue).sum());
        res.put("byActionType", byType);
        res.put("expectedImpactValue", impact);
        res.put("lockedByPlan", locked);
        res.put("items", out);
        res.put("url", publicBaseUrl + "/app/decidir");
        return res;
    }

    /** Só os números que o sistema usa para agir; o raciocínio inteiro fica no MercadoFlow. */
    static Map<String, Object> suggestion(String actionType, String parametersJson) {
        Map<String, Object> params;
        try {
            params = parametersJson == null ? Map.of() : new ObjectMapper().readValue(parametersJson, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            params = Map.of();
        }
        List<String> keys = switch (actionType) {
            case "COMPRAR" -> List.of("quantidade", "valorEstimado", "embalagem", "unidadesPorEmbalagem", "coberturaDias");
            case "PROMOVER", "LIQUIDAR" -> List.of("precoAtual", "descontoPercent", "precoInformado", "valorEstoque", "coberturaDias");
            case "AJUSTAR_PRECO" -> List.of("precoAtual", "precoNovo", "precoReferencia", "precoInformado", "direcao");
            default -> List.of();
        };
        Map<String, Object> out = new LinkedHashMap<>();
        for (String k : keys) {
            if (params.get(k) != null) out.put(k, params.get(k));
        }
        return out;
    }

    // ── Preços da região ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Map<String, Object>> localPrices(UUID marketId, List<String> rawGtins) {
        List<String> gtins = rawGtins.stream().map(PartnerIngestService::digits)
            .filter(PartnerIngestService::validGtin).distinct().toList();
        if (gtins.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 código de barras válido.");
        if (gtins.size() > MAX_LOOKUP) throw new IllegalArgumentException("No máximo " + MAX_LOOKUP + " códigos por consulta.");
        Map<String, String> variantToGtin = new HashMap<>();
        gtins.forEach(g -> PartnerIngestService.gtinVariants(g).forEach(v -> variantToGtin.putIfAbsent(v, g)));
        Map<UUID, String> productToGtin = new LinkedHashMap<>();
        jdbc.queryForList("select id, ean from products where ean in (:g)", new MapSqlParameterSource("g", variantToGtin.keySet()))
            .forEach(r -> productToGtin.putIfAbsent((UUID) r.get("id"), variantToGtin.get(String.valueOf(r.get("ean")))));
        Map<UUID, Map<String, Object>> latest = localPrices.latest(marketId, new ArrayList<>(productToGtin.keySet()));
        Map<String, Map<String, Object>> byGtin = new HashMap<>();
        latest.forEach((pid, r) -> byGtin.put(productToGtin.get(pid), r));
        List<Map<String, Object>> out = new ArrayList<>();
        for (String g : gtins) {
            Map<String, Object> r = byGtin.get(g);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gtin", g);
            m.put("found", r != null && "OK".equals(r.get("status")));
            if (r != null) {
                m.put("status", r.get("status"));
                m.put("collectedOn", String.valueOf(r.get("collected_on")));
                m.put("radiusKm", r.get("radius_km"));
                m.put("stores", r.get("stores"));
                m.put("median", r.get("median_price"));
                m.put("p25", r.get("p25_price"));
                m.put("p75", r.get("p75_price"));
                m.put("min", r.get("min_price"));
                m.put("minStore", r.get("min_store"));
                m.put("minDistanceKm", r.get("min_distance_km"));
            }
            out.add(m);
        }
        return out;
    }

    // ── Encartes publicados ─────────────────────────────────────────────────

    /**
     * Encartes publicados que ainda valem, com o preço de oferta de cada produto,
     * para o caixa aplicar sozinho de {@code validFrom} a {@code validUntil}.
     * Item sem produto do catálogo vem sem GTIN: o sistema não tem como aplicar.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> promotions(UUID marketId) {
        List<Map<String, Object>> campaigns = jdbc.queryForList(
            "select id, title, content::text as content, valid_from, valid_until, public_slug, published_at, updated_at " +
            "from art_campaigns where market_id = :m and status = 'PUBLISHED' " +
            "and (valid_until is null or valid_until >= current_date) order by valid_from nulls first, published_at",
            new MapSqlParameterSource("m", marketId));
        List<Map<String, Object>> parsed = new ArrayList<>();
        List<UUID> productIds = new ArrayList<>();
        for (Map<String, Object> c : campaigns) {
            Map<String, Object> content;
            try {
                content = json.readValue(String.valueOf(c.get("content")), new TypeReference<Map<String, Object>>() { });
            } catch (Exception e) {
                content = Map.of();
            }
            List<Map<String, Object>> items = new ArrayList<>();
            if (content.get("products") instanceof List<?> list) {
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> raw)) continue;
                    Map<String, Object> it = PartnerIngestService.asMap(raw);
                    items.add(it);
                    UUID pid = uuid(it.get("productId"));
                    if (pid != null) productIds.add(pid);
                }
            }
            c.put("items", items);
            parsed.add(c);
        }
        Map<UUID, String> gtinOf = new HashMap<>();
        if (!productIds.isEmpty()) {
            jdbc.queryForList("select id, ean from products where id in (:ids)", new MapSqlParameterSource("ids", productIds))
                .forEach(r -> gtinOf.put((UUID) r.get("id"), (String) r.get("ean")));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> c : parsed) {
            List<Map<String, Object>> lines = new ArrayList<>();
            @SuppressWarnings("unchecked") List<Map<String, Object>> items = (List<Map<String, Object>>) c.get("items");
            for (Map<String, Object> it : items) {
                BigDecimal price = number(it.get("price"));
                if (price == null || price.signum() <= 0) continue;
                Map<String, Object> l = new LinkedHashMap<>();
                l.put("gtin", gtinOf.get(uuid(it.get("productId"))));
                l.put("description", it.get("name"));
                l.put("detail", it.get("detail"));
                l.put("promoPrice", price);
                l.put("regularPrice", number(it.get("oldPrice")));
                l.put("unit", it.get("unit"));
                l.put("deal", it.get("deal"));
                lines.add(l);
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.get("id"));
            m.put("title", c.get("title"));
            m.put("validFrom", c.get("valid_from") == null ? null : String.valueOf(c.get("valid_from")));
            m.put("validUntil", c.get("valid_until") == null ? null : String.valueOf(c.get("valid_until")));
            m.put("publishedAt", c.get("published_at") == null ? null : ((Timestamp) c.get("published_at")).toLocalDateTime());
            m.put("updatedAt", ((Timestamp) c.get("updated_at")).toLocalDateTime());
            m.put("publicUrl", c.get("public_slug") == null ? null : publicBaseUrl + "/encarte/" + c.get("public_slug"));
            m.put("items", lines);
            out.add(m);
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("validFrom"))));
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("items", out);
        return res;
    }

    private static UUID uuid(Object v) {
        if (v == null) return null;
        try {
            return UUID.fromString(String.valueOf(v));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static BigDecimal number(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ── Conectar ao MercadoFlow ─────────────────────────────────────────────

    /** https, ou http só no próprio computador (desenvolvimento). */
    static boolean validReturnUrl(String url) {
        try {
            URI u = URI.create(url);
            if (u.getHost() == null) return false;
            if ("https".equalsIgnoreCase(u.getScheme())) return true;
            return "http".equalsIgnoreCase(u.getScheme()) && ("localhost".equals(u.getHost()) || "127.0.0.1".equals(u.getHost()));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** O parceiro abre o pedido; o link vai para o dono aprovar logado no MercadoFlow. */
    public Map<String, Object> createConnect(UUID partnerId, Map<String, Object> body) {
        String cnpj = PartnerIngestService.digits(body.get("cnpj"));
        if (cnpj != null && cnpj.isEmpty()) cnpj = null;
        if (cnpj != null && cnpj.length() != 14) throw new IllegalArgumentException("cnpj precisa ter 14 dígitos.");
        String email = PartnerIngestService.text(body.get("ownerEmail"), 255);
        if (email != null && !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw new IllegalArgumentException("ownerEmail inválido.");
        String returnUrl = PartnerIngestService.text(body.get("returnUrl"), 1000);
        if (returnUrl != null && !validReturnUrl(returnUrl)) throw new IllegalArgumentException("returnUrl precisa ser https.");
        List<String> scopes = new ArrayList<>();
        if (body.get("scopes") instanceof List<?> l) {
            for (Object o : l) {
                String s = String.valueOf(o);
                if (!PartnerScopes.LABELS.containsKey(s)) throw new IllegalArgumentException("Escopo desconhecido: " + s);
                if (!scopes.contains(s)) scopes.add(s);
            }
        }
        if (scopes.isEmpty()) scopes.addAll(PartnerScopes.ALL);
        String code = CODE_PREFIX + PartnerAuthService.randomToken(24);
        LocalDateTime expires = LocalDateTime.now().plusDays(CONNECT_DAYS);
        String finalCnpj = cnpj;
        TenantContext.runAsSystem(() -> jdbc.update(
            "insert into partner_connect_requests (partner_id, code_hash, cnpj, store_name, owner_email, external_store_id, return_url, scopes, expires_at) " +
            "values (:p, :h, :c, :n, :e, :x, :r, cast(:s as text[]), :exp)",
            new MapSqlParameterSource("p", partnerId).addValue("h", PartnerAuthService.sha256(code)).addValue("c", finalCnpj)
                .addValue("n", PartnerIngestService.text(body.get("storeName"), 200)).addValue("e", email)
                .addValue("x", PartnerIngestService.text(body.get("externalStoreId"), 120)).addValue("r", returnUrl)
                .addValue("s", "{" + String.join(",", scopes) + "}").addValue("exp", Timestamp.valueOf(expires))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("connectUrl", publicBaseUrl + "/conectar?code=" + code);
        out.put("expiresAt", expires);
        out.put("scopes", scopes);
        return out;
    }

    /** Situação do pedido, para o parceiro acompanhar sem depender do aviso. */
    public Map<String, Object> connectStatus(UUID partnerId, String code) {
        Map<String, Object> r = findConnect(code);
        if (r == null || !partnerId.equals(r.get("partner_id"))) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", effectiveStatus(r));
        out.put("marketId", r.get("market_id"));
        out.put("externalStoreId", r.get("external_store_id"));
        out.put("scopes", r.get("market_id") == null ? strings(r.get("scopes")) : linkScopes(partnerId, (UUID) r.get("market_id")));
        out.put("decidedAt", r.get("decided_at") == null ? null : ((Timestamp) r.get("decided_at")).toLocalDateTime());
        out.put("expiresAt", ((Timestamp) r.get("expires_at")).toLocalDateTime());
        return out;
    }

    private List<String> linkScopes(UUID partnerId, UUID marketId) {
        return TenantContext.runAsSystem(() -> jdbc.query(
            "select scopes from partner_market_links where partner_id = :p and market_id = :m and status = 'ATIVO'",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId), (rs, n) -> strings(rs.getArray("scopes"))))
            .stream().findFirst().orElse(List.of());
    }

    private Map<String, Object> findConnect(String code) {
        if (code == null || !code.startsWith(CODE_PREFIX) || code.length() > 80) return null;
        List<Map<String, Object>> rows = TenantContext.runAsSystem(() -> jdbc.queryForList(
            "select c.*, p.name as partner_name, p.website, p.first_party, p.status as partner_status " +
            "from partner_connect_requests c join integration_partners p on p.id = c.partner_id where c.code_hash = :h",
            new MapSqlParameterSource("h", PartnerAuthService.sha256(code))));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static String effectiveStatus(Map<String, Object> r) {
        String status = String.valueOf(r.get("status"));
        if ("PENDENTE".equals(status) && ((Timestamp) r.get("expires_at")).toLocalDateTime().isBefore(LocalDateTime.now())) {
            return "EXPIRADO";
        }
        return status;
    }

    static List<String> strings(Object array) {
        try {
            if (array instanceof Array a) return List.of((String[]) a.getArray());
        } catch (Exception ignored) {
            // cai no vazio
        }
        return List.of();
    }

    /**
     * Antes do login: quem pede e os dados para pré-preencher o cadastro. O
     * código é aleatório e longo; quem o tem recebeu o link do próprio sistema.
     */
    public Map<String, Object> connectPublicInfo(String code) {
        Map<String, Object> r = findConnect(code);
        if (r == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("partnerName", r.get("partner_name"));
        out.put("firstParty", Boolean.TRUE.equals(r.get("first_party")));
        out.put("status", "SUSPENSO".equals(r.get("partner_status")) ? "INDISPONIVEL" : effectiveStatus(r));
        boolean pending = "PENDENTE".equals(out.get("status"));
        out.put("storeName", pending ? r.get("store_name") : null);
        out.put("cnpj", pending ? r.get("cnpj") : null);
        out.put("ownerEmail", pending ? r.get("owner_email") : null);
        return out;
    }

    /** O que o dono vê antes de aprovar. */
    public Map<String, Object> connectPreview(UUID marketId, String code) {
        Map<String, Object> r = findConnect(code);
        if (r == null) throw new IllegalArgumentException("Link de conexão inválido. Gere outro no seu sistema.");
        String marketCnpj = TenantContext.runAsSystem(() -> jdbc.queryForObject(
            "select cnpj from markets where id = :m", new MapSqlParameterSource("m", marketId), String.class));
        boolean firstParty = Boolean.TRUE.equals(r.get("first_party"));
        Map<String, String> labels = PartnerScopes.labelsFor(firstParty);
        Map<String, String> scopes = new LinkedHashMap<>();
        for (String s : strings(r.get("scopes"))) {
            if (labels.containsKey(s)) scopes.put(s, labels.get(s));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("partnerId", r.get("partner_id"));
        out.put("partnerName", r.get("partner_name"));
        out.put("website", r.get("website"));
        out.put("firstParty", firstParty);
        out.put("status", "SUSPENSO".equals(r.get("partner_status")) ? "INDISPONIVEL" : effectiveStatus(r));
        out.put("storeName", r.get("store_name"));
        out.put("cnpj", r.get("cnpj"));
        String own = PartnerIngestService.digits(marketCnpj);
        out.put("cnpjMatches", r.get("cnpj") == null || own == null || own.isEmpty() || own.equals(r.get("cnpj")));
        out.put("marketCnpj", own);
        out.put("scopes", scopes);
        out.put("connectedMarketId", r.get("market_id"));
        return out;
    }

    /**
     * O dono aprova: a loja fica vinculada ao parceiro com os escopos pedidos
     * (ou os que ele deixou marcados) e o parceiro recebe o aviso.
     */
    @Transactional
    public Map<String, Object> connectApprove(UUID marketId, String code, List<String> chosen, String user) {
        Map<String, Object> r = findConnect(code);
        if (r == null) throw new IllegalArgumentException("Link de conexão inválido. Gere outro no seu sistema.");
        String status = effectiveStatus(r);
        if ("EXPIRADO".equals(status)) throw new IllegalArgumentException("Este link venceu. Gere outro no seu sistema.");
        if (!"PENDENTE".equals(status)) throw new IllegalArgumentException("Este link já foi usado.");
        if ("SUSPENSO".equals(r.get("partner_status"))) throw new IllegalArgumentException("Este sistema não está disponível.");
        boolean firstParty = Boolean.TRUE.equals(r.get("first_party"));
        List<String> requested = strings(r.get("scopes"));
        List<String> scopes = new ArrayList<>();
        for (String s : chosen == null || chosen.isEmpty() ? requested : chosen) {
            // Só o que foi pedido e o que este parceiro pode receber.
            if (requested.contains(s) && PartnerScopes.allowed(s, firstParty) && !scopes.contains(s)) scopes.add(s);
        }
        if (scopes.isEmpty()) throw new IllegalArgumentException("Escolha ao menos uma permissão.");
        UUID partnerId = (UUID) r.get("partner_id");
        String external = (String) r.get("external_store_id");
        link(partnerId, marketId, scopes, user, external, null);
        TenantContext.runAsSystem(() -> jdbc.update(
            "update partner_connect_requests set status = 'APROVADO', market_id = :m, decided_by = :u, decided_at = now() where id = :id",
            new MapSqlParameterSource("m", marketId).addValue("u", user).addValue("id", r.get("id"))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("scopes", scopes);
        out.put("returnUrl", returnUrl((String) r.get("return_url"), "ok", marketId));
        return out;
    }

    /**
     * Vincula a loja ao parceiro e avisa o parceiro. {@code customerActive} nulo
     * mantém o que já estava (o parceiro informa depois se a loja é cliente dele).
     */
    public void link(UUID partnerId, UUID marketId, List<String> scopes, String user, String external, Boolean customerActive) {
        TenantContext.runAsSystem(() -> jdbc.update(
            "insert into partner_market_links (partner_id, market_id, scopes, status, authorized_by, authorized_at, external_store_id, " +
            "  customer_active, customer_status_at) " +
            "values (:p, :m, cast(:s as text[]), 'ATIVO', :u, now(), :x, coalesce(:c, false), case when :c is null then null else now() end) " +
            "on conflict (partner_id, market_id) do update set scopes = excluded.scopes, status = 'ATIVO', " +
            "authorized_by = excluded.authorized_by, authorized_at = now(), revoked_at = null, " +
            "external_store_id = coalesce(excluded.external_store_id, partner_market_links.external_store_id), " +
            "customer_active = coalesce(:c, partner_market_links.customer_active), " +
            "customer_status_at = case when :c is null then partner_market_links.customer_status_at else now() end",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId).addValue("u", user).addValue("x", external)
                .addValue("c", customerActive, java.sql.Types.BOOLEAN).addValue("s", "{" + String.join(",", scopes) + "}")));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("externalStoreId", external);
        payload.put("scopes", scopes);
        payload.put("authorizedBy", user);
        webhooks.enqueueTo(partnerId, marketId, PartnerWebhookService.EVENT_CONNECTION_AUTHORIZED, payload);
        // O desconto do plano para cliente do parceiro pode ter mudado.
        if (benefits != null) benefits.repriceAfterCommit(marketId);
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private PartnerBenefitService benefits;

    @Transactional
    public Map<String, Object> connectRefuse(String code, String user) {
        Map<String, Object> r = findConnect(code);
        if (r == null) throw new IllegalArgumentException("Link de conexão inválido.");
        if (!"PENDENTE".equals(effectiveStatus(r))) throw new IllegalArgumentException("Este link já foi usado ou venceu.");
        TenantContext.runAsSystem(() -> jdbc.update(
            "update partner_connect_requests set status = 'RECUSADO', decided_by = :u, decided_at = now() where id = :id",
            new MapSqlParameterSource("u", user).addValue("id", r.get("id"))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("returnUrl", returnUrl((String) r.get("return_url"), "recusado", null));
        return out;
    }

    static String returnUrl(String base, String status, UUID marketId) {
        if (base == null) return null;
        String sep = base.contains("?") ? "&" : "?";
        return base + sep + "mf_status=" + status + (marketId == null ? "" : "&mf_market=" + marketId);
    }
}
