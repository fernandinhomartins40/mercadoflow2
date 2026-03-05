package com.pdv2cloud.model.dto;

import lombok.Data;

@Data
public class CatalogImportRecordDTO {
    private String code;
    private String name;
    private String brand;
    private String category;
    private String packageDescription;
    private String rawPayload;
}
