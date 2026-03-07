package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuperAdminCrawlerCatalogImageStatusDTO {
    private String code;
    private boolean productExists;
    private boolean imageAvailable;
    private boolean needsImageRefresh;
    private String reason;
    private String resolvedImageUrl;
    private String imageStorageKey;
}
