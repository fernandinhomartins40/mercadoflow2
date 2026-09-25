package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.dto.BatchIngestResponse;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.security.AgentAuthenticationToken;
import com.pdv2cloud.security.AgentPrincipal;
import com.pdv2cloud.service.InvoiceProcessingService;
import com.pdv2cloud.service.AuditService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/ingest")
@Validated
public class IngestController {

    @Autowired
    private InvoiceProcessingService invoiceService;

    @Autowired
    private AuditService auditService;

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

        Map<String, Object> auditDetails = Map.of(
            "chaveNFe", invoiceDTO.getChaveNFe(),
            "agentVersion", agentVersion,
            "status", response.getStatus(),
            "message", response.getMessage()
        );

        // Cota estourada não é falha de processamento: devolve 402 para o agente
        // parar de tentar até haver upgrade ou virada de ciclo, em vez de tratar
        // como erro transitório e ficar em retry.
        if ("QUOTA_EXCEEDED".equals(response.getStatus())) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(response);
        }

        if ("ERROR".equals(response.getStatus())) {
            auditService.logFailure(
                "INVOICE",
                response.getInvoiceId(),
                "INGEST",
                response.getMessage(),
                auditDetails
            );
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(response);
        }

        auditService.logAction(
            "INVOICE",
            response.getInvoiceId(),
            "INGEST",
            true,
            auditDetails
        );

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
