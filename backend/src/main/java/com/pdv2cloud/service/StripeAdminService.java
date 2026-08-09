package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanPriceHistory;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.PlanPriceHistoryRepository;
import com.stripe.exception.StripeException;
import com.stripe.model.Price;
import com.stripe.model.Product;
import com.stripe.model.Subscription;
import com.stripe.model.SubscriptionItem;
import com.stripe.param.PriceCreateParams;
import com.stripe.param.ProductCreateParams;
import com.stripe.param.ProductUpdateParams;
import com.stripe.param.SubscriptionCancelParams;
import com.stripe.param.SubscriptionUpdateParams;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Operações do painel super admin que precisam refletir no Stripe.
 *
 * O objetivo é que o painel seja a fonte de verdade: mudar preço, plano ou
 * bloquear uma conta ali deve chegar ao Stripe sem ninguém abrir o painel deles.
 *
 * Duas restrições do Stripe moldam o desenho:
 *
 *  PRICE É IMUTÁVEL — não dá para "editar o valor" de um Price. Reajustar
 *    significa criar um novo e apontar o catálogo para ele. Por isso quem já
 *    assina continua no Price antigo até ser migrado de propósito: é o
 *    comportamento que evita cobrar de um cliente valor diferente do que ele
 *    contratou, que é motivo clássico de contestação.
 *
 *  ASSINATURA VIVE NO STRIPE — mudar o plano no banco sem mudar lá faria o
 *    cliente receber limites que não paga (ou pagar por limites que não tem).
 */
@Service
@Slf4j
public class StripeAdminService {

    private final StripeService stripeService;
    private final PlanCatalogService planCatalogService;
    private final PlanPriceHistoryRepository priceHistoryRepository;
    private final MarketRepository marketRepository;

    public StripeAdminService(
        StripeService stripeService,
        PlanCatalogService planCatalogService,
        PlanPriceHistoryRepository priceHistoryRepository,
        MarketRepository marketRepository
    ) {
        this.stripeService = stripeService;
        this.planCatalogService = planCatalogService;
        this.priceHistoryRepository = priceHistoryRepository;
        this.marketRepository = marketRepository;
    }

    // ── Preço ────────────────────────────────────────────────────────────────

    /**
     * Aplica um novo preço ao plano, criando o Price correspondente no Stripe.
     *
     * @param migrateExisting quando verdadeiro, move também as assinaturas
     *                        ativas para o novo valor. O padrão é falso: o
     *                        reajuste vale só para novas contratações.
     */
    @Transactional
    public PriceChangeResult changePlanPrice(
        String planCode,
        int newPriceCents,
        boolean migrateExisting,
        String reason,
        String actorEmail
    ) {
        PlanType plan = PlanType.fromString(planCode);
        PlanCatalogEntry entry = planCatalogService.entryFor(plan);

        Integer oldPrice = entry.getMonthlyPriceCents();
        if (oldPrice != null && oldPrice == newPriceCents) {
            return new PriceChangeResult(planCode, oldPrice, newPriceCents,
                entry.getStripePriceId(), 0, "Preço já era esse — nada a fazer.");
        }

        String newStripePriceId = null;
        String warning = null;

        // Sem Stripe configurado o catálogo ainda é atualizado: o painel deve
        // funcionar mesmo antes de a cobrança estar ligada.
        if (stripeService.isConfigured() && newPriceCents > 0) {
            try {
                String productId = ensureStripeProduct(entry);
                Price price = Price.create(
                    PriceCreateParams.builder()
                        .setProduct(productId)
                        .setUnitAmount((long) newPriceCents)
                        .setCurrency("brl")
                        .setRecurring(
                            PriceCreateParams.Recurring.builder()
                                .setInterval(PriceCreateParams.Recurring.Interval.MONTH)
                                .build()
                        )
                        .putMetadata("planCode", planCode)
                        .build()
                );
                newStripePriceId = price.getId();
                log.info("Novo Price criado no Stripe | plano={} | price={} | valor={}",
                    planCode, newStripePriceId, newPriceCents);
            } catch (StripeException exc) {
                // Não aborta: o preço local vale, e o painel avisa que o Stripe
                // ficou para trás — melhor do que perder a alteração inteira.
                warning = "Preço atualizado no sistema, mas falhou no Stripe: " + exc.getMessage();
                log.error("Falha ao criar Price no Stripe para {}: {}", planCode, exc.getMessage(), exc);
            }
        } else if (!stripeService.isConfigured()) {
            warning = "Stripe não configurado: o preço vale no sistema, mas não há cobrança automática.";
        }

        if (newStripePriceId != null) {
            entry.setPreviousStripePriceId(entry.getStripePriceId());
            entry.setStripePriceId(newStripePriceId);
        }
        entry.setMonthlyPriceCents(newPriceCents);
        entry.setPriceChangedAt(LocalDateTime.now());
        planCatalogService.save(entry);

        int migrated = 0;
        if (migrateExisting && newStripePriceId != null) {
            migrated = migrateSubscriptions(plan, newStripePriceId);
        }

        PlanPriceHistory history = new PlanPriceHistory();
        history.setPlanCode(planCode);
        history.setFromPriceCents(oldPrice);
        history.setToPriceCents(newPriceCents);
        history.setStripePriceId(newStripePriceId);
        history.setMigratedCount(migrated);
        history.setReason(reason);
        history.setActorEmail(actorEmail);
        priceHistoryRepository.save(history);

        return new PriceChangeResult(planCode, oldPrice, newPriceCents,
            newStripePriceId, migrated, warning);
    }

