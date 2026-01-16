package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.BatchIngestResponse;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.service.InvoiceProcessingService;
import com.pdv2cloud.util.HMACValidator;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
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
        @RequestHeader("X-Market-ID") UUID marketId,
        @RequestHeader("X-Agent-Version") String agentVersion,
        @RequestHeader(value = "X-Signature", required = false) String signature) {

        if (signature != null && !signature.isBlank()) {
            hmacValidator.validateSignature(invoiceDTO, signature, marketId);
        }

        IngestResponse response = invoiceService.processInvoice(invoiceDTO, marketId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/batch")
    public ResponseEntity<BatchIngestResponse> ingestBatch(
        @Valid @RequestBody List<InvoiceDTO> invoices,
        @RequestHeader("X-Market-ID") UUID marketId) {

        BatchIngestResponse response = invoiceService.processBatch(invoices, marketId);
        return ResponseEntity.ok(response);
    }
}
