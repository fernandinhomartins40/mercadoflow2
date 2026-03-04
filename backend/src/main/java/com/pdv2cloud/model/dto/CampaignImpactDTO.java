package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CampaignImpactDTO {
    private UUID campaignId;
    private String name;
    private String description;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private String status;
    private Integer durationDays;
    private BigDecimal beforeRevenue;
    private BigDecimal duringRevenue;
    private BigDecimal afterRevenue;
    private Long beforeTransactions;
    private Long duringTransactions;
    private Long afterTransactions;
    private BigDecimal beforeAverageTicket;
    private BigDecimal duringAverageTicket;
    private BigDecimal afterAverageTicket;
    private Double revenueLiftPercent;
    private Double transactionLiftPercent;
}
