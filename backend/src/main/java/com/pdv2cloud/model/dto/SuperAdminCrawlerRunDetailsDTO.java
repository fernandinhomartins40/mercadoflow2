package com.pdv2cloud.model.dto;

import java.util.ArrayList;
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
    private Integer recordsOffset = 0;
    private Integer recordsLimit = 50;
    private Integer recordsTotal = 0;
    private List<Map<String, Object>> summary = new ArrayList<>();
    private List<Map<String, Object>> manifests = new ArrayList<>();
    private List<Map<String, Object>> records = new ArrayList<>();
}
