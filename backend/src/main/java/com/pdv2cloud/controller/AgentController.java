package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.AgentProfileResponse;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.security.AgentAuthenticationToken;
import com.pdv2cloud.security.AgentPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    @Autowired
    private MarketRepository marketRepository;

    @GetMapping("/me")
    public ResponseEntity<AgentProfileResponse> me(Authentication authentication) {
        if (!(authentication instanceof AgentAuthenticationToken)) {
            return ResponseEntity.status(401).build();
        }
        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        String marketName = marketRepository.findById(principal.getMarketId())
            .map(market -> market.getName())
            .orElse("Mercado");

        AgentProfileResponse response = AgentProfileResponse.builder()
            .agentKeyId(principal.getAgentKeyId())
            .marketId(principal.getMarketId())
            .marketName(marketName)
            .build();

        return ResponseEntity.ok(response);
    }
}
