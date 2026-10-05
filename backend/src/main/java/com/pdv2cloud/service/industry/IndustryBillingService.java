package com.pdv2cloud.service.industry;

import com.pdv2cloud.service.billing.AsaasService;
import java.sql.Date;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cobrança por produto analisado: taxa base do pacote + preço por GTIN que
 * esteve aprovado em algum dia do mês, com desconto por volume (acima de 100
 * GTINs, 15% na parte dos GTINs; acima de 500, 30%) e o desconto do contrato.
 * Mês com contrato só em parte paga a parte (pró-rata pelos dias de vigência).
 */
@Service
@Slf4j
public class IndustryBillingService {

    /** Dias de atraso depois do vencimento até suspender o acesso. */
    static final int GRACE_DAYS = 7;

    public record Bill(UUID contractId, String number, UUID industryId, String industry, LocalDate month, int gtins,
                       int baseCents, int gtinCents, int discountCents, int amountCents, double activeFraction) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final AsaasService asaas;
    private final IndustryAdminService admin;

    public IndustryBillingService(NamedParameterJdbcTemplate jdbc, AsaasService asaas, IndustryAdminService admin) {
        this.jdbc = jdbc;
        this.asaas = asaas;
        this.admin = admin;
    }

    public Bill compute(UUID contractId, YearMonth ym) {
        Map<String, Object> c = admin.contract(contractId);
        LocalDate first = ym.atDay(1);
        LocalDate last = ym.atEndOfMonth();
        LocalDate start = ((Date) c.get("starts_on")).toLocalDate();
        LocalDate end = ((Date) c.get("ends_on")).toLocalDate();
        LocalDate from = start.isAfter(first) ? start : first;
        LocalDate to = end.isBefore(last) ? end : last;
        double fraction = to.isBefore(from) ? 0 : (to.toEpochDay() - from.toEpochDay() + 1) / (double) ym.lengthOfMonth();
        Integer gtins = jdbc.queryForObject("select count(*) from industry_portfolio where industry_id = :i and approved_at is not null "
            + "and approved_at < :next and (revoked_at is null or revoked_at >= :first) and (status = 'APROVADO' or revoked_at is not null)",
            new MapSqlParameterSource().addValue("i", c.get("industry_id")).addValue("first", Date.valueOf(first))
                .addValue("next", Date.valueOf(last.plusDays(1))), Integer.class);
        int n = gtins == null ? 0 : gtins;
        int base = (int) Math.round(((Number) c.get("base_fee_cents")).intValue() * fraction);
        double perGtin = ((Number) c.get("price_per_gtin_cents")).intValue() * (n > 500 ? 0.70 : n > 100 ? 0.85 : 1.0);
        int gtinPart = (int) Math.round(n * perGtin * fraction);
        double disc = ((Number) c.get("discount_pct")).doubleValue();
        int discount = (int) Math.round((base + gtinPart) * disc / 100.0);
        return new Bill(contractId, (String) c.get("number"), (UUID) c.get("industry_id"), (String) c.get("industry_name"), first, n,
            base, gtinPart, discount, base + gtinPart - discount, fraction);
    }

