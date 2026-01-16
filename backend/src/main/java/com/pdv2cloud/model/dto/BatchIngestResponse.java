package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class BatchIngestResponse {
    private int total;
    private int success;
    private int duplicates;
    private int errors;
    private List<IngestResponse> results;
}
