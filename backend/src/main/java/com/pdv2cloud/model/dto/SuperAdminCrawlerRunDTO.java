package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Data;

@Data
public class SuperAdminCrawlerRunDTO {
    private UUID id;
    private String status;
    private LocalDateTime requestedAt;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private Integer scannedProducts;
    private Integer importedProducts;
    private Integer skippedInvalidGtin;
    private Integer skippedMissingName;
    private Integer skippedMedication;
    private Integer skippedDuplicateGtin;
    private Integer errors;
    private String message;
    private String triggeredBy;
    private List<String> sources = new ArrayList<>();
    private List<String> selectedCategories = new ArrayList<>();
}
