package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.NetworkContract;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.NetworkContractRepository;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import com.stripe.exception.StripeException;
import com.stripe.model.Invoice;
import com.stripe.model.Price;
import com.stripe.model.Product;
import com.stripe.model.Subscription;
import com.stripe.param.InvoiceSendInvoiceParams;
import com.stripe.param.PriceCreateParams;
import com.stripe.param.ProductCreateParams;
import com.stripe.param.SubscriptionCancelParams;
import com.stripe.param.SubscriptionCreateParams;
import com.stripe.param.SubscriptionUpdateParams;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contratos sob medida do plano Rede, com cobrança por fatura.
 *
 * Redes não compram plano de prateleira: negociam valor e limites, e pagam por
 * boleto contra nota fiscal, com prazo. Por isso a assinatura usa
 * {@code collection_method=send_invoice} em vez de débito automático — o Stripe
 * emite a fatura, envia por e-mail e o cliente paga como preferir (boleto,
 * cartão, e Pix quando a capability for liberada).
 *
 * Sobre conciliação: não há leitura de retorno bancário. O Stripe confirma a
 * compensação do boleto e dispara {@code invoice.paid} no dia útil seguinte;
 * {@link NetworkInvoice} espelha esse estado para o painel responder quem deve
 * e há quantos dias sem consultar a API a cada tela.
 */
@Service
@Slf4j
public class NetworkContractService {

    private final NetworkContractRepository contractRepository;
    private final NetworkInvoiceRepository invoiceRepository;
    private final MarketRepository marketRepository;
    private final StripeService stripeService;
    private final SubscriptionEventService subscriptionEventService;

    public NetworkContractService(
        NetworkContractRepository contractRepository,
        NetworkInvoiceRepository invoiceRepository,
        MarketRepository marketRepository,
        StripeService stripeService,
        SubscriptionEventService subscriptionEventService
    ) {
        this.contractRepository = contractRepository;
        this.invoiceRepository = invoiceRepository;
        this.marketRepository = marketRepository;
        this.stripeService = stripeService;
        this.subscriptionEventService = subscriptionEventService;
    }

