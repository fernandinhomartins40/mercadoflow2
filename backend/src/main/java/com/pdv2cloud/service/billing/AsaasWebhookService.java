package com.pdv2cloud.service.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import com.pdv2cloud.service.confere.ConfereService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Avisos de pagamento do Asaas. Cada aviso é tratado uma vez só (o Asaas
 * reenvia até receber 200):
 * <ul>
 *   <li>pagamento confirmado de crédito de IA ou do Confere: credita;</li>
 *   <li>pagamento confirmado da assinatura: plano ativo até o próximo mês;</li>
 *   <li>fatura da assinatura vencida: entra em atraso (carência, depois só consulta);</li>
 *   <li>assinatura apagada no Asaas: cancela no fim do período pago.</li>
 * </ul>
 */
@Service
public class AsaasWebhookService {

    private static final Logger log = LoggerFactory.getLogger(AsaasWebhookService.class);

    public enum Outcome { DUPLICATE, IGNORED, CREDITS_AI, CREDITS_CONFERE, SUBSCRIPTION_PAID, SUBSCRIPTION_LATE, SUBSCRIPTION_CANCELED,
        EXCEPTION, INDUSTRY_PAID, INDUSTRY_LATE }

    private BillingInsightsService insights;
    private NotificationService notifications;

    private com.pdv2cloud.service.industry.IndustryBillingService industryBilling;

