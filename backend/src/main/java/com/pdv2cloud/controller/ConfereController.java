package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.StripeService;
import com.pdv2cloud.service.confere.ConfereService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** MercadoFlow Confere: leitura de notas de fornecedor e conferência. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/confere")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class ConfereController {

    private final ConfereService confere;
    private final StripeService stripe;
    private final MarketAccessService access;

    public ConfereController(ConfereService confere, StripeService stripe, MarketAccessService access) {
        this.confere = confere;
        this.stripe = stripe;
        this.access = access;
    }

    @GetMapping("/status")
    public ConfereService.Status status(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.status(marketId);
    }

    @PostMapping("/terms")
    public ConfereService.Status acceptTerms(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.acceptTerms(marketId, String.valueOf(body.get("version")), auth.getName());
    }

    @PutMapping("/manufacturer-visibility")
    public ConfereService.Status manufacturerVisibility(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                                       Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.setManufacturerVisibility(marketId, Boolean.TRUE.equals(body.get("visible")), auth.getName());
    }

    @PostMapping("/read")
    public ConfereService.ReadResult read(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.read(marketId, String.valueOf(body.get("accessKey")), auth.getName());
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ConfereService.ReadResult upload(@PathVariable UUID marketId, @RequestParam("file") MultipartFile file,
                                            Authentication auth) throws java.io.IOException {
        access.assertCanAccessMarket(marketId, auth);
        if (file.getSize() > 3_000_000) {
            throw new IllegalArgumentException("Arquivo grande demais para um XML de nota");
        }
        return confere.upload(marketId, new String(file.getBytes(), StandardCharsets.UTF_8));
    }

    @GetMapping("/documents")
    public List<ConfereService.DocumentSummary> documents(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.documents(marketId);
    }

    @GetMapping("/documents/{id}")
    public ConfereService.DocumentView document(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.document(marketId, id);
    }

    @PutMapping("/documents/{id}/check")
    public ConfereService.Check saveCheck(@PathVariable UUID marketId, @PathVariable UUID id,
                                          @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.saveCheck(marketId, id, body, auth.getName());
    }

    @PostMapping(value = "/certificate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ConfereService.CertificateInfo saveCertificate(@PathVariable UUID marketId, @RequestParam("file") MultipartFile file,
                                                          @RequestParam(value = "password", required = false) String password,
                                                          @RequestParam(value = "uf", required = false) String uf,
                                                          Authentication auth) throws java.io.IOException {
        access.assertCanAccessMarket(marketId, auth);
        return confere.saveCertificate(marketId, file.getBytes(), password, uf);
    }

    @DeleteMapping("/certificate")
    public Map<String, Object> removeCertificate(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        confere.removeCertificate(marketId);
        return Map.of("removed", true);
    }

    @PostMapping("/sync")
    public Map<String, Object> sync(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return Map.of("message", confere.sync(marketId));
    }

    @GetMapping("/ledger")
    public List<ConfereService.LedgerEntry> ledger(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.ledger(marketId);
    }

    @GetMapping("/orders")
    public List<ConfereService.Order> orders(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.orders(marketId);
    }

    @GetMapping("/orders/{id}")
    public ConfereService.Order order(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return confere.order(marketId, id);
    }

    /** Pix na chave da plataforma (padrão) ou checkout do Stripe. */
    @PostMapping("/orders")
    public ConfereService.Order createOrder(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                            Authentication auth) throws com.stripe.exception.StripeException {
        access.assertCanAccessMarket(marketId, auth);
        UUID planId = UUID.fromString(String.valueOf(body.get("planId")));
        if ("STRIPE".equals(body.get("method"))) {
            if (!confere.status(marketId).stripeAvailable() || !stripe.isConfigured()) {
                throw new IllegalArgumentException("Pagamento pelo Stripe indisponível");
            }
            ConfereService.Plan plan = confere.plan(planId);
            StripeService.OneTimeCheckout co = stripe.createOneTimeCheckout(marketId, plan.priceCents(),
                "MercadoFlow Confere — " + plan.reads() + " leituras de nota",
                Map.of("kind", "confere", "marketId", marketId.toString(), "planId", planId.toString()),
                "/confere/creditos?pagamento=ok", "/confere/creditos?pagamento=cancelado");
            UUID id = confere.createStripeOrder(marketId, planId, co.sessionId());
            ConfereService.Order o = confere.order(marketId, id);
            return new ConfereService.Order(o.id(), o.planName(), o.reads(), o.amountCents(), o.method(), o.status(), o.txid(),
                null, null, co.url(), o.createdAt(), o.paidAt());
        }
        return confere.createPixOrder(marketId, planId);
    }
}