    /** Prévia do mês para todos os contratos que valeram nele. */
    public Map<String, Object> month(YearMonth ym) {
        List<UUID> ids = jdbc.queryForList("select id from industry_contracts where status in ('ATIVO', 'SUSPENSO', 'ENCERRADO') "
            + "and activated_at is not null and starts_on <= :last and ends_on >= :first",
            new MapSqlParameterSource().addValue("first", Date.valueOf(ym.atDay(1))).addValue("last", Date.valueOf(ym.atEndOfMonth())), UUID.class);
        List<Map<String, Object>> rows = new ArrayList<>();
        long total = 0;
        for (UUID id : ids) {
            Bill b = compute(id, ym);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("bill", b);
            r.put("invoice", jdbc.queryForList("select id, status, amount_cents, due_date, invoice_url, paid_at from industry_invoices "
                + "where contract_id = :c and month = :m", new MapSqlParameterSource().addValue("c", id).addValue("m", Date.valueOf(ym.atDay(1))))
                .stream().findFirst().orElse(null));
            rows.add(r);
            total += b.amountCents();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", ym.toString());
        out.put("contracts", rows);
        out.put("totalCents", total);
        return out;
    }

    /** Receita: o mês corrente projetado e as faturas por situação. */
    public Map<String, Object> revenue() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> m = month(YearMonth.now());
        out.put("monthlyRecurringCents", m.get("totalCents"));
        out.put("activeContracts", jdbc.queryForObject("select count(*) from industry_contracts where status = 'ATIVO'", Map.of(), Integer.class));
        out.put("billedGtins", jdbc.queryForObject("select count(*) from industry_portfolio p join industry_contracts c on c.industry_id = p.industry_id "
            + "and c.status = 'ATIVO' where p.status = 'APROVADO'", Map.of(), Integer.class));
        out.put("invoices", jdbc.queryForList("select status, count(*) as n, coalesce(sum(amount_cents), 0) as cents from industry_invoices "
            + "group by status order by status", Map.of()));
        out.put("renewals", jdbc.queryForList("select c.id, c.number, c.ends_on, coalesce(i.trade_name, i.legal_name) as industry "
            + "from industry_contracts c join industries i on i.id = c.industry_id where c.status = 'ATIVO' "
            + "and c.ends_on <= current_date + 60 order by c.ends_on", Map.of()));
        return out;
    }

    public List<Map<String, Object>> invoices(UUID industryId) {
        return jdbc.queryForList("select f.*, c.number from industry_invoices f join industry_contracts c on c.id = f.contract_id "
            + "where (cast(:i as uuid) is null or f.industry_id = :i) order by f.month desc, f.created_at desc limit 200",
            new MapSqlParameterSource().addValue("i", industryId));
    }

    /**
     * Emite a fatura do mês (uma por contrato e mês). Com o Asaas ligado, gera
     * a cobrança; sem ele, a fatura fica registrada para cobrança manual.
     */
    @Transactional
    public Map<String, Object> issue(UUID contractId, YearMonth ym, String actor) {
        Bill b = compute(contractId, ym);
        if (b.amountCents() <= 0) {
            throw new IllegalArgumentException("Nada a cobrar neste mês para este contrato.");
        }
        Map<String, Object> c = admin.contract(contractId);
        int billingDay = ((Number) c.get("billing_day")).intValue();
        LocalDate due = ym.plusMonths(1).atDay(Math.min(billingDay, 28));
        if (due.isBefore(LocalDate.now().plusDays(3))) {
            due = LocalDate.now().plusDays(3);
        }
        UUID invoiceId;
        try {
            invoiceId = jdbc.queryForObject("insert into industry_invoices (contract_id, industry_id, month, gtins_billed, base_cents, gtin_cents, "
                + "discount_cents, amount_cents, due_date) values (:c, :i, :m, :g, :b, :gc, :d, :a, :due) returning id",
                new MapSqlParameterSource().addValue("c", contractId).addValue("i", b.industryId()).addValue("m", Date.valueOf(b.month()))
                    .addValue("g", b.gtins()).addValue("b", b.baseCents()).addValue("gc", b.gtinCents()).addValue("d", b.discountCents())
                    .addValue("a", b.amountCents()).addValue("due", Date.valueOf(due)), UUID.class);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new IllegalArgumentException("A fatura deste mês já foi emitida para este contrato.");
        }
        String note = "registrada para cobrança manual";
        if (asaas.enabled()) {
            try {
                String customer = customerOf(b.industryId());
                AsaasService.Charge charge = asaas.invoice(customer, b.amountCents(), due,
                    "MercadoFlow Indústria · contrato " + b.number() + " · " + ym + " · " + b.gtins() + " produtos", "ind:" + invoiceId);
                jdbc.update("update industry_invoices set asaas_payment_id = :p, invoice_url = :u where id = :id",
                    new MapSqlParameterSource().addValue("p", charge.paymentId()).addValue("u", charge.invoiceUrl()).addValue("id", invoiceId));
                note = "cobrança gerada no Asaas";
            } catch (RuntimeException e) {
                log.warn("Fatura de indústria {} sem cobrança no Asaas: {}", invoiceId, e.getMessage());
                note = "registrada, mas o Asaas recusou: " + e.getMessage();
            }
        }
        admin.event(b.industryId(), actor, "EMITIU_FATURA", Map.of("mes", ym.toString(), "valor", b.amountCents(), "situacao", note));
        Map<String, Object> out = new LinkedHashMap<>(jdbc.queryForMap("select * from industry_invoices where id = :id", Map.of("id", invoiceId)));
        out.put("note", note);
        return out;
    }

