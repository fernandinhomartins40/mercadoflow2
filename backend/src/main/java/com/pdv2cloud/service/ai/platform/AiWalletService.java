package com.pdv2cloud.service.ai.platform;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.service.confere.PixCode;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carteira de créditos de IA do mercado (revenda da IA da plataforma).
 *
 * O lojista vê créditos, não tokens: cada tarefa debita um número fixo de
 * créditos (tabela de roteamento), e o custo real em dólar fica no registro
 * de uso para o superadmin acompanhar a margem. Teto mensal por mercado para
 * ninguém esgotar o saldo da plataforma nem levar susto. Pagamento por Pix na
 * chave da plataforma (a mesma do Confere), confirmado no superadmin.
 */
@Service
public class AiWalletService {

    private static final String TXID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final NamedParameterJdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    /** Com o Asaas ligado, o Pix sai com QR dele e o aviso de pagamento confirma sozinho. */
    private com.pdv2cloud.service.billing.AsaasService asaas;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setAsaas(@org.springframework.context.annotation.Lazy com.pdv2cloud.service.billing.AsaasService asaas) {
        this.asaas = asaas;
    }

    /** Créditos inclusos no plano (plan_features.ai_monthly_credits). */
    private com.pdv2cloud.service.billing.Entitlements entitlements;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setEntitlements(@org.springframework.context.annotation.Lazy com.pdv2cloud.service.billing.Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    public AiWalletService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param balance créditos comprados (não vencem)
     * @param included créditos do plano que sobram neste mês (vencem na virada)
     * @param includedMonthly créditos que o plano dá por mês
     * @param available o que dá para gastar agora (inclusos + comprados)
     */
    public record Wallet(int balance, Integer monthlyCap, int monthUsed, int effectiveCap, LocalDate monthStart,
                         int included, int includedMonthly, int available) {}

    public Wallet wallet(UUID marketId) {
        rollMonth(marketId);
        refreshIncluded(marketId);
        int defaultCap = jdbc.queryForObject("select default_monthly_cap_credits from ai_platform_settings where id = 'default'",
            Map.of(), Integer.class);
        List<Wallet> w = jdbc.query("select * from ai_wallets where market_id = :m", Map.of("m", marketId), (rs, i) -> {
            Integer cap = (Integer) rs.getObject("monthly_cap");
            int included = rs.getInt("included_balance");
            int granted = rs.getInt("included_granted");
            // O teto do mês protege o gasto comprado; o que o plano dá entra por cima dele.
            int baseCap = cap != null ? cap : defaultCap;
            return new Wallet(rs.getInt("balance"), cap, rs.getInt("month_used"), baseCap + granted,
                rs.getDate("month_start").toLocalDate(), included, granted, included + rs.getInt("balance"));
        });
        return w.isEmpty() ? new Wallet(0, null, 0, defaultCap, LocalDate.now().withDayOfMonth(1), 0, 0, 0) : w.get(0);
    }

    /**
     * Créditos do plano: renovados na virada do mês (o que sobrou vence) e
     * completados na hora quando o plano sobe no meio do mês.
     */
    void refreshIncluded(UUID marketId) {
        if (entitlements == null) {
            return;
        }
        int allowance;
        try {
            allowance = Math.max(0, entitlements.amount(marketId, "ai_monthly_credits", 0));
        } catch (RuntimeException e) {
            return;
        }
        jdbc.update("insert into ai_wallets (market_id) values (:m) on conflict do nothing", Map.of("m", marketId));
        Map<String, Object> before = jdbc.queryForMap("select included_granted, included_month < date_trunc('month', now())::date "
            + "or included_month is null as new_month from ai_wallets where market_id = :m", Map.of("m", marketId));
        boolean newMonth = Boolean.TRUE.equals(before.get("new_month"));
        int delta = newMonth ? allowance : allowance - ((Number) before.get("included_granted")).intValue();
        List<Map<String, Object>> rows = jdbc.queryForList("update ai_wallets set "
                + "included_balance = case when included_month is null or included_month < date_trunc('month', now())::date then :a "
                + "  when :a > included_granted then included_balance + (:a - included_granted) else included_balance end, "
                + "included_granted = case when included_month is null or included_month < date_trunc('month', now())::date then :a "
                + "  else greatest(included_granted, :a) end, "
                + "included_month = date_trunc('month', now())::date, updated_at = now() "
                + "where market_id = :m and (included_month is null or included_month < date_trunc('month', now())::date "
                + "  or :a > included_granted) returning included_granted",
            Map.of("m", marketId, "a", allowance));
        if (!rows.isEmpty() && delta > 0) {
            jdbc.update("insert into ai_ledger (market_id, delta, kind, reference, note) values (:m, :d, 'PLAN_MONTHLY', :r, :n)",
                new MapSqlParameterSource().addValue("m", marketId).addValue("d", delta)
                    .addValue("r", LocalDate.now().withDayOfMonth(1).toString())
                    .addValue("n", newMonth ? "Créditos do plano no mês (" + allowance + ")"
                        : "Créditos do plano: complemento pela mudança de plano"));
        }
    }

    /** Pode gastar {@code credits} agora? (saldo e teto do mês) */
    public boolean canSpend(UUID marketId, int credits) {
        if (credits <= 0) {
            return true;
        }
        Wallet w = wallet(marketId);
        return w.available() >= credits && w.monthUsed() + credits <= w.effectiveCap();
    }

    /**
     * Débito de uso. Transação própria: roda depois de uma chamada HTTP longa,
     * fora de transação, e não pode deixar o saldo negativo.
     *
     * @return false quando o saldo acabou no meio do caminho (a resposta já foi
     *         entregue; o uso fica registrado sem débito)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean debit(UUID marketId, int credits, String task, String reference) {
        if (credits <= 0) {
            return true;
        }
        rollMonth(marketId);
        // Gasta primeiro o que o plano dá no mês; o comprado fica para depois.
        int n = jdbc.update("update ai_wallets set included_balance = included_balance - least(included_balance, :c), "
            + "balance = balance - greatest(0, :c - included_balance), month_used = month_used + :c, updated_at = now() "
            + "where market_id = :m and included_balance + balance >= :c", Map.of("m", marketId, "c", credits));
        if (n == 0) {
            return false;
        }
        jdbc.update("insert into ai_ledger (market_id, delta, kind, task, reference, note) values (:m, :d, 'USE', :t, :r, :n)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", -credits).addValue("t", task)
                .addValue("r", reference).addValue("n", label(task)));
        return true;
    }

    /** Crédito (compra, concessão de teste, ajuste manual). */
    @Transactional
    public Wallet credit(UUID marketId, int delta, String kind, String reference, String note) {
        jdbc.update("insert into ai_wallets (market_id) values (:m) on conflict do nothing", Map.of("m", marketId));
        int n = jdbc.update("update ai_wallets set balance = balance + :d, updated_at = now() where market_id = :m and balance + :d >= 0",
            Map.of("m", marketId, "d", delta));
        if (n == 0) {
            throw new IllegalArgumentException("O ajuste deixaria o saldo negativo");
        }
        jdbc.update("insert into ai_ledger (market_id, delta, kind, reference, note) values (:m, :d, :k, :r, :n)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", delta).addValue("k", kind)
                .addValue("r", reference).addValue("n", note));
        return wallet(marketId);
    }