    /**
     * Move as assinaturas ativas do plano para o novo preço.
     *
     * Usa proration_behavior=none: o novo valor passa a valer no próximo ciclo,
     * sem cobrança proporcional imediata. Cobrar a diferença no ato de um
     * reajuste que o cliente não pediu seria agressivo e geraria contestação.
     */
    @Transactional
    public int migrateSubscriptions(PlanType plan, String newPriceId) {
        if (!stripeService.isConfigured()) {
            return 0;
        }

        int migrated = 0;
        List<Market> markets = marketRepository.findAll().stream()
            .filter(m -> m.getPlanType() == plan)
            .filter(m -> m.getStripeSubscriptionId() != null && !m.getStripeSubscriptionId().isBlank())
            .toList();

        for (Market market : markets) {
            try {
                Subscription subscription = Subscription.retrieve(market.getStripeSubscriptionId());
                if (subscription.getItems() == null || subscription.getItems().getData().isEmpty()) {
                    continue;
                }
                SubscriptionItem item = subscription.getItems().getData().get(0);
                if (newPriceId.equals(item.getPrice() != null ? item.getPrice().getId() : null)) {
                    continue; // já está no preço novo
                }

                subscription.update(
                    SubscriptionUpdateParams.builder()
                        .addItem(
                            SubscriptionUpdateParams.Item.builder()
                                .setId(item.getId())
                                .setPrice(newPriceId)
                                .build()
                        )
                        .setProrationBehavior(SubscriptionUpdateParams.ProrationBehavior.NONE)
                        .build()
                );
                market.setStripePriceId(newPriceId);
                marketRepository.save(market);
                migrated++;
            } catch (StripeException exc) {
                log.error("Falha ao migrar assinatura do mercado {}: {}",
                    market.getId(), exc.getMessage());
            }
        }

        log.info("Assinaturas migradas para o preço {} | plano={} | total={}",
            newPriceId, plan, migrated);
        return migrated;
    }

    /** Cria o produto no Stripe se ainda não existir, e mantém nome/descrição. */
    private String ensureStripeProduct(PlanCatalogEntry entry) throws StripeException {
        if (entry.getStripeProductId() != null && !entry.getStripeProductId().isBlank()) {
            try {
                Product.retrieve(entry.getStripeProductId()).update(
                    ProductUpdateParams.builder()
                        .setName(entry.getDisplayName())
                        .setDescription(entry.getDescription() != null ? entry.getDescription() : "")
                        .build()
                );
                return entry.getStripeProductId();
            } catch (StripeException exc) {
                log.warn("Produto {} não encontrado no Stripe; criando outro", entry.getStripeProductId());
            }
        }

        Product product = Product.create(
            ProductCreateParams.builder()
                .setName(entry.getDisplayName())
                .setDescription(entry.getDescription() != null ? entry.getDescription() : "")
                .putMetadata("app", "mercadoflow")
                .putMetadata("planCode", entry.getCode())
                .build()
        );
        entry.setStripeProductId(product.getId());
        return product.getId();
    }

    // ── Plano de um cliente ──────────────────────────────────────────────────

    /**
     * Troca o plano da assinatura no Stripe para acompanhar a mudança feita no
     * painel.
     *
     * Aqui a proração é aplicada (CREATE_PRORATIONS): a troca partiu de uma ação
     * deliberada sobre aquele cliente — upgrade ou downgrade —, então cobrar ou
     * creditar a diferença é o comportamento correto e esperado.
     *
     * @return mensagem de aviso quando não foi possível sincronizar, ou null.
     */
    @Transactional
    public String syncPlanChange(Market market, PlanType newPlan) {
        if (!stripeService.isConfigured()) {
            return null;
        }
        String subscriptionId = market.getStripeSubscriptionId();
        if (subscriptionId == null || subscriptionId.isBlank()) {
            // Sem assinatura ativa não há o que sincronizar: o cliente está no
            // gratuito ou foi liberado manualmente.
            return null;
        }

        if (newPlan == PlanType.FREE) {
            return cancelSubscription(market, true, "Rebaixado para o plano gratuito");
        }

        PlanCatalogEntry target = planCatalogService.entryFor(newPlan);
        String priceId = target.getStripePriceId();
        if (priceId == null || priceId.isBlank()) {
            return "Plano alterado no sistema, mas o Stripe não tem preço configurado para "
                + target.getDisplayName() + " — a cobrança segue no valor anterior.";
        }

        try {
            Subscription subscription = Subscription.retrieve(subscriptionId);
            if (subscription.getItems() == null || subscription.getItems().getData().isEmpty()) {
                return "Assinatura sem itens no Stripe — verifique manualmente.";
            }
            SubscriptionItem item = subscription.getItems().getData().get(0);

            subscription.update(
                SubscriptionUpdateParams.builder()
                    .addItem(
                        SubscriptionUpdateParams.Item.builder()
                            .setId(item.getId())
                            .setPrice(priceId)
                            .build()
                    )
                    .setProrationBehavior(SubscriptionUpdateParams.ProrationBehavior.CREATE_PRORATIONS)
                    .putMetadata("planCode", newPlan.name())
                    .build()
            );
            market.setStripePriceId(priceId);
            marketRepository.save(market);
            log.info("Assinatura sincronizada com o novo plano | market={} | plano={}",
                market.getId(), newPlan);
            return null;
        } catch (StripeException exc) {
            log.error("Falha ao sincronizar plano no Stripe | market={}: {}",
                market.getId(), exc.getMessage(), exc);
            return "Plano alterado no sistema, mas falhou no Stripe: " + exc.getMessage();
        }
    }

