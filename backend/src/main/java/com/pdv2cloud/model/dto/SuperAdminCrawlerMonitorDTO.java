package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerMonitorDTO {
    private long queuedRuns;
    private long runningRuns;
    private SuperAdminCrawlerRunDTO latestRun;
    private List<SuperAdminCrawlerRunDTO> recentRuns = new ArrayList<>();
}

