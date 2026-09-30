package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.platform.DailyBriefService;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Copiloto do lojista: resumo do dia (texto pronto, para ler ou ouvir). */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/copilot")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class CopilotController {

    private final DailyBriefService briefs;
    private final MarketAccessService access;

    public CopilotController(DailyBriefService briefs, MarketAccessService access) {
        this.briefs = briefs;
        this.access = access;
    }

    @GetMapping("/brief")
    public DailyBriefService.Brief brief(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return briefs.today(marketId);
    }

    /** Refaz o resumo de hoje com os números atuais. */
    @PostMapping("/brief/refresh")
    public DailyBriefService.Brief refresh(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return briefs.generate(marketId, java.time.LocalDate.now());
    }
}
