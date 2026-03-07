package com.pdv2cloud.model.dto;

import java.util.LinkedHashMap;
import java.util.Map;
import lombok.Data;

@Data
public class SuperAdminCrawlerCheckpointBatchItemDTO {
    private String scopeType;
    private String scopeKey;
    private String scopeHash;
    private String status;
    private Integer itemCount;
    private Map<String, Object> metadata = new LinkedHashMap<>();
    private String errorMessage;
}
