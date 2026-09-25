package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.NetworkContract;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanPriceHistory;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.repository.PlanPriceHistoryRepository;
import com.pdv2cloud.service.BillingReportService;
import com.pdv2cloud.service.InvoiceReconciliationService;
import com.pdv2cloud.service.NetworkContractService;
import com.pdv2cloud.service.PlanCatalogService;
import com.pdv2cloud.service.StripeAdminService;
import com.pdv2cloud.service.SubscriptionAdminService;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Gestão de assinaturas do SaaS no painel do super admin.
 *
 * Complementa o SuperAdminController, que cuida de conteúdo (catálogo, crawler)
 * e de CRUD de usuários/mercados. Aqui fica tudo referente a plano, limites,
 * consumo e histórico de cobrança.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/subscriptions")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SubscriptionAdminController {

    private final SubscriptionAdminService subscriptionAdminService;
    private final PlanCatalogService planCatalogService;
    private final StripeAdminService stripeAdminService;
    private final BillingReportService billingReportService;
    private final PlanPriceHistoryRepository priceHistoryRepository;
    private final NetworkContractService networkContractService;
    private final InvoiceReconciliationService invoiceReconciliationService;

    public SubscriptionAdminController(
        SubscriptionAdminService subscriptionAdminService,
        PlanCatalogService planCatalogService,
        StripeAdminService stripeAdminService,
        BillingReportService billingReportService,
        PlanPriceHistoryRepository priceHistoryRepository,
        NetworkContractService networkContractService,
        InvoiceReconciliationService invoiceReconciliationService
    ) {
        this.subscriptionAdminService = subscriptionAdminService;
        this.planCatalogService = planCatalogService;
        this.stripeAdminService = stripeAdminService;
        this.billingReportService = billingReportService;
        this.priceHistoryRepository = priceHistoryRepository;
        this.networkContractService = networkContractService;
        this.invoiceReconciliationService = invoiceReconciliationService;
    }

    /** Painel: métricas agregadas + planos + assinaturas + fila de upgrade. */
    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("metrics", subscriptionAdminService.metrics());
        response.put("plans", subscriptionAdminService.listPlans());
        response.put("subscriptions", subscriptionAdminService.listSubscriptions());
        response.put("upgradeCandidates", subscriptionAdminService.listUpgradeCandidates());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/plans")
    public ResponseEntity<List<SubscriptionAdminService.PlanDescriptor>> plans() {
        return ResponseEntity.ok(subscriptionAdminService.listPlans());
    }

    @GetMapping
    public ResponseEntity<List<SubscriptionAdminService.SubscriptionRow>> list() {
        return ResponseEntity.ok(subscriptionAdminService.listSubscriptions());
    }

    /** Contas gratuitas prestes a estourar (ou já estouradas) o limite. */
    @GetMapping("/upgrade-candidates")
    public ResponseEntity<List<SubscriptionAdminService.SubscriptionRow>> upgradeCandidates() {
        return ResponseEntity.ok(subscriptionAdminService.listUpgradeCandidates());
    }

    @GetMapping("/{marketId}/history")
    public ResponseEntity<List<SubscriptionEvent>> history(@PathVariable("marketId") UUID marketId) {
        return ResponseEntity.ok(subscriptionAdminService.historyFor(marketId));
    }

    @GetMapping("/{marketId}/usage")
    public ResponseEntity<List<MarketUsageCounter>> usage(@PathVariable("marketId") UUID marketId) {
        return ResponseEntity.ok(subscriptionAdminService.usageHistoryFor(marketId));
    }

    @PatchMapping("/{marketId}/plan")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> changePlan(
        @PathVariable("marketId") UUID marketId,
        @RequestBody ChangePlanRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.changePlan(
            marketId, request.getPlan(), request.getReason(), authentication.getName()
        ));
    }

    @PatchMapping("/{marketId}/status")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> changeStatus(
        @PathVariable("marketId") UUID marketId,
        @RequestBody ChangeStatusRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.changeStatus(
            marketId, request.getStatus(), request.getReason(), authentication.getName(),
            request.getCancelBilling() != null
                ? request.getCancelBilling()
                : SubscriptionAdminService.CancelBilling.KEEP
        ));
    }

    /** Limites negociados. Campos nulos restauram o padrão do plano. */
    @PatchMapping("/{marketId}/limits")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> updateLimits(
        @PathVariable("marketId") UUID marketId,
        @RequestBody UpdateLimitsRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.updateLimits(
            marketId,
            request.getInvoiceLimit(),
            request.getBranchLimit(),
            request.getPdvPerBranchLimit(),
            request.getPdvLimit(),
            request.getSeatLimit(),
            request.getCustomPriceCents(),
            request.getUnlimited(),
            request.getReason(),
            authentication.getName()
        ));
    }

    // ── Catálogo de planos (preços e limites editáveis) ──────────────────────

    /** Planos com preço, limites e vínculo com o Stripe. */
    @GetMapping("/catalog")
    public ResponseEntity<List<PlanCatalogEntry>> catalog() {
        return ResponseEntity.ok(planCatalogService.listAll());
    }

    /**
     * Altera o preço do plano e cria o Price correspondente no Stripe.
     *
     * Por padrão o novo valor vale só para novas contratações — quem já assina
     * continua no preço contratado até ser migrado de propósito.
     */
    @PatchMapping("/catalog/{planCode}/price")
    public ResponseEntity<Map<String, Object>> changePrice(
        @PathVariable("planCode") String planCode,
        @RequestBody ChangePriceRequest request,
        Authentication authentication
    ) {
        StripeAdminService.PriceChangeResult result = stripeAdminService.changePlanPrice(
            planCode,
            request.getPriceCents(),
            Boolean.TRUE.equals(request.getMigrateExisting()),
            request.getReason(),
            authentication.getName()
        );

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("planCode", result.planCode());
        response.put("fromPriceCents", result.fromPriceCents());
        response.put("toPriceCents", result.toPriceCents());
        response.put("stripePriceId", result.stripePriceId());
        response.put("migratedSubscriptions", result.migratedSubscriptions());
        response.put("warning", result.warning());
        return ResponseEntity.ok(response);
    }

    /** Limites e apresentação do plano. Preço tem rota própria (toca o Stripe). */
    @PatchMapping("/catalog/{planCode}")
    public ResponseEntity<PlanCatalogEntry> updatePlan(
        @PathVariable("planCode") String planCode,
        @RequestBody UpdatePlanRequest request
    ) {
        PlanCatalogEntry entry = planCatalogService.entryFor(PlanType.fromString(planCode));
        if (request.getDisplayName() != null) entry.setDisplayName(request.getDisplayName());
        if (request.getDescription() != null) entry.setDescription(request.getDescription());
        if (request.getMonthlyInvoiceLimit() != null) entry.setMonthlyInvoiceLimit(request.getMonthlyInvoiceLimit());
        if (request.getBranchLimit() != null) entry.setBranchLimit(request.getBranchLimit());
        if (request.getPdvPerBranchLimit() != null) entry.setPdvPerBranchLimit(request.getPdvPerBranchLimit());
        if (request.getPdvLimit() != null) entry.setPdvLimit(request.getPdvLimit());
        if (request.getUserSeatLimit() != null) entry.setUserSeatLimit(request.getUserSeatLimit());
        if (request.getHistoryRetentionDays() != null) entry.setHistoryRetentionDays(request.getHistoryRetentionDays());
        if (request.getFullInsights() != null) entry.setFullInsights(request.getFullInsights());
        if (request.getPurchasable() != null) entry.setPurchasable(request.getPurchasable());
        if (request.getIsActive() != null) entry.setIsActive(request.getIsActive());
        return ResponseEntity.ok(planCatalogService.save(entry));
    }

    /** Cria no Stripe os produtos/preços dos planos que ainda não têm. */
    @PostMapping("/catalog/sync-stripe")
    public ResponseEntity<Map<String, Object>> syncCatalog() {
        return ResponseEntity.ok(Map.of("results", stripeAdminService.syncCatalogToStripe()));
    }

    /** Histórico de reajustes: qual preço vigorava em cada data. */
    @GetMapping("/catalog/price-history")
    public ResponseEntity<List<PlanPriceHistory>> priceHistory() {
        return ResponseEntity.ok(priceHistoryRepository.findTop50ByOrderByCreatedAtDesc());
    }

    // ── Contratos de rede (plano sob medida) ─────────────────────────────────

    @GetMapping("/contracts")
    public ResponseEntity<List<NetworkContract>> contracts() {
        return ResponseEntity.ok(networkContractService.listAll());
    }

    @GetMapping("/{marketId}/contract")
    public ResponseEntity<NetworkContract> contractOf(@PathVariable("marketId") UUID marketId) {
        return networkContractService.activeContract(marketId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Define preço e limites da rede e liga a cobrança por fatura no Stripe.
     *
     * Substitui o contrato anterior, se houver — só um fica ativo por rede.
     */
    @PostMapping("/{marketId}/contract")
    public ResponseEntity<Map<String, Object>> saveContract(
        @PathVariable("marketId") UUID marketId,
        @RequestBody NetworkContractRequest request,
        Authentication authentication
    ) {
        try {
            NetworkContractService.ContractResult result = networkContractService.createOrUpdate(
                marketId,
                new NetworkContractService.ContractRequest(
                    request.getMonthlyPriceCents(),
                    request.getDaysUntilDue(),
                    request.getInvoiceLimit(),
                    request.getBranchLimit(),
                    request.getPdvPerBranchLimit(),
                    request.getPdvLimit(),
                    request.getSeatLimit(),
                    request.getContactName(),
                    request.getContactEmail(),
                    request.getNotes()
                ),
                authentication.getName()
            );

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("contract", result.contract());
            response.put("warning", result.warning());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    @DeleteMapping("/{marketId}/contract")
    public ResponseEntity<Map<String, Object>> endContract(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "immediately", defaultValue = "false") boolean immediately,
        @RequestParam(value = "reason", required = false) String reason
    ) {
        try {
            String warning = networkContractService.endContract(marketId, immediately, reason);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("ended", true);
            response.put("warning", warning);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    // ── Faturas e conciliação ────────────────────────────────────────────────

    /** Contas a receber: aberto, vencido e recebido nos últimos 30/90 dias. */
    @GetMapping("/receivables")
    public ResponseEntity<Map<String, Object>> receivables() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("summary", invoiceReconciliationService.receivables());
        response.put("overdue", networkContractService.overdueInvoices());
        response.put("open", networkContractService.openInvoices());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{marketId}/invoices")
    public ResponseEntity<List<NetworkInvoice>> invoices(@PathVariable("marketId") UUID marketId) {
        return ResponseEntity.ok(networkContractService.invoicesOf(marketId));
    }

    /** Reenvia a fatura por e-mail. Só vale para faturas em aberto. */
    @PostMapping("/invoices/{invoiceId}/resend")
    public ResponseEntity<Map<String, Object>> resendInvoice(@PathVariable("invoiceId") UUID invoiceId) {
        try {
            String warning = networkContractService.resendInvoice(invoiceId);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("sent", warning == null);
            response.put("warning", warning);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    // ── Relatórios de faturamento ────────────────────────────────────────────

    @GetMapping("/reports/billing")
    public ResponseEntity<BillingReportService.BillingReport> billingReport() {
        return ResponseEntity.ok(billingReportService.build());
    }

    // ── Rede ─────────────────────────────────────────────────────────────────

    /** Lojas da rede a que este mercado pertence. */
    @GetMapping("/{marketId}/network")
    public ResponseEntity<List<SubscriptionAdminService.NetworkMember>> network(
        @PathVariable("marketId") UUID marketId
    ) {
        return ResponseEntity.ok(subscriptionAdminService.networkOf(marketId));
    }

    /**
     * Empresas com várias contas soltas sob o mesmo CNPJ raiz — redes que se
     * fatiaram antes do bloqueio no cadastro existir.
     */
    @GetMapping("/suspected-networks")
    public ResponseEntity<List<SubscriptionAdminService.SuspectedNetwork>> suspectedNetworks() {
        return ResponseEntity.ok(subscriptionAdminService.listSuspectedNetworks());
    }

    /** Transforma contas soltas numa rede: vincula a loja como filial da matriz. */
    @PostMapping("/{marketId}/branches")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> attachBranch(
        @PathVariable("marketId") UUID marketId,
        @RequestBody AttachBranchRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.attachBranch(
            marketId, request.getBranchMarketId(), authentication.getName()
        ));
    }

    @DeleteMapping("/branches/{branchMarketId}")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> detachBranch(
        @PathVariable("branchMarketId") UUID branchMarketId,
        Authentication authentication
    ) {
        return ResponseEntity.ok(
            subscriptionAdminService.detachBranch(branchMarketId, authentication.getName()));
    }

    @Data
    public static class ChangePlanRequest {
        @NotNull(message = "Informe o plano")
        private PlanType plan;
        private String reason;
    }

    @Data
    public static class ChangeStatusRequest {
        @NotNull(message = "Informe o status")
        private MarketBillingStatus status;
        private String reason;
        /** KEEP | AT_PERIOD_END | IMMEDIATELY. Padrão: não mexe na cobrança. */
        private SubscriptionAdminService.CancelBilling cancelBilling;
    }

    @Data
    public static class NetworkContractRequest {
        @NotNull(message = "Informe o valor mensal")
        private Integer monthlyPriceCents;
        /** Dias até o vencimento da fatura. Padrão 15. */
        private Integer daysUntilDue;
        private Integer invoiceLimit;
        private Integer branchLimit;
        private Integer pdvPerBranchLimit;
        private Integer pdvLimit;
        private Integer seatLimit;
        private String contactName;
        /** Para onde o Stripe envia a fatura. */
        private String contactEmail;
        private String notes;
    }

    @Data
    public static class ChangePriceRequest {
        @NotNull(message = "Informe o preço em centavos")
        private Integer priceCents;
        /** Quando true, move também as assinaturas ativas para o novo valor. */
        private Boolean migrateExisting;
        private String reason;
    }

    @Data
    public static class UpdatePlanRequest {
        private String displayName;
        private String description;
        private Integer monthlyInvoiceLimit;
        private Integer branchLimit;
        private Integer pdvPerBranchLimit;
        private Integer pdvLimit;
        private Integer userSeatLimit;
        private Integer historyRetentionDays;
        private Boolean fullInsights;
        private Boolean purchasable;
        private Boolean isActive;
    }

    @Data
    public static class UpdateLimitsRequest {
        private Integer invoiceLimit;
        private Integer branchLimit;
        private Integer pdvPerBranchLimit;
        private Integer pdvLimit;
        private Integer seatLimit;
        /** Preço negociado do plano Rede, em centavos. */
        private Integer customPriceCents;
        private Boolean unlimited;
        private String reason;
    }

    @Data
    public static class AttachBranchRequest {
        @NotNull(message = "Informe a loja a vincular")
        private UUID branchMarketId;
    }
}
