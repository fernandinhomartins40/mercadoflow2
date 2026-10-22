package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.MarketAccessService;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Contratação e gestão da assinatura pelo próprio cliente.
 *
 * O pagamento (Pix, boleto e cartão) acontece em páginas hospedadas pelo
 * Asaas, então nenhum dado de cartão passa por aqui.
 *
 * Restrito a MARKET_OWNER: contratar plano e alterar cobrança é decisão do dono
 * da conta, não de qualquer usuário do mercado.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/billing")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
@Slf4j
public class BillingController {

    private final MarketAccessService marketAccessService;
    private final com.pdv2cloud.service.billing.AsaasService asaas;
    private final com.pdv2cloud.service.billing.SubscriptionService subscriptions;

    public BillingController(MarketAccessService marketAccessService,
                             com.pdv2cloud.service.billing.AsaasService asaas,
                             com.pdv2cloud.service.billing.SubscriptionService subscriptions) {
        this.marketAccessService = marketAccessService;
        this.asaas = asaas;
        this.subscriptions = subscriptions;
    }

    /** Se a contratação online está disponível — a UI usa para decidir o botão. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        Map<String, Object> response = new LinkedHashMap<>();
        // Contratação online só pelo Asaas (Pix, boleto e cartão).
        response.put("checkoutEnabled", asaas.enabled());
        response.put("essencialAvailable", asaas.enabled());
        response.put("profissionalAvailable", asaas.enabled());
        response.put("cardEnabled", asaas.enabled());
        response.put("cardViaAsaas", asaas.enabled());
        response.put("pixEnabled", asaas.enabled());
        response.put("boletoEnabled", asaas.enabled());
        return ResponseEntity.ok(response);
    }

    /** Inicia a contratação e devolve a URL do Checkout. */
    @PostMapping("/checkout")
    public ResponseEntity<Map<String, Object>> checkout(
        @PathVariable("marketId") UUID marketId,
        @RequestBody CheckoutRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            String method = request.getMethod() == null ? "CARTAO" : request.getMethod().toUpperCase();
            // Em atraso, só sobe de plano: descer reduziria a fatura vencida (D-02).
            com.pdv2cloud.service.billing.SubscriptionService.assertCanChangePlan(subscriptions.of(marketId), request.getPlan());
            if (!asaas.enabled()) {
                throw new IllegalStateException("Pagamento online ainda não está configurado. Fale com o comercial para contratar.");
            }
            UUID root = subscriptions.rootOf(marketId);
            if (!root.equals(marketId)) {
                throw new IllegalArgumentException("Esta loja é filial: a assinatura é contratada pela matriz da rede.");
            }
            var current = subscriptions.of(root);
            var checkout = asaas.checkout(root, request.getPlan(), method, current);
            if (checkout.changedInPlace()) {
                // Só o plano muda: atraso e restrição continuam até o pagamento (REC-01).
                subscriptions.changePlan(root, request.getPlan(), "Troca de plano (" + authentication.getName() + ")");
                return ResponseEntity.ok(Map.of("url", "/app/planos?checkout=alterado"));
            }
            return ResponseEntity.ok(Map.of("url", checkout.url()));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    /**
     * Fatura em aberto para o botão "Pagar agora": no Asaas, a fatura vencida
     * (ou a da contratação ainda não paga).
     */
    @PostMapping("/pay")
    public ResponseEntity<Map<String, Object>> pay(@PathVariable("marketId") UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            var s = subscriptions.of(marketId);
            if (com.pdv2cloud.service.billing.AsaasService.PROVIDER.equals(s.provider())) {
                var url = asaas.openInvoiceUrl(s.providerSubscriptionId());
                if (url.isPresent()) {
                    return ResponseEntity.ok(Map.of("url", url.get()));
                }
            }
            if (s.pendingInvoiceUrl() != null) {
                return ResponseEntity.ok(Map.of("url", s.pendingInvoiceUrl()));
            }
            return ResponseEntity.badRequest().body(Map.of("error", "Não há fatura em aberto. Escolha um plano para assinar."));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    /** Cancela a assinatura por Pix/boleto: vale até o fim do período pago e volta ao Grátis. */
    @PostMapping("/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable("marketId") UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            var s = subscriptions.of(marketId);
            if (!com.pdv2cloud.service.billing.AsaasService.PROVIDER.equals(s.provider())) {
                return ResponseEntity.badRequest().body(Map.of("error", "Não há assinatura paga para cancelar."));
            }
            asaas.cancelSubscription(s.providerSubscriptionId());
            subscriptions.cancel(s.marketId(), true, "Cancelada pelo cliente (" + authentication.getName() + ")");
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        }
    }

    @Data
    public static class CheckoutRequest {
        @NotNull(message = "Informe o plano")
        private PlanType plan;

        /** CARTAO (padrão), PIX ou BOLETO, todos pelo Asaas. */
        private String method;
    }
}
