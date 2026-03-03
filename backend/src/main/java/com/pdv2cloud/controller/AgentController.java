package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.AgentProfileResponse;
import com.pdv2cloud.model.dto.AgentInvoicePresenceRequest;
import com.pdv2cloud.model.dto.AgentInvoicePresenceResponse;
import com.pdv2cloud.model.dto.AgentSyncStatusResponse;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.security.AgentAuthenticationToken;
import com.pdv2cloud.security.AgentPrincipal;
import com.pdv2cloud.service.AgentApiKeyService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private AgentApiKeyService agentApiKeyService;

    @Autowired
    private InvoiceRepository invoiceRepository;

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

    @GetMapping("/sync-status")
    public ResponseEntity<AgentSyncStatusResponse> syncStatus(Authentication authentication) {
        if (!(authentication instanceof AgentAuthenticationToken)) {
            return ResponseEntity.status(401).build();
        }

        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        String marketName = marketRepository.findById(principal.getMarketId())
            .map(market -> market.getName())
            .orElse("Mercado");

        AgentSyncStatusResponse response = AgentSyncStatusResponse.builder()
            .marketId(principal.getMarketId())
            .marketName(marketName)
            .totalInvoices(invoiceRepository.countByMarket_Id(principal.getMarketId()))
            .invoicesLast24h(
                invoiceRepository.countByMarket_IdAndProcessedAtAfter(
                    principal.getMarketId(),
                    LocalDateTime.now().minusHours(24)
                )
            )
            .lastInvoiceProcessedAt(
                invoiceRepository.findFirstByMarket_IdOrderByProcessedAtDesc(principal.getMarketId())
                    .map(Invoice::getProcessedAt)
                    .orElse(null)
            )
            .recentInvoices(
                invoiceRepository.findRecentInvoiceSummaries(principal.getMarketId(), PageRequest.of(0, 5))
            )
            .build();

        return ResponseEntity.ok(response);
    }

    @PostMapping("/invoices/presence")
    public ResponseEntity<AgentInvoicePresenceResponse> invoicePresence(
        @RequestBody(required = false) AgentInvoicePresenceRequest request,
        Authentication authentication
    ) {
        if (!(authentication instanceof AgentAuthenticationToken)) {
            return ResponseEntity.status(401).build();
        }

        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        List<String> requested = request != null && request.getChavesNFe() != null
            ? request.getChavesNFe()
            : List.of();

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String chave : requested) {
            if (chave == null) {
                continue;
            }
            String trimmed = chave.trim();
            if (!trimmed.isEmpty()) {
                normalized.add(trimmed);
            }
            if (normalized.size() >= 500) {
                break;
            }
        }

        List<String> present = normalized.isEmpty()
            ? List.of()
            : invoiceRepository.findExistingChavesByMarketIdAndChaveNFeIn(
                principal.getMarketId(),
                new ArrayList<>(normalized)
            );

        LinkedHashSet<String> presentSet = new LinkedHashSet<>(present);
        List<String> missing = normalized.stream()
            .filter(chave -> !presentSet.contains(chave))
            .toList();

        AgentInvoicePresenceResponse response = AgentInvoicePresenceResponse.builder()
            .present(new ArrayList<>(presentSet))
            .missing(missing)
            .build();

        return ResponseEntity.ok(response);
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<HeartbeatResponse> heartbeat(Authentication authentication) {
        if (!(authentication instanceof AgentAuthenticationToken)) {
            return ResponseEntity.status(401).build();
        }

        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        agentApiKeyService.updateHeartbeat(principal.getAgentKeyId());

        HeartbeatResponse response = HeartbeatResponse.builder()
            .status("ok")
            .timestamp(java.time.LocalDateTime.now())
            .build();

        return ResponseEntity.ok(response);
    }

    public record HeartbeatResponse(String status, java.time.LocalDateTime timestamp) {
        public static HeartbeatResponseBuilder builder() {
            return new HeartbeatResponseBuilder();
        }

        public static class HeartbeatResponseBuilder {
            private String status;
            private java.time.LocalDateTime timestamp;

            public HeartbeatResponseBuilder status(String status) {
                this.status = status;
                return this;
            }

            public HeartbeatResponseBuilder timestamp(java.time.LocalDateTime timestamp) {
                this.timestamp = timestamp;
                return this;
            }

            public HeartbeatResponse build() {
                return new HeartbeatResponse(status, timestamp);
            }
        }
    }
}