    @Transactional
    public Wallet setMonthlyCap(UUID marketId, Integer cap) {
        if (cap != null && (cap < 0 || cap > 1_000_000)) {
            throw new IllegalArgumentException("Teto mensal inválido");
        }
        jdbc.update("insert into ai_wallets (market_id) values (:m) on conflict do nothing", Map.of("m", marketId));
        jdbc.update("update ai_wallets set monthly_cap = :c, updated_at = now() where market_id = :m",
            new MapSqlParameterSource().addValue("m", marketId).addValue("c", cap));
        return wallet(marketId);
    }

    public record LedgerEntry(int delta, String kind, String task, String note, LocalDateTime createdAt) {}

    public List<LedgerEntry> ledger(UUID marketId) {
        return jdbc.query("select * from ai_ledger where market_id = :m order by created_at desc limit 100", Map.of("m", marketId),
            (rs, i) -> new LedgerEntry(rs.getInt("delta"), rs.getString("kind"), rs.getString("task"), rs.getString("note"),
                ts(rs.getTimestamp("created_at"))));
    }

    // ── Pacotes e pedidos ──────────────────────────────────────────────────

    public record Plan(UUID id, String name, int credits, int priceCents, boolean active, int sortOrder) {}

    public List<Plan> plans(boolean onlyActive) {
        return jdbc.query("select * from ai_plans " + (onlyActive ? "where active " : "") + "order by sort_order, credits", Map.of(),
            (rs, i) -> new Plan((UUID) rs.getObject("id"), rs.getString("name"), rs.getInt("credits"), rs.getInt("price_cents"),
                rs.getBoolean("active"), rs.getInt("sort_order")));
    }

