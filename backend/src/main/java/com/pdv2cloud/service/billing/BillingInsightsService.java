package com.pdv2cloud.service.billing;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * O que o superadmin precisa ver sem abrir planilha: receita (MRR por plano e
 * adicional, créditos, recebido no mês e previsão), churn, conversão do
 * teste, inadimplência por idade; a ficha de cada conta; e a fila de exceções
 * (só o que o automático não resolveu).
 */
@Service
public class BillingInsightsService {

    private static final Logger log = LoggerFactory.getLogger(BillingInsightsService.class);

    private final NamedParameterJdbcTemplate jdbc;

    public BillingInsightsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── Registro ─────────────────────────────────────────────────────────

    /** Pagamento recebido (uma vez por pagamento do provedor). */
    public void recordPayment(String provider, String paymentId, UUID marketId, String kind, int valueCents, String method) {
        if (paymentId == null) {
            return;
        }
        jdbc.update("insert into billing_payments (provider, payment_id, market_id, kind, value_cents, method) "
                + "values (:p, :id, :m, :k, :v, :me) on conflict (provider, payment_id) do nothing",
            new MapSqlParameterSource().addValue("p", provider).addValue("id", paymentId).addValue("m", marketId)
                .addValue("k", kind).addValue("v", valueCents).addValue("me", method));
    }

    /** Algo que o automático não resolve: vai para a fila do superadmin (uma vez por referência). */
    public void exception(String kind, UUID marketId, String providerRef, String detail) {
        try {
            jdbc.update("insert into billing_exceptions (kind, market_id, provider_ref, detail) values (:k, :m, :r, :d) "
                    + "on conflict do nothing",
                new MapSqlParameterSource().addValue("k", kind).addValue("m", marketId).addValue("r", providerRef)
                    .addValue("d", detail.length() > 600 ? detail.substring(0, 600) : detail));
        } catch (RuntimeException e) {
            log.warn("Exceção de cobrança não registrada ({}): {}", kind, e.getMessage());
        }
    }

    public List<Map<String, Object>> exceptions(String status) {
        return jdbc.queryForList("select e.*, m.name as market_name from billing_exceptions e left join markets m on m.id = e.market_id "
                + "where (cast(:s as varchar) is null or e.status = :s) order by e.created_at desc limit 200",
            new MapSqlParameterSource().addValue("s", status == null || status.isBlank() ? null : status));
    }

    public void resolve(long id, String resolution, String actor) {
        int n = jdbc.update("update billing_exceptions set status = 'RESOLVED', resolution = :r, resolved_by = :a, resolved_at = now() "
                + "where id = :id and status = 'OPEN'",
            new MapSqlParameterSource().addValue("id", id).addValue("r", resolution == null || resolution.isBlank() ? null : resolution.trim())
                .addValue("a", actor));
        if (n == 0) {
            throw new IllegalArgumentException("Exceção já resolvida ou inexistente");
        }
    }

    // ── Receita ──────────────────────────────────────────────────────────

    private static final String ACTIVE = "select s.market_id, s.plan_code, s.current_period_end, s.cancel_at_period_end from subscriptions s "
        + "where s.status in ('ACTIVE', 'PAST_DUE')";
    private static final String PLAN_PRICE = "case when c.monthly_price_cents >= 0 then c.monthly_price_cents else coalesce(m.custom_price_cents, 0) end";

    public Map<String, Object> revenue() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> byPlan = jdbc.queryForList("select a.plan_code, count(*) as accounts, coalesce(sum(" + PLAN_PRICE + "), 0) as cents "
            + "from (" + ACTIVE + ") a join plan_catalog c on c.code = a.plan_code join markets m on m.id = a.market_id "
            + "group by a.plan_code order by cents desc", Map.of());
        List<Map<String, Object>> byAddon = jdbc.queryForList("select ad.code, ad.name, coalesce(sum(sa.quantity), 0) as quantity, "
            + "coalesce(sum(sa.quantity * ad.monthly_price_cents), 0) as cents from subscription_addons sa "
            + "join addon_catalog ad on ad.code = sa.addon_code join (" + ACTIVE + ") a on a.market_id = sa.market_id "
            + "group by ad.code, ad.name order by cents desc", Map.of());
        long planMrr = byPlan.stream().mapToLong(r -> ((Number) r.get("cents")).longValue()).sum();
        long addonMrr = byAddon.stream().mapToLong(r -> ((Number) r.get("cents")).longValue()).sum();
        out.put("mrrCents", planMrr + addonMrr);
        out.put("mrrByPlan", byPlan);
        out.put("mrrByAddon", byAddon);

