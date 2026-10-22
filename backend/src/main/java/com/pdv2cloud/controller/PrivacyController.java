package com.pdv2cloud.controller;

import com.pdv2cloud.security.AppUserDetails;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.privacy.ConsumerAnonymizationService;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** "Pedido de cliente (LGPD)": o mercado atende o consumidor que pediu para apagar o CPF (S5). */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/privacy")
public class PrivacyController {

    private final MarketAccessService access;
    private final ConsumerAnonymizationService anonymization;

    public PrivacyController(MarketAccessService access, ConsumerAnonymizationService anonymization) {
        this.access = access;
        this.anonymization = anonymization;
    }

    @PostMapping("/consumer-anonymization")
    public ConsumerAnonymizationService.Result anonymize(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                                         Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        if (auth.getPrincipal() instanceof AppUserDetails user) {
            ConsumerAnonymizationService.assertCanRequest(user.getTeamRole());
        }
        Object cpf = body == null ? null : body.get("cpf");
        return anonymization.anonymize(marketId, cpf == null ? null : String.valueOf(cpf));
    }
}
