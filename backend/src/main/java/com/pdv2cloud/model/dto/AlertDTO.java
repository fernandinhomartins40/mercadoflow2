package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AlertDTO {
    private UUID id;
    private String type;
    private String title;
    private String message;
    private String priority;
    private UUID productId;
    private String productName;
    private String productEan;
    private String productImage;
    private Boolean isRead;
    private LocalDateTime createdAt;
    /** Key metrics that triggered this alert, e.g. velocity, trend, priceIndex, healthScore */
    private Map<String, Object> metadata;
}
