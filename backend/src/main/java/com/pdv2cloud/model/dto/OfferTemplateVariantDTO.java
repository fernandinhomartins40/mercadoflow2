package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateVariantDTO {
    private UUID id;
    private UUID templateId;
    private String variantKey;
    private String name;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private String variantJson;
    private String previewImageUrl;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
