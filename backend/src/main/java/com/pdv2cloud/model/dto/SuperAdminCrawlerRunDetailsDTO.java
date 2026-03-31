package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;

@Data
public class SuperAdminCrawlerRunDetailsDTO {
    private SuperAdminCrawlerRunDTO run;
    private boolean active;
    private String logText;
    private String logPath;
    private String resultPath;
    private String progressPath;
    private String heartbeatAt;
    private String logUpdatedAt;
    private Long logSizeBytes = 0L;
    private Double durationSeconds = 0.0;
    private Double capturedPerMinute = 0.0;
    private Double importedPerMinute = 0.0;
    private boolean canResumeFromCheckpoint;
    private String continueHint;
    private Integer recordsOffset = 0;
    private Integer recordsLimit = 50;
    private Integer recordsTotal = 0;
    private Map<String, Object> liveProgress = new LinkedHashMap<>();
    private Map<String, Integer> checkpointStatusCounts = new LinkedHashMap<>();
    private List<Map<String, Object>> summary = new ArrayList<>();
    private List<Map<String, Object>> manifests = new ArrayList<>();
    private List<Map<String, Object>> records = new ArrayList<>();
    private List<String> errorHighlights = new ArrayList<>();
    private List<SuperAdminCrawlerCheckpointDTO> recentCheckpoints = new ArrayList<>();
    private List<SuperAdminCrawlerCheckpointDTO> recentFailedCheckpoints = new ArrayList<>();
}
