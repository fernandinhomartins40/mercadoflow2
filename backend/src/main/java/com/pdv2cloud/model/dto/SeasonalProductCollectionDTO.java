package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SeasonalProductCollectionDTO {
    private String key;
    private String title;
    private String subtitle;
    private String periodLabel;
    private List<ProductPerformanceDTO> products;
}
