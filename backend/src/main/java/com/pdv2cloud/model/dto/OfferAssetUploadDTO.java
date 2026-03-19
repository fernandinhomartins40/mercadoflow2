package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferAssetUploadDTO {
    private String assetUrl;
    private String storageKey;
    private Integer width;
    private Integer height;
}
