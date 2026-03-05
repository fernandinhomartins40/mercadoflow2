package com.pdv2cloud.model.dto;

import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerConfigDTO {
    private String userAgent;
    private Integer intervalMinutes = 360;
    private Boolean enabled = true;

    @Valid
    private List<SuperAdminCrawlerSourceDTO> sources = new ArrayList<>();
}
