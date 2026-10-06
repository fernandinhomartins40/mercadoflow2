package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.OperationPanelService;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Números da operação no Início: hoje, semana ou mês, sempre contra o mesmo trecho da semana anterior. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}/analytics/operation")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class OperationPanelController {

    private final OperationPanelService panel;
    private final MarketAccessService access;

    public OperationPanelController(OperationPanelService panel, MarketAccessService access) {
        this.panel = panel;
        this.access = access;
    }

    @GetMapping
    public OperationPanelService.Panel get(@PathVariable("id") UUID id,
                                           @RequestParam(name = "period", required = false) String period,
                                           Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        return panel.panel(id, period);
    }
}
