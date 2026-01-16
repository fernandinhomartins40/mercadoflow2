package com.pdv2cloud.model.dto;

import java.util.List;
import java.util.UUID;
import lombok.Data;

@Data
public class MarketBasketDTO {
    private List<UUID> antecedent;
    private List<UUID> consequent;
    private List<String> antecedentNames;
    private List<String> consequentNames;
    private double support;
    private double confidence;
    private double lift;
}
