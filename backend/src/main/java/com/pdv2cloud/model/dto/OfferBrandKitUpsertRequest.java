package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferBrandKitUpsertRequest {
    private String kitKey;
    private String name;
    private String description;
    private String tokensJson;
    private String assetsJson;
    private Boolean active;
}
