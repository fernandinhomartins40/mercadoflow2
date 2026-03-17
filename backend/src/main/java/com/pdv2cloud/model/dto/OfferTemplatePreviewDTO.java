package com.pdv2cloud.model.dto;

import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplatePreviewDTO {
    private UUID templateId;
    private String templateName;
    private String variantKey;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private String resolvedDesignJson;
    private List<UUID> productIds;
    private List<String> warnings;
}
