package com.pdv2cloud.model.dto;

import lombok.Data;

@Data
public class SuperAdminCatalogImageRepairRequestDTO {
    private String provider;
    private Integer maxItems = 1000;
    private Integer batchSize = 200;
    private String triggeredBy;
}
