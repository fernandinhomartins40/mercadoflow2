package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Data;

@Data
public class SuperAdminCrawlerCheckpointBatchRequestDTO {
    private String provider;
    private UUID runId;
    private List<SuperAdminCrawlerCheckpointBatchItemDTO> items = new ArrayList<>();
}
