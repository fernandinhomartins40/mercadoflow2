package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerCatalogImageStatusRequestDTO {
    private String provider;
    private List<String> codes = new ArrayList<>();
}
