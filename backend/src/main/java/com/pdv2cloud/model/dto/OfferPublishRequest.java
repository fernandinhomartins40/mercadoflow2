package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferPublishRequest {
    private List<String> variantKeys;
    private List<String> outputTypes;
    private List<String> publishTargets;
    private String renderOptionsJson;
}
