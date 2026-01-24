package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.BatchIngestResponse;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.security.AgentAuthenticationToken;
import com.pdv2cloud.security.AgentPrincipal;
import com.pdv2cloud.service.InvoiceProcessingService;
import com.pdv2cloud.util.HMACValidator;
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

    @Autowired
    private HMACValidator hmacValidator;

    @PostMapping("/invoice")
    public ResponseEntity<IngestResponse> ingestInvoice(
        @Valid @RequestBody InvoiceDTO invoiceDTO,
        @RequestHeader(value = "X-Market-ID", required = false) UUID marketId,
        @RequestHeader("X-Agent-Version") String agentVersion,
        @RequestHeader(value = "X-Signature", required = false) String signature,
        Authentication authentication) {

        AgentPrincipal agentPrincipal = resolveAgent(authentication);
        UUID resolvedMarketId = marketId != null ? marketId : (agentPrincipal != null ? agentPrincipal.getMarketId() : null);
        if (resolvedMarketId == null) {
            return ResponseEntity.badRequest().build();
        }
        if (marketId != null && agentPrincipal != null && !marketId.equals(agentPrincipal.getMarketId())) {
            return ResponseEntity.status(403).build();
        }

        if (signature != null && !signature.isBlank()) {
            if (agentPrincipal != null) {
                hmacValidator.validateSignature(invoiceDTO, signature, agentPrincipal.getApiKey(), resolvedMarketId);
            } else {
                hmacValidator.validateSignature(invoiceDTO, signature, resolvedMarketId);
            }
        }

        IngestResponse response = invoiceService.processInvoice(invoiceDTO, resolvedMarketId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/batch")
    public ResponseEntity<BatchIngestResponse> ingestBatch(
        @Valid @RequestBody List<InvoiceDTO> invoices,
        @RequestHeader(value = "X-Market-ID", required = false) UUID marketId,
        Authentication authentication) {

        AgentPrincipal agentPrincipal = resolveAgent(authentication);
        UUID resolvedMarketId = marketId != null ? marketId : (agentPrincipal != null ? agentPrincipal.getMarketId() : null);
        if (resolvedMarketId == null) {
            return ResponseEntity.badRequest().build();
        }
        if (marketId != null && agentPrincipal != null && !marketId.equals(agentPrincipal.getMarketId())) {
            return ResponseEntity.status(403).build();
        }

        BatchIngestResponse response = invoiceService.processBatch(invoices, resolvedMarketId);
        return ResponseEntity.ok(response);
    }

    private AgentPrincipal resolveAgent(Authentication authentication) {
        if (authentication instanceof AgentAuthenticationToken) {
            return (AgentPrincipal) authentication.getPrincipal();
        }
        return null;
    }
}