    private String customerOf(UUID industryId) {
        Map<String, Object> i = jdbc.queryForMap("select * from industries where id = :id", Map.of("id", industryId));
        if (i.get("asaas_customer_id") != null) {
            return (String) i.get("asaas_customer_id");
        }
        String id = asaas.createCustomer((String) i.get("legal_name"), (String) i.get("cnpj"), (String) i.get("contact_email"), "industry:" + industryId);
        jdbc.update("update industries set asaas_customer_id = :c where id = :id", Map.of("c", id, "id", industryId));
        return id;
    }

    /** Baixa (aviso do Asaas ou manual). Contrato suspenso por atraso volta a valer. */
    @Transactional
    public void markPaid(UUID invoiceId, String actor) {
        List<Map<String, Object>> r = jdbc.queryForList("select * from industry_invoices where id = :id", Map.of("id", invoiceId));
        if (r.isEmpty()) {
            return;
        }
        jdbc.update("update industry_invoices set status = 'PAGA', paid_at = coalesce(paid_at, now()) where id = :id", Map.of("id", invoiceId));
        UUID contract = (UUID) r.get(0).get("contract_id");
        Integer stillLate = jdbc.queryForObject("select count(*) from industry_invoices where contract_id = :c and status = 'VENCIDA'",
            Map.of("c", contract), Integer.class);
        if (stillLate != null && stillLate == 0) {
            jdbc.update("update industry_contracts set status = 'ATIVO', status_reason = null, updated_at = now() where id = :c "
                + "and status = 'SUSPENSO' and status_reason = 'Fatura vencida'", Map.of("c", contract));
        }
        admin.event((UUID) r.get(0).get("industry_id"), actor, "FATURA_PAGA", Map.of("fatura", invoiceId.toString()));
    }

    @Transactional
    public void markOverdue(UUID invoiceId) {
        jdbc.update("update industry_invoices set status = 'VENCIDA' where id = :id and status = 'ABERTA'", Map.of("id", invoiceId));
    }

    @Transactional
    public void cancel(UUID invoiceId, String actor) {
        List<Map<String, Object>> r = jdbc.queryForList("select * from industry_invoices where id = :id", Map.of("id", invoiceId));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Fatura não encontrada.");
        }
        jdbc.update("update industry_invoices set status = 'CANCELADA' where id = :id and status <> 'PAGA'", Map.of("id", invoiceId));
        admin.event((UUID) r.get(0).get("industry_id"), actor, "CANCELOU_FATURA", Map.of("fatura", invoiceId.toString()));
    }

    /**
     * Rotina diária: emite a fatura do mês que passou (dias 1 a 5) e suspende o
     * contrato com fatura vencida há mais de {@value #GRACE_DAYS} dias.
     */
    public Map<String, Integer> daily() {
        int issued = 0;
        if (LocalDate.now().getDayOfMonth() <= 5) {
            YearMonth prev = YearMonth.now().minusMonths(1);
            for (Map<String, Object> row : (List<Map<String, Object>>) month(prev).get("contracts")) {
                Bill b = (Bill) row.get("bill");
                if (row.get("invoice") == null && b.amountCents() > 0) {
                    try {
                        issue(b.contractId(), prev, "rotina");
                        issued++;
                    } catch (RuntimeException e) {
                        log.warn("Fatura automática da indústria {} falhou: {}", b.industry(), e.getMessage());
                    }
                }
            }
        }
        jdbc.update("update industry_invoices set status = 'VENCIDA' where status = 'ABERTA' and due_date < current_date", Map.of());
        int suspended = jdbc.update("update industry_contracts set status = 'SUSPENSO', status_reason = 'Fatura vencida', updated_at = now() "
            + "where status = 'ATIVO' and exists (select 1 from industry_invoices f where f.contract_id = industry_contracts.id "
            + "and f.status = 'VENCIDA' and f.due_date < current_date - " + GRACE_DAYS + ")", Map.of());
        return Map.of("issued", issued, "suspended", suspended);
    }
}
