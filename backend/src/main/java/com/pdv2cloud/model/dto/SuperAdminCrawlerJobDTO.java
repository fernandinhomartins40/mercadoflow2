package com.pdv2cloud.model.dto;

import lombok.Data;

@Data
public class SuperAdminCrawlerJobDTO {
    private String provider;
    private String name;
    private String scopeLabel;
    private String extractorType;
    private String scriptName;
    private String description;
    private String sourceLicense;
    private Boolean includesMedication;
    private Boolean downloadsImages;
    private Integer queuedRuns = 0;
    private Integer runningRuns = 0;
    private SuperAdminCrawlerRunDTO lastRun;
}
