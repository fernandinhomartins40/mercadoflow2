package com.pdv2cloud.model.dto;

import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplatePreviewRequest {
    private UUID templateId;
    private String variantKey;
    private UUID brandKitId;
    private UUID campaignKitId;
    private String renderOptionsJson;
    private List<UUID> productIds;
}
