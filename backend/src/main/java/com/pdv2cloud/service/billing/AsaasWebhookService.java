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
 *   <li>assinatura apagada no Asaas: cancela no fim do período pago;</li>
 *   <li>estorno ou contestação: alerta, retira os créditos não usados do pacote ou põe a assinatura em atraso (D-01);</li>
 *   <li>estorno pedido pela desistência em 7 dias: só registra (a assinatura já voltou ao Grátis).</li>
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

    private WithdrawalService withdrawals;

    /** Estornos da desistência em 7 dias não repetem o fluxo de estorno/atraso. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setWithdrawals(WithdrawalService withdrawals) {
        this.withdrawals = withdrawals;
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
                    UUID id = uuid(ref.substring(3));
                    if (id == null) {
                        return ignoredRef(ref);
                    }
                    wallets.markPaidByGateway(id);
                    return Outcome.CREDITS_AI;
                }
                if (ref != null && ref.startsWith("confere:")) {
                    UUID id = uuid(ref.substring(8));
                    if (id == null) {
                        return ignoredRef(ref);
                    }
                    confere.markOrderPaidByGateway(id);
                    return Outcome.CREDITS_CONFERE;
                }
                if (ref != null && ref.startsWith("ind:") && industryBilling != null) {
                    UUID id = uuid(ref.substring(4));
                    if (id == null) {
                        return ignoredRef(ref);
                    }
                    industryBilling.markPaid(id, "asaas");
                    return Outcome.INDUSTRY_PAID;
                }
                if (subId != null) {
                    return subscriptionPaid(subId, ref, payment);
                }
            }
            case "PAYMENT_OVERDUE" -> {
                if (ref != null && ref.startsWith("ind:") && industryBilling != null) {
                    UUID id = uuid(ref.substring(4));
                    if (id == null) {
                        return ignoredRef(ref);
                    }
                    industryBilling.markOverdue(id);
                    return Outcome.INDUSTRY_LATE;
                }
                if (subId != null) {
                    // Aviso fora de ordem: o vencimento de uma fatura que já foi paga
                    // (confirmação chegou antes) não põe a conta em atraso (REC-05).
                    if (alreadyPaid(paymentId)) {
                        log.info("Vencimento do Asaas para fatura já paga {}: ignorado", paymentId);
                        return Outcome.IGNORED;
                    }
                    UUID root = activeRoot(subId);
                    if (root != null) {
                        subscriptions.paymentFailed(root, "Fatura do Asaas vencida");
                        return Outcome.SUBSCRIPTION_LATE;
                    }
                }
            }
            case "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE" -> {
                // Estorno que nós mesmos pedimos na desistência em 7 dias: a assinatura
                // já foi cancelada (ou está sendo); não entra em atraso nem vira alerta.
                if (event.equals("PAYMENT_REFUNDED") && withdrawals != null && withdrawals.refundedByWithdrawal(paymentId)) {
                    log.info("Estorno {} da desistência em 7 dias: nada a fazer", paymentId);
                    return Outcome.IGNORED;
                }
                UUID root = subId == null ? null : anyRoot(subId);
                // A conta do Asaas é compartilhada com outros sistemas: estorno alheio não vira alerta aqui.
                if (root != null || ours(ref)) {
                    String reason = event.equals("PAYMENT_REFUNDED") ? "Pagamento estornado" : "Pagamento contestado";
                    String effect = reverse(ref, root, reason);
                    if (insights != null) {
                        insights.exception(event, root, paymentId, reason
                            + " no Asaas: " + paymentId + " (" + AsaasService.text(payment, "value") + ")"
                            + (ref == null ? "" : ", referência " + ref) + "." + (effect == null ? "" : " " + effect));
                    }
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
            root = uuid(parts[1]);
            plan = parts[2];
            if (root == null) {
                return ignoredRef(ref);
            }
        } else if (!ours(ref)) {
            // Assinatura de outro sistema que usa a mesma conta do Asaas.
            log.debug("Pagamento do Asaas que não é do MercadoFlow: assinatura {}", subId);
            return Outcome.IGNORED;
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

    /**
     * Efeito do estorno ou da contestação (D-01): pacote de IA ou do Confere
     * perde os créditos ainda não usados; assinatura entra em atraso (carência
     * normal, depois só consulta). Devolve o resumo para o alerta.
     */
    private String reverse(String ref, UUID root, String reason) {
        if (ref != null && ref.startsWith("ai:")) {
            UUID id = uuid(ref.substring(3));
            return id == null ? null : "Créditos de IA retirados: " + wallets.reverseOrder(id, reason) + ".";
        }
        if (ref != null && ref.startsWith("confere:")) {
            UUID id = uuid(ref.substring(8));
            return id == null ? null : "Leituras do Confere retiradas: " + confere.reverseOrder(id, reason) + ".";
        }
        if (root != null) {
            SubscriptionService.Subscription s = subscriptions.paymentFailed(root, reason + " no Asaas");
            return s == null ? null : "Assinatura: " + s.status() + ".";
        }
        return null;
    }

    /** Referências que o MercadoFlow põe nas cobranças; o resto é de outro sistema na mesma conta. */
    static boolean ours(String ref) {
        return ref != null && (ref.startsWith("ai:") || ref.startsWith("confere:") || ref.startsWith("ind:") || ref.startsWith("sub:"));
    }

    static UUID uuid(String s) {
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Referência malformada: 200 sem ação, para o Asaas não reenviar nem pausar a fila. */
    private Outcome ignoredRef(String ref) {
        log.warn("Aviso do Asaas com referência inválida: {}", ref);
        return Outcome.IGNORED;
    }

    /** Esta cobrança já teve o pagamento registrado (billing_payments, gravado na confirmação)? */
    private boolean alreadyPaid(String paymentId) {
        if (paymentId == null) {
            return false;
        }
        Integer n = jdbc.queryForObject("select count(*) from billing_payments where provider = :p and payment_id = :id",
            Map.of("p", AsaasService.PROVIDER, "id", paymentId), Integer.class);
        return n != null && n > 0;
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
