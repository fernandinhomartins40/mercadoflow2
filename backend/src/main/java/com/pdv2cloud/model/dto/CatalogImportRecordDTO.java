package com.pdv2cloud.model.dto;

import lombok.Data;

@Data
public class CatalogImportRecordDTO {
    private String code;
    private String name;
    private String brand;
    private String category;
    private String ncm;
    private String unit;
    private String description;
    private String manufacturer;
    private String packageDescription;
    private String imageUrl;
    private String imageStorageKey;
    private String attributesJson;
    private String rawPayload;
}
