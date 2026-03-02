package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AgentSyncStatusResponse {
    private UUID marketId;
    private String marketName;
    private long totalInvoices;
    private long invoicesLast24h;
    private LocalDateTime lastInvoiceProcessedAt;
    private List<RecentInvoiceSummaryDTO> recentInvoices;
}