        LocalDate monthStart = LocalDate.now().withDayOfMonth(1);
        Map<String, Object> m = Map.of("ms", java.sql.Date.valueOf(monthStart));
        long credits30 = num("select coalesce(sum(amount_cents), 0) from ai_orders where status = 'PAID' and paid_at > now() - interval '30 days'")
            + num("select coalesce(sum(amount_cents), 0) from confere_orders where status = 'PAID' and paid_at > now() - interval '30 days'");
        long creditsMonth = num("select coalesce(sum(amount_cents), 0) from ai_orders where status = 'PAID' and paid_at >= :ms", m)
            + num("select coalesce(sum(amount_cents), 0) from confere_orders where status = 'PAID' and paid_at >= :ms", m);
        long subsMonth = num("select coalesce(sum(value_cents), 0) from billing_payments where kind = 'SUBSCRIPTION' and paid_at >= :ms", m);
        out.put("creditsLast30Cents", credits30);
        out.put("receivedThisMonthCents", subsMonth + creditsMonth);
        out.put("receivedSubscriptionsThisMonthCents", subsMonth);
        out.put("receivedCreditsThisMonthCents", creditsMonth);
        // Previsão: o que já entrou + renovações que vencem até o fim do mês (sem as canceladas).
        long expected = num("select coalesce(sum(" + PLAN_PRICE + " + coalesce((select sum(sa.quantity * ad.monthly_price_cents) "
            + "from subscription_addons sa join addon_catalog ad on ad.code = sa.addon_code where sa.market_id = a.market_id), 0)), 0) "
            + "from (" + ACTIVE + ") a join plan_catalog c on c.code = a.plan_code join markets m on m.id = a.market_id "
            + "where not a.cancel_at_period_end and a.current_period_end >= now() "
            + "and a.current_period_end < (date_trunc('month', now()) + interval '1 month')");
        out.put("forecastMonthCents", subsMonth + creditsMonth + expected);

        long paying = num("select count(*) from subscriptions where status in ('ACTIVE', 'PAST_DUE', 'RESTRICTED')");
        long churned = num("select count(distinct market_id) from subscription_events where event_type = 'PLAN_CHANGED' "
            + "and to_plan = 'FREE' and from_plan <> 'FREE' and created_at > now() - interval '30 days' "
            + "and coalesce(reason, '') not like 'Teste grátis terminou%'");
        out.put("payingAccounts", paying);
        out.put("churned30", churned);
        out.put("churnRate30", paying + churned == 0 ? 0d : round(churned * 100d / (paying + churned)));

        long trials = num("select count(*) from subscriptions where trial_used and status <> 'TRIAL'");
        long converted = num("select count(*) from subscriptions where trial_used and status in ('ACTIVE', 'PAST_DUE') "
            + "and provider in ('ASAAS', 'STRIPE')");
        out.put("trialsFinished", trials);
        out.put("trialsConverted", converted);
        out.put("trialsRunning", num("select count(*) from subscriptions where status = 'TRIAL'"));
        out.put("trialConversionRate", trials == 0 ? 0d : round(converted * 100d / trials));

        out.put("delinquency", jdbc.queryForList("select bucket, count(*) as accounts, coalesce(sum(cents), 0) as cents from ("
            + "select case when s.status = 'PAST_DUE' and s.past_due_since > now() - interval '3 days' then '1 a 3 dias' "
            + "when s.status = 'PAST_DUE' then '4 dias ou mais (carência)' "
            + "when s.restricted_since > now() - interval '15 days' then 'Só consulta, até 15 dias' "
            + "else 'Só consulta, 16 dias ou mais' end as bucket, " + PLAN_PRICE + " as cents "
            + "from subscriptions s join plan_catalog c on c.code = s.plan_code join markets m on m.id = s.market_id "
            + "where s.status in ('PAST_DUE', 'RESTRICTED')) x group by bucket order by bucket", Map.of()));
        out.put("openExceptions", num("select count(*) from billing_exceptions where status = 'OPEN'"));
        return out;
    }

    // ── Ficha da conta ───────────────────────────────────────────────────

    public Map<String, Object> account(UUID root) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> mp = Map.of("m", root);
        out.put("events", jdbc.queryForList("select event_type, from_plan, to_plan, from_status, to_status, reason, actor_email, created_at "
            + "from subscription_events where market_id = :m order by created_at desc limit 40", mp));
        out.put("payments", jdbc.queryForList("select provider, payment_id, kind, value_cents, method, paid_at from billing_payments "
            + "where market_id = :m union all select 'PIX', id::text, 'AI', amount_cents, method, paid_at from ai_orders "
            + "where market_id = :m and status = 'PAID' union all select 'PIX', id::text, 'CONFERE', amount_cents, method, paid_at "
            + "from confere_orders where market_id = :m and status = 'PAID' order by paid_at desc limit 40", mp));
        out.put("notices", jdbc.queryForList("select kind, title, created_at, emailed_at, whatsapp_at, read_at, hidden from app_notifications "
            + "where market_id = :m order by created_at desc limit 40", mp));
        out.put("exits", jdbc.queryForList("select reason, comment, outcome, actor, created_at from subscription_cancel_feedback "
            + "where market_id = :m order by created_at desc", mp));
        out.put("exceptions", jdbc.queryForList("select id, kind, detail, status, created_at from billing_exceptions where market_id = :m "
            + "order by created_at desc limit 20", mp));
        return out;
    }

    private long num(String sql) {
        return num(sql, Map.of());
    }

    private long num(String sql, Map<String, Object> params) {
        Number n = jdbc.queryForObject(sql, params, Number.class);
        return n == null ? 0 : n.longValue();
    }

    private static double round(double v) {
        return Math.round(v * 10) / 10d;
    }
}
