package com.pdv2cloud.service.billing;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanCatalogService;
import com.pdv2cloud.service.PlanService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Adicionais da assinatura (loja extra, usuário extra): somam aos limites do
 * plano e ao valor mensal, cobrados na mesma assinatura do Asaas.
 */
@Service
public class AddonService {

    public record Addon(String code, String name, String description, int priceCents, int maxQuantity, int quantity) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final SubscriptionService subscriptions;
    private final AsaasService asaas;
    private final PlanCatalogService catalog;
    private final PlanService plans;

    public AddonService(NamedParameterJdbcTemplate jdbc, SubscriptionService subscriptions, AsaasService asaas,
                        PlanCatalogService catalog, PlanService plans) {
        this.jdbc = jdbc;
        this.subscriptions = subscriptions;
        this.asaas = asaas;
        this.catalog = catalog;
        this.plans = plans;
    }

    public List<Addon> list(UUID rootId) {
        return jdbc.query("select a.*, coalesce(s.quantity, 0) as qty from addon_catalog a "
                + "left join subscription_addons s on s.addon_code = a.code and s.market_id = :m where a.active order by a.code",
            Map.of("m", rootId), (rs, i) -> new Addon(rs.getString("code"), rs.getString("name"), rs.getString("description"),
                rs.getInt("monthly_price_cents"), rs.getInt("max_quantity"), rs.getInt("qty")));
    }

    /** Valor mensal: plano + adicionais (plano sob consulta conta como zero). */
    public int monthlyTotalCents(UUID rootId, PlanType plan) {
        Integer price = catalog.entryFor(plan).getMonthlyPriceCents();
        int total = price == null || price < 0 ? 0 : price;
        for (Addon a : list(rootId)) {
            total += a.priceCents() * a.quantity();
        }
        return total;
    }

    /** Muda a quantidade de um adicional e o valor da assinatura no Asaas (desfaz tudo se o Asaas recusar). */
    @Transactional
    public List<Addon> setQuantity(UUID marketId, String code, int quantity) {
        UUID root = subscriptions.rootOf(marketId);
        SubscriptionService.Subscription s = subscriptions.of(root);
        if (s.status() != SubscriptionService.Status.ACTIVE || s.cancelAtPeriodEnd()) {
            throw new IllegalStateException("Adicionais são para assinaturas ativas. Assine um plano para contratar.");
        }
        if ("STRIPE".equals(s.provider())) {
            throw new IllegalStateException("Na assinatura pelo cartão, peça os adicionais ao comercial (comercial@mercadoflow.com).");
        }
        if (!AsaasService.PROVIDER.equals(s.provider()) || s.providerSubscriptionId() == null) {
            throw new IllegalStateException("Sua assinatura foi negociada com o comercial: peça os adicionais por lá.");
        }
        Addon addon = list(root).stream().filter(a -> a.code().equals(code)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Adicional desconhecido"));
        if (quantity < 0 || quantity > addon.maxQuantity()) {
            throw new IllegalArgumentException("Quantidade de 0 a " + addon.maxQuantity() + ".");
        }
        if (quantity < addon.quantity()) {
            PlanService.UsageSnapshot usage = plans.usageFor(root);
            int drop = addon.quantity() - quantity;
            if ("EXTRA_STORE".equals(code) && !PlanType.isUnlimited(usage.limits().branches())
                && usage.branchCount() > usage.limits().branches() - drop) {
                throw new IllegalArgumentException("A rede usa " + usage.branchCount() + " lojas. Desligue uma loja antes de diminuir.");
            }
            if ("EXTRA_SEAT".equals(code) && !PlanType.isUnlimited(usage.limits().seats())
                && usage.seatCount() > usage.limits().seats() - drop) {
                throw new IllegalArgumentException("A conta tem " + usage.seatCount() + " pessoas com acesso. Desative alguém antes de diminuir.");
            }
        }
        if (quantity == 0) {
            jdbc.update("delete from subscription_addons where market_id = :m and addon_code = :c", Map.of("m", root, "c", code));
        } else {
            jdbc.update("insert into subscription_addons (market_id, addon_code, quantity) values (:m, :c, :q) "
                    + "on conflict (market_id, addon_code) do update set quantity = excluded.quantity, updated_at = now()",
                new MapSqlParameterSource().addValue("m", root).addValue("c", code).addValue("q", quantity));
        }
        PlanType plan = PlanType.fromString(s.planCode());
        asaas.updateValue(s.providerSubscriptionId(), monthlyTotalCents(root, plan), description(root, plan));
        return list(root);
    }

    /** Descrição da fatura: plano e adicionais. */
    String description(UUID rootId, PlanType plan) {
        StringBuilder b = new StringBuilder("MercadoFlow — plano ").append(plan.getDisplayName());
        for (Addon a : list(rootId)) {
            if (a.quantity() > 0) {
                b.append(" + ").append(a.quantity()).append(" ").append(a.name().toLowerCase());
            }
        }
        return b.toString();
    }
}
