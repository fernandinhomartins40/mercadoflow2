package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferBackgroundRemovalDTO {
    private String sourceUrl;
    private String cleanedImageUrl;
    private boolean removed;
}
