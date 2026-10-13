package com.pdv2cloud.service.partner;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.billing.AddonService;
import com.pdv2cloud.service.billing.AsaasService;
import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Mantém o valor da assinatura certo quando o desconto do parceiro da casa
 * entra ou sai: vínculo aprovado ou revogado, loja que vira (ou deixa de ser)
 * cliente do Bipae. Só mexe em assinatura ativa pelo Asaas; a próxima fatura
 * já vem com o valor novo. Cartão (Stripe) e contrato negociado ficam como estão.
 */
@Service
@Slf4j
public class PartnerBenefitService {

    private final NamedParameterJdbcTemplate jdbc;
    private final SubscriptionService subscriptions;
    private final AddonService addons;
    private final AsaasService asaas;
    private final PartnerDiscount discount;

    public PartnerBenefitService(NamedParameterJdbcTemplate jdbc, SubscriptionService subscriptions, AddonService addons,
                                 AsaasService asaas, PartnerDiscount discount) {
        this.jdbc = jdbc;
        this.subscriptions = subscriptions;
        this.addons = addons;
        this.asaas = asaas;
        this.discount = discount;
    }

    /** O parceiro informa se a loja é cliente ativo dele (base do desconto). */
    public void setCustomerActive(UUID partnerId, UUID marketId, boolean active) {
        TenantContext.runAsSystem(() -> jdbc.update(
            "update partner_market_links set customer_active = :a, customer_status_at = now() " +
            "where partner_id = :p and market_id = :m and status = 'ATIVO'",
            new MapSqlParameterSource("a", active).addValue("p", partnerId).addValue("m", marketId)));
        repriceAfterCommit(marketId);
    }

    /** Recalcula depois do commit: a chamada ao Asaas não pode segurar nem desfazer a transação. */
    public void repriceAfterCommit(UUID marketId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    reprice(marketId);
                }
            });
        } else {
            reprice(marketId);
        }
    }

    /** Novo valor mensal (plano com ou sem desconto + adicionais) na assinatura do Asaas. */
    public void reprice(UUID marketId) {
        try {
            TenantContext.runAsSystem(() -> {
                UUID root = subscriptions.rootOf(marketId);
                SubscriptionService.Subscription s = subscriptions.of(root);
                if (s.status() != SubscriptionService.Status.ACTIVE || s.cancelAtPeriodEnd()
                    || !AsaasService.PROVIDER.equals(s.provider()) || s.providerSubscriptionId() == null || !asaas.enabled()) {
                    return null;
                }
                PlanType plan = PlanType.fromString(s.planCode());
                asaas.updateValue(s.providerSubscriptionId(), addons.monthlyTotalCents(root, plan), addons.description(root, plan));
                log.info("Assinatura de {} recalculada (desconto de parceiro: {})", root, discount.forRoot(root));
                return null;
            });
        } catch (RuntimeException e) {
            // A próxima troca de plano ou de adicional recalcula de novo; o vínculo não pode falhar por isso.
            log.warn("Não consegui recalcular a assinatura de {} após mudança no desconto de parceiro: {}", marketId, e.getMessage());
        }
    }
}