    /** Faturas da indústria chegam com a referência "ind:<fatura>". */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setIndustryBilling(com.pdv2cloud.service.industry.IndustryBillingService industryBilling) {
        this.industryBilling = industryBilling;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setInsights(BillingInsightsService insights, NotificationService notifications) {
        this.insights = insights;
        this.notifications = notifications;
    }

    private final AsaasService asaas;
    private final SubscriptionService subscriptions;
    private final AiWalletService wallets;
    private final ConfereService confere;
    private final NamedParameterJdbcTemplate jdbc;

    public AsaasWebhookService(AsaasService asaas, SubscriptionService subscriptions, AiWalletService wallets,
                               ConfereService confere, NamedParameterJdbcTemplate jdbc) {
        this.asaas = asaas;
        this.subscriptions = subscriptions;
        this.wallets = wallets;
        this.confere = confere;
        this.jdbc = jdbc;
    }

    @org.springframework.transaction.annotation.Transactional
    public Outcome handle(JsonNode body) {
        String event = AsaasService.text(body, "event");
        JsonNode payment = body.path("payment");
        String paymentId = AsaasService.text(payment, "id");
        String eventId = AsaasService.text(body, "id");
        if (eventId == null) {
            eventId = event + ":" + (paymentId != null ? paymentId : AsaasService.text(body.path("subscription"), "id"));
        }
        if (event == null || !asaas.firstDelivery(eventId, event)) {
            return Outcome.DUPLICATE;
        }
        String ref = AsaasService.text(payment, "externalReference");
        String subId = AsaasService.text(payment, "subscription");
        switch (event) {
            case "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED" -> {
                if (ref != null && ref.startsWith("ai:")) {
                    wallets.markPaidByGateway(UUID.fromString(ref.substring(3)));
                    return Outcome.CREDITS_AI;
                }
                if (ref != null && ref.startsWith("confere:")) {
                    confere.markOrderPaidByGateway(UUID.fromString(ref.substring(8)));
                    return Outcome.CREDITS_CONFERE;
                }
                if (ref != null && ref.startsWith("ind:") && industryBilling != null) {
                    industryBilling.markPaid(UUID.fromString(ref.substring(4)), "asaas");
                    return Outcome.INDUSTRY_PAID;
                }
                if (subId != null) {
                    return subscriptionPaid(subId, ref, payment);
                }
            }
            case "PAYMENT_OVERDUE" -> {
                if (ref != null && ref.startsWith("ind:") && industryBilling != null) {
                    industryBilling.markOverdue(UUID.fromString(ref.substring(4)));
                    return Outcome.INDUSTRY_LATE;
                }
                if (subId != null) {
                    UUID root = activeRoot(subId);
                    if (root != null) {
                        subscriptions.paymentFailed(root, "Fatura do Asaas vencida");
                        return Outcome.SUBSCRIPTION_LATE;
                    }
                }
            }
            case "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE" -> {
                if (insights != null) {
                    UUID root = subId == null ? null : anyRoot(subId);
                    insights.exception(event, root, paymentId, (event.equals("PAYMENT_REFUNDED") ? "Pagamento estornado" : "Pagamento contestado")
                        + " no Asaas: " + paymentId + " (" + AsaasService.text(payment, "value") + ")"
                        + (ref == null ? "" : ", referência " + ref) + ".");
                    return Outcome.EXCEPTION;
                }
            }
            case "INVOICE_ERROR" -> {
                if (insights != null) {
                    JsonNode inv = body.path("invoice");
                    insights.exception("NFSE_ERROR", null, AsaasService.text(inv, "id"), "Nota fiscal recusada: "
                        + AsaasService.text(inv, "statusDescription") + " (pagamento " + AsaasService.text(inv, "payment") + ").");
                    return Outcome.EXCEPTION;
                }
            }
            case "SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED" -> {
                String id = AsaasService.text(body.path("subscription"), "id");
                UUID root = id == null ? null : activeRoot(id);
                if (root != null) {
                    subscriptions.cancel(root, true, "Assinatura encerrada no Asaas");
                    return Outcome.SUBSCRIPTION_CANCELED;
                }
            }
            default -> { }
        }
        log.debug("Aviso do Asaas sem ação: {} {}", event, paymentId);
        return Outcome.IGNORED;
    }

    private Outcome subscriptionPaid(String subId, String ref, JsonNode payment) {
        List<Map<String, Object>> rows = jdbc.queryForList("select market_id, pending_plan, pending_subscription_id, plan_code "
            + "from subscriptions where pending_subscription_id = :s or provider_subscription_id = :s", Map.of("s", subId));
        UUID root;
        String plan;
        if (!rows.isEmpty()) {
            Map<String, Object> r = rows.get(0);
            root = (UUID) r.get("market_id");
            plan = subId.equals(r.get("pending_subscription_id")) ? (String) r.get("pending_plan") : (String) r.get("plan_code");
        } else if (ref != null && ref.startsWith("sub:") && ref.split(":").length == 3) {
            // A fatura herda a referência da assinatura: "sub:<rede>:<plano>".
            String[] parts = ref.split(":");
            root = UUID.fromString(parts[1]);
            plan = parts[2];
        } else {
            log.warn("Pagamento do Asaas de assinatura desconhecida {}", subId);
            if (insights != null) {
                insights.exception("UNKNOWN_SUBSCRIPTION", null, AsaasService.text(payment, "id"),
                    "Pagamento recebido de uma assinatura que o MercadoFlow não conhece: " + subId + ".");
            }
            return Outcome.IGNORED;
        }
        subscriptions.paymentConfirmed(root, PlanType.fromString(plan), AsaasService.PROVIDER,
            AsaasService.text(payment, "customer"), subId, AsaasService.paymentMethod(AsaasService.text(payment, "billingType")),
            AsaasService.periodEnd(AsaasService.text(payment, "dueDate")), "Pagamento Asaas " + AsaasService.text(payment, "id"));
        String paymentId = AsaasService.text(payment, "id");
        int cents = payment.path("value").decimalValue().movePointRight(2).intValue();
        if (insights != null) {
            insights.recordPayment(AsaasService.PROVIDER, paymentId, root, "SUBSCRIPTION", cents,
                AsaasService.paymentMethod(AsaasService.text(payment, "billingType")));
        }
        if (notifications != null) {
            notifications.notify(root, "PAYMENT_CONFIRMED", "paid:" + paymentId, NotificationService.Severity.INFO,
                "Pagamento confirmado", "Recebemos o pagamento da assinatura.", "Minha assinatura", "/app/assinatura", true,
                Map.of("valor", java.text.NumberFormat.getCurrencyInstance(new java.util.Locale("pt", "BR")).format(cents / 100.0).replace('\u00a0', ' '),
                    "plano", PlanType.fromString(plan).getDisplayName(),
                    "data", AsaasService.periodEnd(AsaasService.text(payment, "dueDate")).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM"))));
        }
        return Outcome.SUBSCRIPTION_PAID;
    }

    private UUID anyRoot(String subId) {
        List<UUID> r = jdbc.queryForList("select market_id from subscriptions where provider_subscription_id = :s or pending_subscription_id = :s",
            Map.of("s", subId), UUID.class);
        return r.isEmpty() ? null : r.get(0);
    }

    /** Rede cuja assinatura ativa no Asaas é esta (contratação pendente não conta). */
    private UUID activeRoot(String subId) {
        List<UUID> r = jdbc.queryForList("select market_id from subscriptions where provider = 'ASAAS' and provider_subscription_id = :s",
            Map.of("s", subId), UUID.class);
        return r.isEmpty() ? null : r.get(0);
    }
}
