package com.pdv2cloud.service.billing;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Desistência em 7 dias (CDC art. 49; parecer em docs/pie/juridico/PARECER_LGPD.md, item S2).
 *
 * Regra: vale para a PRIMEIRA assinatura paga da conta (renovação não conta),
 * dentro de 7 dias corridos do primeiro pagamento confirmado. O pagamento é
 * estornado por inteiro no Asaas e a assinatura volta ao Grátis na hora.
 *
 * Ordem: grava o pedido (REQUESTED), estorna, cancela. Se o Asaas recusar o
 * estorno, o pedido fica FAILED e a assinatura não muda. O método não é
 * transacional de propósito: o pedido precisa estar gravado antes de o aviso
 * PAYMENT_REFUNDED chegar ao webhook (ver {@link #refundedByWithdrawal}).
 */
@Service
public class WithdrawalService {

    private static final Logger log = LoggerFactory.getLogger(WithdrawalService.class);
    public static final int DAYS = 7;
    static final String DESCRIPTION = "Desistência da contratação em 7 dias (CDC art. 49)";

    /** Pagamento da assinatura registrado na confirmação (billing_payments). */
    public record Payment(String paymentId, int valueCents, LocalDateTime paidAt) {}

    /** Se pode desistir agora, até quando e quanto volta. */
    public record Eligibility(boolean eligible, String reason, LocalDateTime deadline, Integer valueCents, String paymentId) {
        Map<String, Object> view() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("eligible", eligible);
            out.put("reason", reason);
            out.put("deadline", deadline);
            out.put("valueCents", valueCents);
            return out;
        }
    }

    private final SubscriptionService subscriptions;
    private final AsaasService asaas;
    private final NamedParameterJdbcTemplate jdbc;
    private BillingInsightsService insights;

    public WithdrawalService(SubscriptionService subscriptions, AsaasService asaas, NamedParameterJdbcTemplate jdbc) {
        this.subscriptions = subscriptions;
        this.asaas = asaas;
        this.jdbc = jdbc;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setInsights(BillingInsightsService insights) {
        this.insights = insights;
    }

    /** Regra pura: assinatura, pagamentos de assinatura da conta (todos), desistência anterior e agora. */
    static Eligibility evaluate(SubscriptionService.Subscription s, List<Payment> payments, boolean withdrewBefore,
                                LocalDateTime now) {
        if (s == null || !AsaasService.PROVIDER.equals(s.provider()) || s.providerSubscriptionId() == null
            || (s.status() != SubscriptionService.Status.ACTIVE && s.status() != SubscriptionService.Status.PAST_DUE)) {
            return new Eligibility(false, "Não há assinatura paga pelo site para desistir.", null, null, null);
        }
        if (withdrewBefore) {
            return new Eligibility(false, "A desistência em 7 dias já foi usada nesta conta.", null, null, null);
        }
        if (payments == null || payments.isEmpty()) {
            return new Eligibility(false, "O pagamento ainda não foi confirmado.", null, null, null);
        }
        if (payments.size() > 1) {
            // Renovação (ou contratação anterior): o direito vale só para a primeira contratação paga.
            return new Eligibility(false, "A desistência vale só para a primeira contratação, não para renovações.", null, null, null);
        }
        Payment first = payments.get(0);
        LocalDateTime deadline = first.paidAt().plusDays(DAYS);
        if (now.isAfter(deadline)) {
            return new Eligibility(false, "O prazo de 7 dias para desistir terminou.", deadline, first.valueCents(), first.paymentId());
        }
        return new Eligibility(true, null, deadline, first.valueCents(), first.paymentId());
    }

    /** Situação da conta (rede inteira, pela matriz) para a tela "Minha assinatura". */
    public Eligibility eligibility(UUID root) {
        return evaluate(subscriptions.of(root), payments(root), withdrewBefore(root), LocalDateTime.now());
    }

    public Map<String, Object> view(UUID root) {
        return eligibility(root).view();
    }

    /**
     * Desiste: estorna o pagamento no Asaas e volta ao Grátis. Recusa (sem mudar
     * nada) fora do prazo, em renovação ou se o Asaas não estornar.
     */
    public SubscriptionService.Subscription withdraw(UUID root, String reason, String comment, String actor) {
        SubscriptionService.Subscription s = subscriptions.of(root);
        Eligibility e = evaluate(s, payments(root), withdrewBefore(root), LocalDateTime.now());
        if (!e.eligible()) {
            throw new IllegalStateException(e.reason());
        }
        try {
            jdbc.update("insert into subscription_withdrawals (market_id, payment_id, provider_subscription_id, plan_code, value_cents, "
                    + "status, reason, comment, actor) values (:m, :p, :sid, :plan, :v, 'REQUESTED', :r, :c, :a)",
                new MapSqlParameterSource().addValue("m", root).addValue("p", e.paymentId())
                    .addValue("sid", s.providerSubscriptionId()).addValue("plan", s.planCode()).addValue("v", e.valueCents())
                    .addValue("r", reason).addValue("c", comment == null ? null : comment.length() > 600 ? comment.substring(0, 600) : comment)
                    .addValue("a", actor));
        } catch (DuplicateKeyException dup) {
            throw new IllegalStateException("A desistência já foi pedida. Atualize a página.");
        }

        try {
            asaas.refundPayment(e.paymentId(), DESCRIPTION);
        } catch (RuntimeException fail) {
            log.warn("Desistência da rede {}: estorno do pagamento {} recusado: {}", root, e.paymentId(), fail.getMessage());
            jdbc.update("update subscription_withdrawals set status = 'FAILED', error = :err, finished_at = now() "
                    + "where market_id = :m and status = 'REQUESTED'",
                new MapSqlParameterSource().addValue("m", root).addValue("err", trim(fail.getMessage(), 300)));
            throw new IllegalStateException("Não conseguimos estornar o pagamento agora. Nada foi alterado. "
                + (fail.getMessage() == null ? "" : fail.getMessage()));
        }

        // O dinheiro já voltou: daqui em diante nada desfaz a desistência.
        try {
            asaas.cancelSubscription(s.providerSubscriptionId());
        } catch (RuntimeException fail) {
            log.error("Desistência da rede {}: estornado, mas a assinatura {} não foi apagada no Asaas: {}",
                root, s.providerSubscriptionId(), fail.getMessage());
            if (insights != null) {
                insights.exception("WITHDRAWAL_CANCEL", root, s.providerSubscriptionId(),
                    "Desistência em 7 dias: pagamento estornado, mas a assinatura não foi apagada no Asaas. Apague à mão para não cobrar de novo.");
            }
        }
        String note = "Desistência em 7 dias (CDC art. 49) por " + actor + ": " + reason;
        SubscriptionService.Subscription after = subscriptions.cancel(root, false, note);
        subscriptions.recordExit(root, reason, comment, "WITHDRAWN", actor);
        jdbc.update("update subscription_withdrawals set status = 'DONE', finished_at = now() where market_id = :m and status = 'REQUESTED'",
            new MapSqlParameterSource().addValue("m", root));
        log.info("Desistência em 7 dias concluída | rede={} | pagamento={} | valor={}", root, e.paymentId(), e.valueCents());
        return after;
    }

    /** O aviso de estorno é da desistência (pedida ou concluída)? Aí o webhook não repete o fluxo D-01. */
    public boolean refundedByWithdrawal(String paymentId) {
        if (paymentId == null) {
            return false;
        }
        Integer n = jdbc.queryForObject("select count(*) from subscription_withdrawals where payment_id = :p "
            + "and status in ('REQUESTED', 'DONE')", Map.of("p", paymentId), Integer.class);
        return n != null && n > 0;
    }

    List<Payment> payments(UUID root) {
        List<Map<String, Object>> rows = jdbc.queryForList("select payment_id, value_cents, paid_at from billing_payments "
            + "where market_id = :m and kind = 'SUBSCRIPTION' order by paid_at", Map.of("m", root));
        return rows.stream().map(r -> new Payment((String) r.get("payment_id"),
            r.get("value_cents") instanceof Number n ? n.intValue() : 0, toTime(r.get("paid_at")))).toList();
    }

    boolean withdrewBefore(UUID root) {
        Integer n = jdbc.queryForObject("select count(*) from subscription_withdrawals where market_id = :m and status = 'DONE'",
            Map.of("m", root), Integer.class);
        return n != null && n > 0;
    }

    private static LocalDateTime toTime(Object v) {
        if (v instanceof Timestamp t) {
            return t.toLocalDateTime();
        }
        if (v instanceof LocalDateTime l) {
            return l;
        }
        // Data ilegível: trata como antiga (fora do prazo), nunca como "agora".
        return LocalDateTime.of(1970, 1, 1, 0, 0);
    }

    private static String trim(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
