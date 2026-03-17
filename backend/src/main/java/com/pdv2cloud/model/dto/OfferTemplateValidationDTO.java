package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateValidationDTO {
    private boolean valid;
    private int layerCount;
    private int zoneCount;
    private int variantCount;
    private List<String> messages;
}
