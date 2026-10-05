package com.pdv2cloud.service.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanCatalogService;
import com.pdv2cloud.service.ai.AiCredentialCipher;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Cobrança brasileira pelo Asaas: assinatura por Pix ou boleto, cobrança avulsa
 * de créditos por Pix e os avisos de pagamento (webhook) que confirmam tudo
 * sozinhos. O cartão continua no Stripe; o lojista escolhe no checkout.
 *
 * A chave fica no painel de chaves da plataforma (provedor ASAAS), cifrada.
 * Nenhum dado de cartão passa por aqui: Pix e boleto são pagos na fatura
 * hospedada pelo Asaas.
 */
@Service
public class AsaasService {

    private static final Logger log = LoggerFactory.getLogger(AsaasService.class);
    public static final String PROVIDER = "ASAAS";
    static final List<String> WEBHOOK_EVENTS = List.of("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE",
        "PAYMENT_REFUNDED", "PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE",
        "SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED", "INVOICE_ERROR");

    /** Fila de exceções do superadmin (nota fiscal não configurada etc.). */
    private BillingInsightsService insights;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setInsights(BillingInsightsService insights) {
        this.insights = insights;
    }

    public record Charge(String paymentId, String invoiceUrl, String pixPayload) {}

    public record Checkout(String url, boolean changedInPlace) {}

    private final AiPlatformConfig platform;
    private final AiCredentialCipher cipher;
    private final NamedParameterJdbcTemplate jdbc;
    private final PlanCatalogService catalog;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private final String publicBaseUrl;

