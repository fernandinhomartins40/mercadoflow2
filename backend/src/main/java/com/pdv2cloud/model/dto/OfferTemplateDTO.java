package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateDTO {
    private UUID id;
    private String templateKey;
    private String name;
    private String description;
    private String channel;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private String designJson;
    private String previewImageUrl;
    private Boolean active;
    private Boolean systemTemplate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