    // ── Contrato ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Optional<NetworkContract> activeContract(UUID marketId) {
        return contractRepository.findActiveByMarket(marketId);
    }

    @Transactional(readOnly = true)
    public List<NetworkContract> listAll() {
        return contractRepository.findAllWithMarket();
    }

    /**
     * Cria ou substitui o contrato da rede e liga a cobrança no Stripe.
     *
     * Os limites contratados são gravados como overrides no mercado, que é onde
     * {@link PlanService} os lê — assim o contrato define o comercial e o
     * mercado continua sendo a única fonte de limites em runtime.
     */
    @Transactional
    public ContractResult createOrUpdate(UUID marketId, ContractRequest request, String actorEmail) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));

        if (market.getParentMarket() != null) {
            throw new IllegalArgumentException(
                "Esta loja é filial: o contrato é firmado com a matriz da rede.");
        }
        if (request.monthlyPriceCents() == null || request.monthlyPriceCents() <= 0) {
            throw new IllegalArgumentException("Informe o valor mensal do contrato");
        }

        // Encerra o contrato anterior: o índice único garante um ativo por rede.
        contractRepository.findActiveByMarket(marketId).ifPresent(previous -> {
            previous.setStatus(NetworkContract.Status.ENDED);
            previous.setEndedAt(LocalDateTime.now());
            contractRepository.save(previous);
        });

        NetworkContract contract = new NetworkContract();
        contract.setMarket(market);
        contract.setMonthlyPriceCents(request.monthlyPriceCents());
        contract.setDaysUntilDue(request.daysUntilDue() != null ? request.daysUntilDue() : 15);
        contract.setInvoiceLimit(request.invoiceLimit());
        contract.setBranchLimit(request.branchLimit());
        contract.setPdvPerBranchLimit(request.pdvPerBranchLimit());
        contract.setPdvLimit(request.pdvLimit());
        contract.setSeatLimit(request.seatLimit());
        contract.setContactName(request.contactName());
        contract.setContactEmail(request.contactEmail());
        contract.setNotes(request.notes());
        contract.setCreatedBy(actorEmail);
        contractRepository.save(contract);

        // Espelha nos overrides do mercado: é de lá que PlanService lê.
        market.setPlanType(PlanType.REDE);
        market.setCustomPriceCents(request.monthlyPriceCents());
        market.setInvoiceLimitOverride(request.invoiceLimit());
        market.setBranchLimitOverride(request.branchLimit());
        market.setPdvPerBranchOverride(request.pdvPerBranchLimit());
        market.setPdvLimitOverride(request.pdvLimit());
        market.setSeatLimitOverride(request.seatLimit());
        market.setBillingStatus(MarketBillingStatus.ACTIVE);
        market.setIsActive(true);
        market.setPlanChangedAt(LocalDateTime.now());
        marketRepository.save(market);

        String warning = null;
        if (stripeService.isConfigured()) {
            try {
                setupStripeBilling(market, contract);
            } catch (StripeException exc) {
                // Contrato vale mesmo sem cobrança: o painel avisa e o super
                // admin pode tentar de novo, em vez de perder o cadastro.
                warning = "Contrato salvo, mas a cobrança no Stripe falhou: " + exc.getMessage();
                log.error("Falha ao configurar cobrança da rede {}: {}", marketId, exc.getMessage(), exc);
            }
        } else {
            warning = "Stripe não configurado: o contrato vale, mas nenhuma fatura será emitida.";
        }

        subscriptionEventService.recordPlanChange(
            market, market.getPlanType(), PlanType.REDE,
            String.format("Contrato de rede: R$ %.2f/mês", request.monthlyPriceCents() / 100.0),
            null
        );

        return new ContractResult(contractRepository.save(contract), warning);
    }

    /**
     * Cria o Price dedicado e a assinatura por fatura.
     *
     * O Price fica fora do catálogo público de propósito: é exclusivo desta
     * rede e não deve aparecer para contratação por ninguém.
     */
    private void setupStripeBilling(Market market, NetworkContract contract) throws StripeException {
        String customerId = stripeService.ensureCustomerFor(market);

        Product product = Product.create(
            ProductCreateParams.builder()
                .setName("Mercado Flow Rede — " + market.getName())
                .setDescription("Contrato sob medida")
                .putMetadata("app", "mercadoflow")
                .putMetadata("planCode", PlanType.REDE.name())
                .putMetadata("marketId", market.getId().toString())
                .build()
        );

        Price price = Price.create(
            PriceCreateParams.builder()
                .setProduct(product.getId())
                .setUnitAmount((long) contract.getMonthlyPriceCents())
                .setCurrency("brl")
                .setRecurring(
                    PriceCreateParams.Recurring.builder()
                        .setInterval(PriceCreateParams.Recurring.Interval.MONTH)
                        .build()
                )
                .putMetadata("marketId", market.getId().toString())
                .build()
        );
        contract.setStripePriceId(price.getId());

        // Substitui a assinatura anterior, se houver: duas ativas cobrariam o
        // cliente duas vezes.
        cancelStripeSubscription(contract.getStripeSubscriptionId());
        if (market.getStripeSubscriptionId() != null) {
            cancelStripeSubscription(market.getStripeSubscriptionId());
        }

        Subscription subscription = Subscription.create(
            SubscriptionCreateParams.builder()
                .setCustomer(customerId)
                .addItem(
                    SubscriptionCreateParams.Item.builder()
                        .setPrice(price.getId())
                        .setQuantity(1L)
                        .build()
                )
                // send_invoice: fatura com prazo em vez de débito automático,
                // que é como redes pagam (boleto contra nota fiscal).
                .setCollectionMethod(SubscriptionCreateParams.CollectionMethod.SEND_INVOICE)
                .setDaysUntilDue((long) contract.getDaysUntilDue())
                .setPaymentSettings(
                    SubscriptionCreateParams.PaymentSettings.builder()
                        .addPaymentMethodType(
                            SubscriptionCreateParams.PaymentSettings.PaymentMethodType.BOLETO)
                        .addPaymentMethodType(
                            SubscriptionCreateParams.PaymentSettings.PaymentMethodType.CARD)
                        .build()
                )
                .putMetadata("marketId", market.getId().toString())
                .putMetadata("planCode", PlanType.REDE.name())
                .putMetadata("contractId", contract.getId().toString())
                .build()
        );

        contract.setStripeSubscriptionId(subscription.getId());
        market.setStripeSubscriptionId(subscription.getId());
        market.setStripePriceId(price.getId());
        market.setStripeStatus(subscription.getStatus());
        marketRepository.save(market);

        log.info("Cobrança de rede configurada | market={} | subscription={} | valor={}",
            market.getId(), subscription.getId(), contract.getMonthlyPriceCents());
    }

    private void cancelStripeSubscription(String subscriptionId) {
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return;
        }
        try {
            Subscription.retrieve(subscriptionId)
                .cancel(SubscriptionCancelParams.builder().build());
        } catch (StripeException exc) {
            log.warn("Não foi possível cancelar a assinatura anterior {}: {}",
                subscriptionId, exc.getMessage());
        }
    }

    /** Encerra o contrato e cancela a cobrança. */
    @Transactional
    public String endContract(UUID marketId, boolean cancelImmediately, String reason) {
        NetworkContract contract = contractRepository.findActiveByMarket(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Esta rede não tem contrato ativo"));

        contract.setStatus(NetworkContract.Status.ENDED);
        contract.setEndedAt(LocalDateTime.now());
        contract.setNotes(reason);
        contractRepository.save(contract);

        String warning = null;
        if (stripeService.isConfigured() && contract.getStripeSubscriptionId() != null) {
            try {
                Subscription subscription = Subscription.retrieve(contract.getStripeSubscriptionId());
                if (cancelImmediately) {
                    subscription.cancel(SubscriptionCancelParams.builder().build());
                } else {
                    subscription.update(
                        SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(true).build()
                    );
                }
            } catch (StripeException exc) {
                warning = "Contrato encerrado, mas a assinatura no Stripe segue ativa: "
                    + exc.getMessage();
            }
        }

        marketRepository.findById(marketId).ifPresent(market -> {
            if (cancelImmediately) {
                market.setStripeSubscriptionId(null);
            }
            marketRepository.save(market);
        });

        return warning;
    }

    // ── Faturas ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<NetworkInvoice> invoicesOf(UUID marketId) {
        return invoiceRepository.findByMarket(marketId);
    }

    @Transactional(readOnly = true)
    public List<NetworkInvoice> overdueInvoices() {
        return invoiceRepository.findOverdue(LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public List<NetworkInvoice> openInvoices() {
        return invoiceRepository.findOpen();
    }

    /**
     * Reenvia a fatura por e-mail.
     *
     * Só funciona em faturas abertas: o Stripe recusa reenvio de fatura paga ou
     * cancelada, e insistir geraria confusão para o cliente.
     */
    @Transactional
    public String resendInvoice(UUID invoiceId) {
        NetworkInvoice invoice = invoiceRepository.findById(invoiceId)
            .orElseThrow(() -> new IllegalArgumentException("Fatura não encontrada"));

        if (!"open".equals(invoice.getStatus())) {
            throw new IllegalArgumentException(
                "Só é possível reenviar faturas em aberto (esta está " + invoice.getStatus() + ").");
        }
        if (!stripeService.isConfigured()) {
            throw new IllegalStateException("Stripe não configurado.");
        }

        try {
            Invoice.retrieve(invoice.getStripeInvoiceId())
                .sendInvoice(InvoiceSendInvoiceParams.builder().build());
            log.info("Fatura reenviada | invoice={}", invoice.getStripeInvoiceId());
            return null;
        } catch (StripeException exc) {
            log.error("Falha ao reenviar fatura {}: {}", invoice.getStripeInvoiceId(), exc.getMessage());
            return "Não foi possível reenviar: " + exc.getMessage();
        }
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record ContractRequest(
        Integer monthlyPriceCents,
        Integer daysUntilDue,
        Integer invoiceLimit,
        Integer branchLimit,
        Integer pdvPerBranchLimit,
        Integer pdvLimit,
        Integer seatLimit,
        String contactName,
        String contactEmail,
        String notes
    ) {}

    public record ContractResult(NetworkContract contract, String warning) {}
}
