package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.BatchIngestResponse;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.security.AgentAuthenticationToken;
import com.pdv2cloud.security.AgentPrincipal;
import com.pdv2cloud.service.InvoiceProcessingService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/ingest")
@Validated
public class IngestController {

    @Autowired
    private InvoiceProcessingService invoiceService;

    @PostMapping("/invoice")
    public ResponseEntity<IngestResponse> ingestInvoice(
        @Valid @RequestBody InvoiceDTO invoiceDTO,
        @RequestHeader("X-Agent-Version") String agentVersion,
        @RequestHeader(value = "X-Market-ID", required = false) UUID marketId,
        Authentication authentication) {

        AgentPrincipal agentPrincipal = requireAgent(authentication);
        UUID resolvedMarketId = agentPrincipal.getMarketId();
        if (marketId != null && !marketId.equals(resolvedMarketId)) {
            return ResponseEntity.status(403).build();
        }

        IngestResponse response = invoiceService.processInvoice(invoiceDTO, resolvedMarketId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/batch")
    public ResponseEntity<BatchIngestResponse> ingestBatch(
        @Valid @RequestBody List<InvoiceDTO> invoices,
        @RequestHeader("X-Agent-Version") String agentVersion,
        @RequestHeader(value = "X-Market-ID", required = false) UUID marketId,
        Authentication authentication) {

        AgentPrincipal agentPrincipal = requireAgent(authentication);
        UUID resolvedMarketId = agentPrincipal.getMarketId();
        if (marketId != null && !marketId.equals(resolvedMarketId)) {
            return ResponseEntity.status(403).build();
        }

        BatchIngestResponse response = invoiceService.processBatch(invoices, resolvedMarketId);
        return ResponseEntity.ok(response);
    }

    private AgentPrincipal requireAgent(Authentication authentication) {
        if (!(authentication instanceof AgentAuthenticationToken)) {
            throw new org.springframework.security.access.AccessDeniedException("Agent authentication required");
        }
        return (AgentPrincipal) authentication.getPrincipal();
    }
}
