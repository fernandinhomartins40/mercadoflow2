package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateUpsertRequest {
    private String name;
    private String description;
    private String channel;
    private Integer canvasWidth;
    private Integer canvasHeight;
    private String designJson;
    private Boolean active;
}

