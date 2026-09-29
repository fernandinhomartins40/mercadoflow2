package com.pdv2cloud.service.confere;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.service.ai.AiCredentialCipher;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configuração do Confere pelo superadmin: chave do Meu Danfe (revenda de
 * leituras), preço avulso, planos de créditos, leituras grátis de teste,
 * termos e a chave Pix que recebe as compras.
 */
@Service
public class ConfereAdminService {

    public static final String DEFAULT_TERMS = """
        Ao usar o MercadoFlow Confere você concorda que:
        1. As notas fiscais lidas ou recebidas pelo aplicativo (XML completo, com fornecedor, produtos, quantidades e preços) ficam armazenadas pelo MercadoFlow, vinculadas ao seu mercado.
        2. Esses dados são usados para a conferência, para o histórico do seu mercado e, de forma agregada e anônima (sem identificar o seu mercado nem os seus fornecedores), para estudos de mercado do ecossistema MercadoFlow.
        3. Se você cadastrar o certificado digital A1, ele fica guardado cifrado e é usado somente para baixar da Sefaz as notas emitidas contra o seu CNPJ e registrar a "Ciência da Operação" dessas notas.
        4. Você pode remover o certificado a qualquer momento.
        """;

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final MeuDanfeClient meuDanfe;
    private final ConfereService confere;

