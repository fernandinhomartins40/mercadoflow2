package com.pdv2cloud.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class SuperAdminCrawlerRunTriggerRequestDTO {
    private String triggeredBy;
    private List<String> selectedCategories = new ArrayList<>();
}