    /**
     * Cancela a assinatura no Stripe.
     *
     * @param atPeriodEnd true encerra ao fim do período pago (o cliente usa o
     *                    que já pagou); false cancela na hora, com estorno
     *                    proporcional feito pelo Stripe.
     */
    @Transactional
    public String cancelSubscription(Market market, boolean atPeriodEnd, String reason) {
        if (!stripeService.isConfigured()) {
            return null;
        }
        String subscriptionId = market.getStripeSubscriptionId();
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return null;
        }

        try {
            Subscription subscription = Subscription.retrieve(subscriptionId);
            if (atPeriodEnd) {
                subscription.update(
                    SubscriptionUpdateParams.builder()
                        .setCancelAtPeriodEnd(true)
                        .putMetadata("cancelReason", reason != null ? reason : "")
                        .build()
                );
                market.setCancelAtPeriodEnd(true);
            } else {
                subscription.cancel(
                    SubscriptionCancelParams.builder()
                        .setProrate(true)
                        .build()
                );
                market.setStripeSubscriptionId(null);
                market.setStripeStatus("canceled");
            }
            marketRepository.save(market);

            log.info("Assinatura cancelada | market={} | aoFimDoPeriodo={}",
                market.getId(), atPeriodEnd);
            return null;
        } catch (StripeException exc) {
            log.error("Falha ao cancelar assinatura | market={}: {}",
                market.getId(), exc.getMessage(), exc);
            return "Conta bloqueada no sistema, mas a assinatura no Stripe não foi cancelada: "
                + exc.getMessage();
        }
    }

    /** Reativa uma assinatura marcada para cancelar ao fim do período. */
    @Transactional
    public String resumeSubscription(Market market) {
        if (!stripeService.isConfigured()) {
            return null;
        }
        String subscriptionId = market.getStripeSubscriptionId();
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return null;
        }

        try {
            Subscription.retrieve(subscriptionId).update(
                SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(false).build()
            );
            market.setCancelAtPeriodEnd(false);
            marketRepository.save(market);
            return null;
        } catch (StripeException exc) {
            return "Conta reativada, mas o cancelamento no Stripe não pôde ser revertido: "
                + exc.getMessage();
        }
    }

    // ── Sincronização do catálogo ────────────────────────────────────────────

    /**
     * Garante que todo plano vendável tenha produto e preço no Stripe.
     *
     * Usado no botão "sincronizar" do painel, para quem configurou a conta
     * depois de já ter planos cadastrados.
     */
    @Transactional
    public List<String> syncCatalogToStripe() {
        List<String> messages = new ArrayList<>();
        if (!stripeService.isConfigured()) {
            messages.add("Stripe não configurado.");
            return messages;
        }

        for (PlanCatalogEntry entry : planCatalogService.listActive()) {
            if (!Boolean.TRUE.equals(entry.getPurchasable())
                || entry.getMonthlyPriceCents() == null
                || entry.getMonthlyPriceCents() <= 0) {
                continue;
            }
            if (entry.getStripePriceId() != null && !entry.getStripePriceId().isBlank()) {
                messages.add(entry.getDisplayName() + ": já sincronizado");
                continue;
            }
            try {
                String productId = ensureStripeProduct(entry);
                Price price = Price.create(
                    PriceCreateParams.builder()
                        .setProduct(productId)
                        .setUnitAmount((long) entry.getMonthlyPriceCents())
                        .setCurrency("brl")
                        .setRecurring(
                            PriceCreateParams.Recurring.builder()
                                .setInterval(PriceCreateParams.Recurring.Interval.MONTH)
                                .build()
                        )
                        .putMetadata("planCode", entry.getCode())
                        .build()
                );
                entry.setStripePriceId(price.getId());
                planCatalogService.save(entry);
                messages.add(entry.getDisplayName() + ": criado (" + price.getId() + ")");
            } catch (StripeException exc) {
                messages.add(entry.getDisplayName() + ": falhou — " + exc.getMessage());
            }
        }
        return messages;
    }

    public record PriceChangeResult(
        String planCode,
        Integer fromPriceCents,
        int toPriceCents,
        String stripePriceId,
        int migratedSubscriptions,
        String warning
    ) {}
}