    public ConfereAdminService(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, MeuDanfeClient meuDanfe,
                               ConfereService confere) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.meuDanfe = meuDanfe;
        this.confere = confere;
    }

    public record Settings(boolean enabled, boolean meuDanfeConfigured, String meuDanfeKeyHint, int pricePerReadCents,
                           int trialReads, String termsVersion, String termsText, String pixKey, String pixMerchantName,
                           String pixMerchantCity, boolean stripeEnabled, boolean encryptionReady,
                           LocalDateTime updatedAt, String updatedBy) {}

    public Settings settings() {
        return jdbc.queryForObject("select * from confere_settings where id = 'default'", Map.of(), (rs, i) -> new Settings(
            rs.getBoolean("enabled"), rs.getString("meudanfe_api_key_enc") != null, rs.getString("meudanfe_key_hint"),
            rs.getInt("price_per_read_cents"), rs.getInt("trial_reads"), rs.getString("terms_version"),
            rs.getString("terms_text") == null ? DEFAULT_TERMS : rs.getString("terms_text"),
            rs.getString("pix_key"), rs.getString("pix_merchant_name"), rs.getString("pix_merchant_city"),
            rs.getBoolean("stripe_enabled"), cipher.isConfigured(),
            rs.getTimestamp("updated_at") == null ? null : rs.getTimestamp("updated_at").toLocalDateTime(),
            rs.getString("updated_by")));
    }

    @Transactional
    public Settings save(Map<String, Object> body, String actor) {
        Settings current = settings();
        String apiKey = str(body.get("meuDanfeApiKey"));
        String enc = null;
        String hint = null;
        if (apiKey != null) {
            if (!cipher.isConfigured()) {
                throw new IllegalArgumentException("A chave mestra de criptografia (AI_ENCRYPTION_KEY) não está configurada no servidor");
            }
            String problem = meuDanfe.checkKey(apiKey);
            if (problem != null) {
                throw new IllegalArgumentException(problem);
            }
            enc = cipher.encrypt(apiKey);
            hint = cipher.hint(apiKey);
        }
        int price = intOr(body.get("pricePerReadCents"), current.pricePerReadCents());
        int trial = intOr(body.get("trialReads"), current.trialReads());
        if (price < 1 || price > 10000) {
            throw new IllegalArgumentException("Preço por leitura fora do limite");
        }
        if (trial < 0 || trial > 500) {
            throw new IllegalArgumentException("Leituras grátis fora do limite");
        }
        String termsText = body.containsKey("termsText") ? str(body.get("termsText")) : current.termsText();
        String termsVersion = current.termsVersion();
        // Termo mudou: nova versão, e todo mercado aceita de novo.
        if (termsText != null && !termsText.equals(current.termsText())) {
            termsVersion = java.time.LocalDate.now().toString() + "-" + (System.currentTimeMillis() % 1000);
        }
        String pixKey = body.containsKey("pixKey") ? str(body.get("pixKey")) : current.pixKey();
        if (pixKey != null && pixKey.length() > 77) {
            throw new IllegalArgumentException("Chave Pix grande demais");
        }
        jdbc.update(
            "update confere_settings set enabled = :enabled, price_per_read_cents = :price, trial_reads = :trial, " +
            "terms_text = :terms, terms_version = :version, pix_key = :pixKey, pix_merchant_name = :pixName, " +
            "pix_merchant_city = :pixCity, stripe_enabled = :stripe, updated_at = now(), updated_by = :actor, " +
            "meudanfe_api_key_enc = coalesce(:enc, meudanfe_api_key_enc), meudanfe_key_hint = coalesce(:hint, meudanfe_key_hint) " +
            "where id = 'default'",
            new MapSqlParameterSource()
                .addValue("enabled", bool(body.get("enabled"), current.enabled()))
                .addValue("price", price).addValue("trial", trial)
                .addValue("terms", termsText).addValue("version", termsVersion)
                .addValue("pixKey", pixKey)
                .addValue("pixName", body.containsKey("pixMerchantName") ? str(body.get("pixMerchantName")) : current.pixMerchantName())
                .addValue("pixCity", body.containsKey("pixMerchantCity") ? str(body.get("pixMerchantCity")) : current.pixMerchantCity())
                .addValue("stripe", bool(body.get("stripeEnabled"), current.stripeEnabled()))
                .addValue("actor", actor).addValue("enc", enc).addValue("hint", hint));
        return settings();
    }

    public String testKey() {
        String key = confere.meuDanfeKey();
        if (key == null) {
            return "Cadastre a Api-Key do Meu Danfe primeiro";
        }
        String problem = meuDanfe.checkKey(key);
        return problem == null ? null : problem;
    }

    // ── Planos ─────────────────────────────────────────────────────────────

    public List<ConfereService.Plan> plans() {
        return jdbc.query("select * from confere_plans order by sort_order, reads", Map.of(), (rs, i) ->
            new ConfereService.Plan((UUID) rs.getObject("id"), rs.getString("name"), rs.getInt("reads"),
                rs.getInt("price_cents"), rs.getBoolean("active")));
    }

    @Transactional
    public List<ConfereService.Plan> savePlan(UUID id, Map<String, Object> body) {
        String name = str(body.get("name"));
        int reads = intOr(body.get("reads"), 0);
        int price = intOr(body.get("priceCents"), 0);
        if (name == null || reads <= 0 || price <= 0) {
            throw new IllegalArgumentException("Informe nome, quantidade de leituras e preço");
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("name", name).addValue("reads", reads)
            .addValue("price", price).addValue("active", bool(body.get("active"), true))
            .addValue("sort", intOr(body.get("sortOrder"), reads));
        if (id == null) {
            jdbc.update("insert into confere_plans (name, reads, price_cents, active, sort_order) values (:name, :reads, :price, :active, :sort)", p);
        } else {
            p.addValue("id", id);
            if (jdbc.update("update confere_plans set name = :name, reads = :reads, price_cents = :price, active = :active, sort_order = :sort where id = :id", p) == 0) {
                throw new CustomExceptions.NotFound("Plano não encontrado");
            }
        }
        return plans();
    }

    @Transactional
    public List<ConfereService.Plan> deletePlan(UUID id) {
        jdbc.update("delete from confere_plans where id = :id", Map.of("id", id));
        return plans();
    }

    // ── Pedidos e contas ───────────────────────────────────────────────────

    public record AdminOrder(UUID id, UUID marketId, String marketName, String planName, int reads, int amountCents,
                             String method, String status, String txid, LocalDateTime createdAt, LocalDateTime paidAt,
                             String confirmedBy) {}

    public List<AdminOrder> orders(String status) {
        String where = status == null || status.isBlank() ? "" : "where o.status = :status ";
        return jdbc.query(
            "select o.*, m.name as market_name, p.name as plan_name from confere_orders o join markets m on m.id = o.market_id " +
            "left join confere_plans p on p.id = o.plan_id " + where + "order by o.created_at desc limit 200",
            new MapSqlParameterSource().addValue("status", status),
            (rs, i) -> new AdminOrder((UUID) rs.getObject("id"), (UUID) rs.getObject("market_id"), rs.getString("market_name"),
                rs.getString("plan_name"), rs.getInt("reads"), rs.getInt("amount_cents"), rs.getString("method"),
                rs.getString("status"), rs.getString("txid"), ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("paid_at")),
                rs.getString("confirmed_by")));
    }

    @Transactional
    public void confirmOrder(UUID id, String actor) {
        confere.markOrderPaid(id, "PIX", actor);
    }

    @Transactional
    public void cancelOrder(UUID id) {
        int n = jdbc.update("update confere_orders set status = 'CANCELED' where id = :id and status = 'PENDING'", Map.of("id", id));
        if (n == 0) {
            throw new IllegalArgumentException("Só pedido pendente pode ser cancelado");
        }
    }

    public record AdminAccount(UUID marketId, String marketName, String cnpj, int balance, boolean trialGranted,
                               boolean hasCertificate, LocalDateTime termsAcceptedAt, long reads30d, long documents) {}

    public List<AdminAccount> accounts() {
        return jdbc.query(
            "select a.*, m.name as market_name, m.cnpj, (c.market_id is not null) as has_cert, " +
            "(select count(*) from confere_ledger l where l.market_id = a.market_id and l.kind = 'READ' and l.created_at > now() - interval '30 days') as reads30, " +
            "(select count(*) from nfe_documents d where d.market_id = a.market_id) as docs " +
            "from confere_accounts a join markets m on m.id = a.market_id left join confere_certificates c on c.market_id = a.market_id " +
            "order by a.updated_at desc limit 300",
            Map.of(),
            (rs, i) -> new AdminAccount((UUID) rs.getObject("market_id"), rs.getString("market_name"), rs.getString("cnpj"),
                rs.getInt("balance"), rs.getBoolean("trial_granted"), rs.getBoolean("has_cert"),
                ts(rs.getTimestamp("terms_accepted_at")), rs.getLong("reads30"), rs.getLong("docs")));
    }

    @Transactional
    public void adjust(UUID marketId, int delta, String note, String actor) {
        if (delta == 0 || Math.abs(delta) > 100000) {
            throw new IllegalArgumentException("Ajuste inválido");
        }
        confere.credit(marketId, delta, "ADJUST", actor, note == null ? "Ajuste manual" : note);
    }

    public record Stats(long accounts, long withCertificate, long readsMonth, long paidReadsMonth, long revenueMonthCents,
                        long pendingOrders, long documents) {}

    public Stats stats() {
        Map<String, Object> r = jdbc.queryForMap(
            "select (select count(*) from confere_accounts) as accounts, " +
            "(select count(*) from confere_certificates) as certs, " +
            "(select count(*) from nfe_documents where created_at > date_trunc('month', now())) as reads_month, " +
            "(select count(*) from confere_ledger where kind = 'READ' and created_at > date_trunc('month', now())) as paid_reads, " +
            "(select coalesce(sum(amount_cents), 0) from confere_orders where status = 'PAID' and paid_at > date_trunc('month', now())) as revenue, " +
            "(select count(*) from confere_orders where status = 'PENDING') as pending, " +
            "(select count(*) from nfe_documents) as docs",
            Map.of());
        return new Stats(num(r.get("accounts")), num(r.get("certs")), num(r.get("reads_month")), num(r.get("paid_reads")),
            num(r.get("revenue")), num(r.get("pending")), num(r.get("docs")));
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    private static long num(Object o) {
        return o instanceof Number n ? n.longValue() : 0;
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }

    static String str(Object o) {
        if (o == null) {
            return null;
        }
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    static int intOr(Object o, int fallback) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return o == null ? fallback : Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    static boolean bool(Object o, boolean fallback) {
        return o instanceof Boolean b ? b : o == null ? fallback : Boolean.parseBoolean(String.valueOf(o));
    }
}
