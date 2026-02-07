package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CampaignCreateRequest {
    @NotBlank
    private String name;

    private String description;

    // Optional ISO-8601 strings. Backend stores as timestamp without timezone.
    private String startDate;
    private String endDate;
}

