package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateVariantUpsertRequest {
    private String variantKey;
    private String name;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private String variantJson;
    private String previewImageUrl;
    private Boolean active;
}
