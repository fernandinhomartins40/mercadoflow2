package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.chat.DataChatService;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Créditos de IA do mercado: saldo, pacotes, extrato e compra por Pix. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/ai-credits")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class AiCreditsController {

    private final AiWalletService wallets;
    private final DataChatService chat;
    private final MarketAccessService access;

    public AiCreditsController(AiWalletService wallets, DataChatService chat, MarketAccessService access) {
        this.wallets = wallets;
        this.chat = chat;
        this.access = access;
    }

    @GetMapping
    public Map<String, Object> status(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("wallet", wallets.wallet(marketId));
        out.put("plans", wallets.plans(true));
        out.put("ledger", wallets.ledger(marketId));
        out.put("orders", wallets.orders(marketId));
        out.put("iaLiberada", chat.platformAllowed(marketId));
        String block = chat.platformBlockMessage(marketId);
        if (block != null) {
            out.put("aviso", block);
        }
        return out;
    }

    @PostMapping("/orders")
    public AiWalletService.Order createOrder(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                             Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return wallets.createPixOrder(marketId, UUID.fromString(String.valueOf(body.get("planId"))));
    }

    @GetMapping("/orders/{orderId}")
    public AiWalletService.Order order(@PathVariable UUID marketId, @PathVariable UUID orderId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return wallets.order(marketId, orderId);
    }
}
