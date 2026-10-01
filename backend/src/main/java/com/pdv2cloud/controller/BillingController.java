package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.StripeService;
import com.stripe.exception.StripeException;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Contratação e gestão da assinatura pelo próprio cliente.
 *
 * Ambas as rotas apenas devolvem uma URL do Stripe: o pagamento e a gestão do
 * cartão acontecem em páginas hospedadas por ele, então nenhum dado sensível
 * passa por aqui.
 *
 * Restrito a MARKET_OWNER: contratar plano e alterar cobrança é decisão do dono
 * da conta, não de qualquer usuário do mercado.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/billing")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
@Slf4j
public class BillingController {

    private final StripeService stripeService;
    private final MarketAccessService marketAccessService;
    private final com.pdv2cloud.service.billing.AsaasService asaas;
    private final com.pdv2cloud.service.billing.SubscriptionService subscriptions;

    public BillingController(StripeService stripeService, MarketAccessService marketAccessService,
                             com.pdv2cloud.service.billing.AsaasService asaas,
                             com.pdv2cloud.service.billing.SubscriptionService subscriptions) {
        this.stripeService = stripeService;
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
        response.put("checkoutEnabled", stripeService.isConfigured());
        response.put("essencialAvailable",
            stripeService.priceIdFor(PlanType.ESSENCIAL).isPresent());
        response.put("profissionalAvailable",
            stripeService.priceIdFor(PlanType.PROFISSIONAL).isPresent());
        // Pix e boleto pelo Asaas, ao lado do cartão no Stripe.
        response.put("cardEnabled", stripeService.isConfigured());
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
            if (!"CARTAO".equals(method)) {
                UUID root = subscriptions.rootOf(marketId);
                if (!root.equals(marketId)) {
                    throw new IllegalArgumentException("Esta loja é filial: a assinatura é contratada pela matriz da rede.");
                }
                var current = subscriptions.of(root);
                var checkout = asaas.checkout(root, request.getPlan(), method, current);
                if (checkout.changedInPlace()) {
                    subscriptions.paymentConfirmed(root, request.getPlan(), com.pdv2cloud.service.billing.AsaasService.PROVIDER,
                        null, null, null, null, "Troca de plano (" + authentication.getName() + ")");
                    return ResponseEntity.ok(Map.of("url", "/app/planos?checkout=alterado"));
                }
                return ResponseEntity.ok(Map.of("url", checkout.url()));
            }
            String url = stripeService.createCheckoutSession(marketId, request.getPlan());
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        } catch (StripeException exc) {
            log.error("Falha ao criar checkout do mercado {}: {}", marketId, exc.getMessage(), exc);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("error", "Não foi possível abrir o pagamento. Tente novamente em instantes."));
        }
    }

    /**
     * Fatura em aberto para o botão "Pagar agora": no Asaas, a fatura vencida
     * (ou a da contratação ainda não paga); no Stripe, o portal do cartão.
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
            if ("STRIPE".equals(s.provider())) {
                return ResponseEntity.ok(Map.of("url", stripeService.createPortalSession(marketId)));
            }
            return ResponseEntity.badRequest().body(Map.of("error", "Não há fatura em aberto. Escolha um plano para assinar."));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        } catch (StripeException exc) {
            log.error("Falha ao abrir portal do mercado {}: {}", marketId, exc.getMessage(), exc);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("error", "Não foi possível abrir o pagamento agora."));
        }
    }

    /** Cancela a assinatura por Pix/boleto: vale até o fim do período pago e volta ao Grátis. */
    @PostMapping("/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable("marketId") UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            var s = subscriptions.of(marketId);
            if ("STRIPE".equals(s.provider())) {
                return ResponseEntity.badRequest().body(Map.of("error", "Assinatura no cartão: cancele em \"Gerenciar assinatura\"."));
            }
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

    /** Abre o Billing Portal: trocar cartão, mudar plano ou cancelar. */
    @PostMapping("/portal")
    public ResponseEntity<Map<String, Object>> portal(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            String url = stripeService.createPortalSession(marketId);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalArgumentException | IllegalStateException exc) {
            return ResponseEntity.badRequest().body(Map.of("error", exc.getMessage()));
        } catch (StripeException exc) {
            log.error("Falha ao abrir portal do mercado {}: {}", marketId, exc.getMessage(), exc);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("error", "Não foi possível abrir a gestão da assinatura."));
        }
    }

    @Data
    public static class CheckoutRequest {
        @NotNull(message = "Informe o plano")
        private PlanType plan;

        /** CARTAO (Stripe, padrão), PIX ou BOLETO (Asaas). */
        private String method;
    }
}
