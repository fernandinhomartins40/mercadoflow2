package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.NetworkContract;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.NetworkContractRepository;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contratos sob medida do plano Rede.
 *
 * Redes não compram plano de prateleira: negociam valor e limites. A cobrança
 * da rede é combinada e emitida pelo comercial (a Stripe, que emitia as faturas,
 * não é mais usada). {@link NetworkInvoice} guarda o histórico das faturas antigas.
 */
@Service
@Slf4j
public class NetworkContractService {

    /** Assinatura única: muda junto quando o plano ou o estado é alterado por aqui. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.pdv2cloud.service.billing.SubscriptionService subscriptionSync;


    private final NetworkContractRepository contractRepository;
    private final NetworkInvoiceRepository invoiceRepository;
    private final MarketRepository marketRepository;
    private final SubscriptionEventService subscriptionEventService;

    public NetworkContractService(
        NetworkContractRepository contractRepository,
        NetworkInvoiceRepository invoiceRepository,
        MarketRepository marketRepository,
        SubscriptionEventService subscriptionEventService
    ) {
        this.contractRepository = contractRepository;
        this.invoiceRepository = invoiceRepository;
        this.marketRepository = marketRepository;
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
     * Cria ou substitui o contrato da rede.
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
        if (subscriptionSync != null) { subscriptionSync.syncFromMarket(market, "contrato de rede"); }

        // Sem cobrança automática: o comercial emite a cobrança da rede.
        String warning = "Contrato salvo. A cobrança da rede é emitida pelo comercial.";

        subscriptionEventService.recordPlanChange(
            market, market.getPlanType(), PlanType.REDE,
            String.format("Contrato de rede: R$ %.2f/mês", request.monthlyPriceCents() / 100.0),
            null
        );

        return new ContractResult(contractRepository.save(contract), warning);
    }

    /** Encerra o contrato (a cobrança da rede é encerrada pelo comercial). */
    @Transactional
    public String endContract(UUID marketId, boolean cancelImmediately, String reason) {
        NetworkContract contract = contractRepository.findActiveByMarket(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Esta rede não tem contrato ativo"));

        contract.setStatus(NetworkContract.Status.ENDED);
        contract.setEndedAt(LocalDateTime.now());
        contract.setNotes(reason);
        contractRepository.save(contract);

        return null;
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
     * Reenvio de fatura por e-mail: existia só na Stripe, que não é mais usada.
     * Devolve o aviso (a régua e o painel mostram em vez de reenviar).
     */
    @Transactional
    public String resendInvoice(UUID invoiceId) {
        NetworkInvoice invoice = invoiceRepository.findById(invoiceId)
            .orElseThrow(() -> new IllegalArgumentException("Fatura não encontrada"));

        log.info("Reenvio de fatura antiga pedido e recusado | invoice={}", invoice.getId());
        return "O reenvio automático de faturas foi desligado. Envie a cobrança da rede pelo comercial.";
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
