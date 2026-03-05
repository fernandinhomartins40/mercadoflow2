package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerRunStartRequestDTO {
    private String triggeredBy;
    private String message;
    private List<String> sources = new ArrayList<>();
}