    @Transactional
    public List<Plan> savePlan(UUID id, String name, int credits, int priceCents, boolean active, int sortOrder) {
        if (name == null || name.isBlank() || credits <= 0 || priceCents <= 0) {
            throw new IllegalArgumentException("Informe nome, créditos e preço");
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("id", id).addValue("n", name.trim())
            .addValue("c", credits).addValue("p", priceCents).addValue("a", active).addValue("s", sortOrder);
        if (id == null) {
            jdbc.update("insert into ai_plans (name, credits, price_cents, active, sort_order) values (:n, :c, :p, :a, :s)", p);
        } else {
            jdbc.update("update ai_plans set name = :n, credits = :c, price_cents = :p, active = :a, sort_order = :s where id = :id", p);
        }
        return plans(false);
    }

    public record Order(UUID id, UUID marketId, String marketName, int credits, int amountCents, String status, String txid,
                        String pixPayload, String pixQrPng, LocalDateTime createdAt, LocalDateTime paidAt) {}

    @Transactional
    public Order createPixOrder(UUID marketId, UUID planId) {
        Plan plan = plans(true).stream().filter(p -> p.id().equals(planId)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Pacote indisponível"));
        boolean gateway = asaas != null && asaas.enabled();
        String pixKey = jdbc.queryForObject("select pix_key from confere_settings where id = 'default'", Map.of(), String.class);
        if (pixKey == null && !gateway) {
            throw new IllegalArgumentException("Pagamento por Pix ainda não está disponível");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ai_orders (id, market_id, plan_id, credits, amount_cents, txid) values (:id, :m, :p, :c, :a, :t)",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("p", plan.id())
                .addValue("c", plan.credits()).addValue("a", plan.priceCents()).addValue("t", txid()));
        if (gateway) {
            var charge = asaas.pixCharge(marketId, plan.priceCents(), plan.name() + " — créditos de IA MercadoFlow", "ai:" + id);
            jdbc.update("update ai_orders set provider_payment_id = :p, provider_pix_payload = :x, provider_invoice_url = :u where id = :id",
                new MapSqlParameterSource().addValue("id", id).addValue("p", charge.paymentId()).addValue("x", charge.pixPayload())
                    .addValue("u", charge.invoiceUrl()));
        }
        return order(marketId, id);
    }

    public Order order(UUID marketId, UUID id) {
        Map<String, Object> s = jdbc.queryForMap("select pix_key, pix_merchant_name, pix_merchant_city from confere_settings where id = 'default'", Map.of());
        List<Order> rows = jdbc.query("select o.*, m.name as market_name from ai_orders o join markets m on m.id = o.market_id "
                + "where o.id = :id and o.market_id = :m", Map.of("id", id, "m", marketId),
            (rs, i) -> {
                String payload = null;
                String qr = null;
                if ("PENDING".equals(rs.getString("status")) && rs.getString("provider_pix_payload") != null) {
                    payload = rs.getString("provider_pix_payload");
                    qr = PixCode.qrPngBase64(payload);
                } else if ("PENDING".equals(rs.getString("status")) && s.get("pix_key") != null) {
                    payload = PixCode.payload((String) s.get("pix_key"),
                        s.get("pix_merchant_name") == null ? "MERCADOFLOW" : (String) s.get("pix_merchant_name"),
                        s.get("pix_merchant_city") == null ? "BRASIL" : (String) s.get("pix_merchant_city"),
                        BigDecimal.valueOf(rs.getInt("amount_cents"), 2), rs.getString("txid"));
                    qr = PixCode.qrPngBase64(payload);
                }
                return mapOrder(rs, payload, qr);
            });
        if (rows.isEmpty()) {
            throw new CustomExceptions.NotFound("Pedido não encontrado");
        }
        return rows.get(0);
    }

    public List<Order> orders(UUID marketId) {
        return jdbc.query("select o.*, m.name as market_name from ai_orders o join markets m on m.id = o.market_id "
                + "where o.market_id = :m order by o.created_at desc limit 30", Map.of("m", marketId),
            (rs, i) -> mapOrder(rs, null, null));
    }

    public List<Order> allOrders(String status) {
        return jdbc.query("select o.*, m.name as market_name from ai_orders o join markets m on m.id = o.market_id "
                + "where (cast(:s as varchar) is null or o.status = :s) order by o.created_at desc limit 200",
            new MapSqlParameterSource().addValue("s", status == null || status.isBlank() ? null : status),
            (rs, i) -> mapOrder(rs, null, null));
    }

    /** Pagamento confirmado no painel: credita uma vez só. */
    @Transactional
    public void markPaid(UUID orderId, String actor) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "update ai_orders set status = 'PAID', paid_at = now(), confirmed_by = :a where id = :id and status = 'PENDING' "
                + "returning market_id, credits", new MapSqlParameterSource().addValue("id", orderId).addValue("a", actor));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Pedido já pago, cancelado ou inexistente");
        }
        int credits = ((Number) rows.get(0).get("credits")).intValue();
        credit((UUID) rows.get(0).get("market_id"), credits, "PURCHASE", orderId.toString(), "Compra de " + credits + " créditos de IA (Pix)");
    }

    /** Aviso de pagamento do Asaas: credita se ainda estava pendente (aviso repetido não credita de novo). */
    @Transactional
    public boolean markPaidByGateway(UUID orderId) {
        int pending = jdbc.queryForObject("select count(*) from ai_orders where id = :id and status = 'PENDING'",
            Map.of("id", orderId), Integer.class);
        if (pending == 0) {
            return false;
        }
        markPaid(orderId, "asaas");
        return true;
    }

    @Transactional
    public void cancel(UUID orderId) {
        if (jdbc.update("update ai_orders set status = 'CANCELED' where id = :id and status = 'PENDING'", Map.of("id", orderId)) == 0) {
            throw new IllegalArgumentException("Só pedidos pendentes podem ser cancelados");
        }
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    /** Vira o mês: zera o uso do mês quando a carteira ainda aponta para o anterior. */
    private void rollMonth(UUID marketId) {
        jdbc.update("update ai_wallets set month_used = 0, month_start = date_trunc('month', now())::date "
            + "where market_id = :m and month_start < date_trunc('month', now())::date", Map.of("m", marketId));
    }

    private Order mapOrder(java.sql.ResultSet rs, String payload, String qr) throws java.sql.SQLException {
        return new Order((UUID) rs.getObject("id"), (UUID) rs.getObject("market_id"), rs.getString("market_name"),
            rs.getInt("credits"), rs.getInt("amount_cents"), rs.getString("status"), rs.getString("txid"), payload, qr,
            ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("paid_at")));
    }

    private String txid() {
        StringBuilder sb = new StringBuilder("MFIA");
        for (int i = 0; i < 16; i++) {
            sb.append(TXID_ALPHABET.charAt(random.nextInt(TXID_ALPHABET.length())));
        }
        return sb.toString();
    }

    static String label(String task) {
        if (task == null) {
            return "Uso de IA";
        }
        return switch (task) {
            case "PERGUNTE_AOS_DADOS" -> "Pergunta ao Copiloto";
            case "INTERPRETAR_OPORTUNIDADE" -> "Explicação de oportunidade";
            case "RESUMO_SEMANAL" -> "Comentário do resumo da semana";
            case "PLANO_COMPRAS" -> "Plano de compras";
            default -> "Uso de IA";
        };
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
