package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuperAdminCrawlerCategoryOptionDTO {
    private String value;
    private String label;
    private Integer childrenCount;
}
