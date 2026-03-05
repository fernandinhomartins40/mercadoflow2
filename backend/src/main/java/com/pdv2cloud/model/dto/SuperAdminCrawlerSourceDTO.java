package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;
import lombok.Data;

@Data
public class SuperAdminCrawlerSourceDTO {
    private UUID id;

    @NotBlank
    private String name;

    @NotBlank
    private String provider;

    private String sourceLicense;

    @NotEmpty
    private List<String> seeds;

    @NotEmpty
    private List<String> allowedDomains;

    private List<String> productPathHints;

    private Integer maxPages = 250;
    private Integer maxRecords = 2500;
    private Integer rateLimitMs = 1000;
    private Integer requestTimeoutSec = 20;
    private Boolean enabled = true;
}
