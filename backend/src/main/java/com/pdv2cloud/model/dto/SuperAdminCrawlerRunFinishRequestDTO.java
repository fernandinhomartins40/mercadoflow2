package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerRunFinishRequestDTO {
    private String status;
    private Integer scannedProducts;
    private Integer importedProducts;
    private Integer skippedInvalidGtin;
    private Integer skippedMissingName;
    private Integer skippedMedication;
    private Integer skippedDuplicateGtin;
    private Integer errors;
    private String message;
    private List<String> sources = new ArrayList<>();
}

