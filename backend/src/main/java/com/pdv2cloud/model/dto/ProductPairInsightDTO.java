package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPairInsightDTO {
    private UUID antecedentId;
    private UUID consequentId;
    private String antecedentName;
    private String consequentName;
    private double support;
    private double confidence;
    private double lift;
    private long pairCount;
}