    public AsaasService(AiPlatformConfig platform, AiCredentialCipher cipher, NamedParameterJdbcTemplate jdbc,
                        PlanCatalogService catalog, @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.platform = platform;
        this.cipher = cipher;
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    public boolean enabled() {
        return platform.key(PROVIDER).isPresent();
    }

    // ── Clientes ─────────────────────────────────────────────────────────

    /** Cliente da rede no Asaas (cria na primeira cobrança). */
    public String ensureCustomer(UUID rootId) {
        List<String> existing = jdbc.queryForList("select customer_id from billing_customers where market_id = :m and provider = 'ASAAS'",
            Map.of("m", rootId), String.class);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        Map<String, Object> m = jdbc.queryForMap("select m.name, m.cnpj, coalesce(m.contact_email, m.account_owner_email, "
            + "(select u.email from users u where u.market_id = m.id and u.role = 'MARKET_OWNER' order by u.created_at limit 1)) as email "
            + "from markets m where m.id = :m", Map.of("m", rootId));
        String doc = m.get("cnpj") == null ? "" : String.valueOf(m.get("cnpj")).replaceAll("\\D", "");
        if (doc.length() != 14 && doc.length() != 11) {
            throw new IllegalArgumentException("Para pagar por Pix ou boleto, cadastre o CNPJ da loja em Configurações.");
        }
        ObjectNode body = json.createObjectNode();
        body.put("name", String.valueOf(m.get("name")));
        body.put("cpfCnpj", doc);
        if (m.get("email") != null) {
            body.put("email", String.valueOf(m.get("email")));
        }
        body.put("externalReference", rootId.toString());
        JsonNode created = call("POST", "/customers", body);
        String id = created.path("id").asText();
        jdbc.update("insert into billing_customers (market_id, provider, customer_id) values (:m, 'ASAAS', :c) "
            + "on conflict (market_id, provider) do update set customer_id = excluded.customer_id", Map.of("m", rootId, "c", id));
        return id;
    }

    // ── Assinatura ───────────────────────────────────────────────────────

    /**
     * Contrata (ou troca) o plano por Pix ou boleto. Devolve a fatura hospedada
     * pelo Asaas, onde o lojista paga; o aviso de pagamento ativa o plano.
     */
    public Checkout checkout(UUID rootId, PlanType plan, String method, SubscriptionService.Subscription current) {
        String billingType = switch (method == null ? "" : method.toUpperCase()) {
            case "PIX" -> "PIX";
            case "BOLETO" -> "BOLETO";
            default -> throw new IllegalArgumentException("Forma de pagamento inválida: escolha Pix ou boleto.");
        };
        if (plan != PlanType.ESSENCIAL && plan != PlanType.PROFISSIONAL) {
            throw new IllegalArgumentException(plan == PlanType.REDE
                ? "O plano Rede é sob medida. Fale com o comercial para receber a proposta."
                : "Este plano não está disponível para contratação online.");
        }
        int cents = catalog.entryFor(plan).getMonthlyPriceCents();
        if (cents <= 0) {
            throw new IllegalArgumentException("Este plano está sem preço; fale com o comercial.");
        }
        BigDecimal value = BigDecimal.valueOf(cents, 2);
        String description = "MercadoFlow — plano " + plan.getDisplayName();

        boolean paying = current.status() == SubscriptionService.Status.ACTIVE || current.status() == SubscriptionService.Status.PAST_DUE
            || current.status() == SubscriptionService.Status.RESTRICTED;
        if (paying && "STRIPE".equals(current.provider())) {
            throw new IllegalStateException("Sua assinatura atual é no cartão. Para mudar de plano, use \"Gerenciar assinatura\".");
        }
        // Já assina pelo Asaas: troca o valor da assinatura atual, sem cobrança dupla.
        if (paying && current.cancelAtPeriodEnd()) {
            throw new IllegalStateException("Sua assinatura foi cancelada e vale até "
                + (current.currentPeriodEnd() == null ? "o fim do período" : current.currentPeriodEnd().toLocalDate()
                    .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM")))
                + ". Depois disso, é só assinar de novo o plano que quiser.");
        }
        if (paying && PROVIDER.equals(current.provider()) && current.providerSubscriptionId() != null) {
            if (plan.name().equals(current.planCode())) {
                throw new IllegalArgumentException("Você já está neste plano.");
            }
            ObjectNode upd = json.createObjectNode();
            upd.put("value", value);
            upd.put("billingType", billingType);
            upd.put("description", description);
            upd.put("updatePendingPayments", true);
            call("POST", "/subscriptions/" + current.providerSubscriptionId(), upd);
            return new Checkout(null, true);
        }
        // Contratação anterior não paga: descarta para não gerar duas faturas.
        if (current.pendingSubscriptionId() != null) {
            try {
                call("DELETE", "/subscriptions/" + current.pendingSubscriptionId(), null);
            } catch (RuntimeException e) {
                log.warn("Não consegui apagar a contratação pendente {}: {}", current.pendingSubscriptionId(), e.getMessage());
            }
        }
        String customer = ensureCustomer(rootId);
        ObjectNode body = json.createObjectNode();
        body.put("customer", customer);
        body.put("billingType", billingType);
        body.put("value", value);
        body.put("nextDueDate", LocalDate.now().toString());
        body.put("cycle", "MONTHLY");
        body.put("description", description);
        body.put("externalReference", "sub:" + rootId + ":" + plan.name());
        JsonNode sub = call("POST", "/subscriptions", body);
        String subId = sub.path("id").asText();
        applyInvoiceSettings(subId);
        String invoiceUrl = firstInvoiceUrl(subId);
        jdbc.update("update subscriptions set pending_plan = :p, pending_subscription_id = :s, pending_invoice_url = :u, "
            + "updated_at = now() where market_id = :m", new MapSqlParameterSource().addValue("m", rootId)
            .addValue("p", plan.name()).addValue("s", subId).addValue("u", invoiceUrl));
        return new Checkout(invoiceUrl, false);
    }

    /** Novo valor mensal (plano + adicionais), já na fatura em aberto. */
    public void updateValue(String subscriptionId, int cents, String description) {
        ObjectNode upd = json.createObjectNode();
        upd.put("value", BigDecimal.valueOf(cents, 2));
        if (description != null) {
            upd.put("description", description);
        }
        upd.put("updatePendingPayments", true);
        call("POST", "/subscriptions/" + subscriptionId, upd);
    }

    /** Pausa: a próxima cobrança vai para depois da pausa. */
    public void reschedule(String subscriptionId, LocalDate nextDueDate) {
        ObjectNode upd = json.createObjectNode();
        upd.put("nextDueDate", nextDueDate.toString());
        upd.put("updatePendingPayments", true);
        call("POST", "/subscriptions/" + subscriptionId, upd);
    }

    public record Invoice(String id, String dueDate, BigDecimal value, String status, String method, String invoiceUrl,
                          String nfseUrl) {}

    /** Faturas da rede no Asaas, com o link da nota fiscal quando houver. */
    public List<Invoice> invoices(UUID rootId) {
        List<String> c = jdbc.queryForList("select customer_id from billing_customers where market_id = :m and provider = 'ASAAS'",
            Map.of("m", rootId), String.class);
        if (c.isEmpty()) {
            return List.of();
        }
        Map<String, String> nfse = new java.util.HashMap<>();
        try {
            for (JsonNode n : call("GET", "/invoices?customer=" + c.get(0) + "&limit=50", null).path("data")) {
                String url = text(n, "pdfUrl");
                if (text(n, "payment") != null && url != null) {
                    nfse.put(text(n, "payment"), url);
                }
            }
        } catch (RuntimeException e) {
            log.debug("Notas fiscais indisponíveis: {}", e.getMessage());
        }
        List<Invoice> out = new java.util.ArrayList<>();
        for (JsonNode p : call("GET", "/payments?customer=" + c.get(0) + "&limit=30", null).path("data")) {
            String ref = text(p, "externalReference");
            if (ref != null && (ref.startsWith("ai:") || ref.startsWith("confere:")) && "PENDING".equals(text(p, "status"))) {
                continue; // Pix de crédito ainda não pago não é fatura da assinatura
            }
            out.add(new Invoice(text(p, "id"), text(p, "dueDate"), p.path("value").decimalValue(), text(p, "status"),
                paymentMethod(text(p, "billingType")), text(p, "invoiceUrl"), nfse.get(text(p, "id"))));
        }
        return out;
    }

    /** Cancela a assinatura no Asaas (as faturas futuras deixam de ser geradas). */
    public void cancelSubscription(String subscriptionId) {
        if (subscriptionId != null && !subscriptionId.isBlank()) {
            call("DELETE", "/subscriptions/" + subscriptionId, null);
        }
    }

    /** Fatura em aberto da assinatura (a vencida primeiro), para o botão "Pagar agora". */
    public Optional<String> openInvoiceUrl(String subscriptionId) {
        if (subscriptionId == null) {
            return Optional.empty();
        }
        for (String status : List.of("OVERDUE", "PENDING")) {
            JsonNode list = call("GET", "/subscriptions/" + subscriptionId + "/payments?status=" + status, null).path("data");
            if (list.isArray() && list.size() > 0) {
                return Optional.ofNullable(text(list.get(0), "invoiceUrl"));
            }
        }
        return Optional.empty();
    }

    // ── Cobrança avulsa (créditos) ───────────────────────────────────────

    /** Pix avulso com QR do próprio Asaas: o aviso de pagamento credita sozinho. */
    public Charge pixCharge(UUID marketId, int cents, String description, String externalReference) {
        UUID root = rootOf(marketId);
        String customer = ensureCustomer(root);
        ObjectNode body = json.createObjectNode();
        body.put("customer", customer);
        body.put("billingType", "PIX");
        body.put("value", BigDecimal.valueOf(cents, 2));
        body.put("dueDate", LocalDate.now().plusDays(2).toString());
        body.put("description", description);
        body.put("externalReference", externalReference);
        JsonNode payment = call("POST", "/payments", body);
        String id = payment.path("id").asText();
        String payload = text(call("GET", "/payments/" + id + "/pixQrCode", null), "payload");
        return new Charge(id, text(payment, "invoiceUrl"), payload);
    }

    // ── Cobrança de quem não é mercado (indústria) ───────────────────────

    /** Cria o cliente no Asaas e devolve o id (a indústria guarda o id na própria tabela). */
    public String createCustomer(String name, String cpfCnpj, String email, String externalReference) {
        ObjectNode body = json.createObjectNode();
        body.put("name", name);
        body.put("cpfCnpj", cpfCnpj);
        if (email != null && !email.isBlank()) {
            body.put("email", email);
        }
        body.put("externalReference", externalReference);
        return call("POST", "/customers", body).path("id").asText();
    }

    /** Fatura avulsa em que o pagador escolhe boleto, Pix ou cartão. */
    public Charge invoice(String customerId, int cents, LocalDate dueDate, String description, String externalReference) {
        ObjectNode body = json.createObjectNode();
        body.put("customer", customerId);
        body.put("billingType", "UNDEFINED");
        body.put("value", BigDecimal.valueOf(cents, 2));
        body.put("dueDate", dueDate.toString());
        body.put("description", description);
        body.put("externalReference", externalReference);
        JsonNode payment = call("POST", "/payments", body);
        return new Charge(payment.path("id").asText(), text(payment, "invoiceUrl"), null);
    }

    // ── Avisos (webhook) ─────────────────────────────────────────────────

    /** Gera um token novo e cadastra (ou recadastra) o aviso de pagamento no Asaas. */
    public String registerWebhook(String alertEmail) {
        if (!cipher.isConfigured()) {
            throw new IllegalStateException("A chave mestra de criptografia (AI_ENCRYPTION_KEY) não está configurada no servidor");
        }
        byte[] raw = new byte[24];
        new SecureRandom().nextBytes(raw);
        String token = "mf_" + HexFormat.of().formatHex(raw);
        String url = publicBaseUrl + "/api/v1/public/asaas/webhook";
        ObjectNode body = json.createObjectNode();
        body.put("name", "MercadoFlow");
        body.put("url", url);
        // Sem e-mail na chamada, vale o e-mail de alerta cadastrado junto com a chave.
        String email = alertEmail != null && !alertEmail.isBlank() ? alertEmail
            : platform.key(PROVIDER).map(AiPlatformConfig.Key::defaultModel).orElse(null);
        if (email != null && !email.isBlank()) {
            body.put("email", email);
        }
        body.put("enabled", true);
        body.put("interrupted", false);
        body.put("apiVersion", 3);
        body.put("authToken", token);
        body.put("sendType", "SEQUENTIALLY");
        var events = body.putArray("events");
        WEBHOOK_EVENTS.forEach(events::add);
        call("POST", "/webhooks", body);
        jdbc.update("update billing_settings set asaas_webhook_token_enc = :t, asaas_webhook_at = now() where id = 1",
            Map.of("t", cipher.encrypt(token)));
        return url;
    }

    public boolean webhookRegistered() {
        return Boolean.TRUE.equals(jdbc.queryForObject("select asaas_webhook_token_enc is not null from billing_settings where id = 1",
            Map.of(), Boolean.class));
    }

    /** Confere o token do aviso em tempo constante. */
    public boolean validToken(String received) {
        if (received == null || received.isBlank() || !cipher.isConfigured()) {
            return false;
        }
        String enc = jdbc.queryForObject("select asaas_webhook_token_enc from billing_settings where id = 1", Map.of(), String.class);
        if (enc == null) {
            return false;
        }
        try {
            return MessageDigest.isEqual(cipher.decrypt(enc).getBytes(StandardCharsets.UTF_8), received.getBytes(StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Marca o aviso como tratado; falso quando ele já tinha chegado antes. */
    public boolean firstDelivery(String eventId, String eventType) {
        return jdbc.update("insert into billing_webhook_events (provider, event_id, event_type) values ('ASAAS', :id, :t) "
            + "on conflict do nothing", Map.of("id", eventId, "t", eventType == null ? "" : eventType)) == 1;
    }

    // ── Nota fiscal ──────────────────────────────────────────────────────

    public Map<String, Object> adminStatus() {
        Map<String, Object> s = jdbc.queryForMap("select nfse_enabled, nfse_service_code, nfse_service_name, nfse_iss_rate, "
            + "nfse_observations, asaas_webhook_token_enc is not null as webhook, asaas_webhook_at from billing_settings where id = 1", Map.of());
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("configured", enabled());
        out.put("webhookRegistered", s.get("webhook"));
        out.put("webhookAt", s.get("asaas_webhook_at"));
        out.put("webhookUrl", publicBaseUrl + "/api/v1/public/asaas/webhook");
        out.put("nfseEnabled", s.get("nfse_enabled"));
        out.put("nfseServiceCode", s.get("nfse_service_code"));
        out.put("nfseServiceName", s.get("nfse_service_name"));
        out.put("nfseIssRate", s.get("nfse_iss_rate"));
        out.put("nfseObservations", s.get("nfse_observations"));
        return out;
    }

    public Map<String, Object> saveInvoiceSettings(Map<String, Object> body) {
        boolean on = Boolean.TRUE.equals(body.get("nfseEnabled"));
        String code = trimOrNull(body.get("nfseServiceCode"), 30);
        String name = trimOrNull(body.get("nfseServiceName"), 250);
        String obs = trimOrNull(body.get("nfseObservations"), 400);
        BigDecimal iss;
        try {
            iss = body.get("nfseIssRate") == null ? BigDecimal.ZERO : new BigDecimal(String.valueOf(body.get("nfseIssRate")).replace(',', '.'));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Alíquota de ISS inválida");
        }
        if (iss.signum() < 0 || iss.compareTo(BigDecimal.valueOf(5)) > 0) {
            throw new IllegalArgumentException("A alíquota de ISS vai de 0 a 5%.");
        }
        if (on && code == null) {
            throw new IllegalArgumentException("Informe o código do serviço municipal para emitir a nota.");
        }
        jdbc.update("update billing_settings set nfse_enabled = :on, nfse_service_code = :c, nfse_service_name = :n, "
            + "nfse_iss_rate = :i, nfse_observations = :o, updated_at = now() where id = 1", new MapSqlParameterSource()
            .addValue("on", on).addValue("c", code).addValue("n", name).addValue("i", iss).addValue("o", obs));
        return adminStatus();
    }

    private static String trimOrNull(Object v, int max) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Com a nota ligada no superadmin, o Asaas emite a NFS-e a cada pagamento confirmado. */
    void applyInvoiceSettings(String subscriptionId) {
        Map<String, Object> s = jdbc.queryForMap("select nfse_enabled, nfse_service_code, nfse_service_name, nfse_iss_rate, "
            + "nfse_observations from billing_settings where id = 1", Map.of());
        if (!Boolean.TRUE.equals(s.get("nfse_enabled")) || s.get("nfse_service_code") == null) {
            return;
        }
        ObjectNode body = json.createObjectNode();
        body.put("municipalServiceCode", String.valueOf(s.get("nfse_service_code")));
        if (s.get("nfse_service_name") != null) {
            body.put("municipalServiceName", String.valueOf(s.get("nfse_service_name")));
        }
        body.put("deductions", 0);
        body.put("effectiveDatePeriod", "ON_PAYMENT_CONFIRMATION");
        body.put("receivedOnly", false);
        if (s.get("nfse_observations") != null) {
            body.put("observations", String.valueOf(s.get("nfse_observations")));
        }
        ObjectNode taxes = body.putObject("taxes");
        taxes.put("retainIss", false);
        taxes.put("iss", (BigDecimal) s.get("nfse_iss_rate"));
        taxes.put("cofins", 0);
        taxes.put("csll", 0);
        taxes.put("inss", 0);
        taxes.put("ir", 0);
        taxes.put("pis", 0);
        try {
            call("POST", "/subscriptions/" + subscriptionId + "/invoiceSettings", body);
        } catch (RuntimeException e) {
            // A cobrança segue; a nota pode ser emitida pelo painel do Asaas.
            log.warn("Nota fiscal automática não configurada na assinatura {}: {}", subscriptionId, e.getMessage());
            if (insights != null) {
                insights.exception("NFSE_CONFIG", null, subscriptionId,
                    "A nota fiscal automática não foi configurada na assinatura " + subscriptionId + ": " + e.getMessage());
            }
        }
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    String firstInvoiceUrl(String subscriptionId) {
        JsonNode list = call("GET", "/subscriptions/" + subscriptionId + "/payments", null).path("data");
        if (list.isArray() && list.size() > 0) {
            return text(list.get(0), "invoiceUrl");
        }
        throw new IllegalStateException("O Asaas não gerou a primeira fatura. Tente novamente em instantes.");
    }

    UUID rootOf(UUID marketId) {
        List<UUID> r = jdbc.queryForList("select coalesce(parent_market_id, id) from markets where id = :m", Map.of("m", marketId), UUID.class);
        return r.isEmpty() ? marketId : r.get(0);
    }

    /** Chamada à API do Asaas. Erro vira mensagem em português, sem a chave. */
    JsonNode call(String method, String path, JsonNode body) {
        AiPlatformConfig.Key key = platform.key(PROVIDER)
            .orElseThrow(() -> new IllegalStateException("Pagamento por Pix e boleto ainda não está disponível."));
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create(key.baseUrl() + path)).timeout(Duration.ofSeconds(20))
            .header("access_token", key.apiKey()).header("User-Agent", "MercadoFlow").header("Accept", "application/json");
        if (body != null) {
            b.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body.toString()));
        } else {
            b.method(method, HttpRequest.BodyPublishers.noBody());
        }
        try {
            HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            JsonNode node = r.body() == null || r.body().isBlank() ? json.createObjectNode() : json.readTree(r.body());
            if (r.statusCode() >= 200 && r.statusCode() < 300) {
                return node;
            }
            throw new IllegalStateException("O Asaas recusou a operação: " + errorText(node, r.statusCode()));
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Falha de comunicação com o Asaas em {} {}: {}", method, path, e.getMessage());
            throw new IllegalStateException("Não foi possível falar com o Asaas agora. Tente novamente em instantes.");
        }
    }

    static String errorText(JsonNode node, int status) {
        JsonNode errors = node.path("errors");
        if (errors.isArray() && errors.size() > 0) {
            String d = errors.get(0).path("description").asText("");
            if (!d.isBlank()) {
                return d.length() > 200 ? d.substring(0, 200) : d;
            }
        }
        return "HTTP " + status;
    }

    static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() || v.asText().isBlank() ? null : v.asText();
    }

    /** Fim do período pago: um mês depois do vencimento da fatura paga. */
    static LocalDateTime periodEnd(String dueDate) {
        try {
            return LocalDate.parse(dueDate).plusMonths(1).atStartOfDay();
        } catch (RuntimeException e) {
            return LocalDate.now().plusMonths(1).atStartOfDay();
        }
    }

    static String paymentMethod(String billingType) {
        return switch (billingType == null ? "" : billingType) {
            case "PIX" -> "PIX";
            case "BOLETO" -> "BOLETO";
            case "CREDIT_CARD" -> "CARTAO";
            default -> billingType;
        };
    }
}
