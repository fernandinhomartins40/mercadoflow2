package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RecentInvoiceSummaryDTO {
    private UUID id;
    private String chaveNFe;
    private String numero;
    private String serie;
    private BigDecimal valorTotal;
    private LocalDateTime dataEmissao;
    private LocalDateTime processedAt;
}
