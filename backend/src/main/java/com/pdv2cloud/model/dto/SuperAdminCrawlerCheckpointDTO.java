package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Data;

@Data
public class SuperAdminCrawlerCheckpointDTO {
    private UUID id;
    private String provider;
    private String scopeType;
    private String scopeKey;
    private String scopeHash;
    private String status;
    private UUID runId;
    private Integer itemCount = 0;
    private Map<String, Object> metadata = new LinkedHashMap<>();
    private String errorMessage;
    private LocalDateTime completedAt;
    private LocalDateTime lastSeenAt;
    private LocalDateTime updatedAt;
}
