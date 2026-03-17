package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateUpsertRequest {
    private String name;
    private String description;
    private String channel;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private Integer schemaVersion;
    private String masterTemplateKey;
    private String defaultVariantKey;
    private UUID brandKitId;
    private UUID campaignKitId;
    private String designJson;
    private Boolean active;
}

