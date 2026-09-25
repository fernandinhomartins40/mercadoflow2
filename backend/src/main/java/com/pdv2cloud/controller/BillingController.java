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

    public BillingController(StripeService stripeService, MarketAccessService marketAccessService) {
        this.stripeService = stripeService;
        this.marketAccessService = marketAccessService;
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
    }
}
