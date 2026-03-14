package com.pdv2cloud.model.dto;

import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferGenerationJobCreateRequest {
    private UUID templateId;
    private String name;
    private String outputType;
    private String generationMode;
    private List<UUID> productIds;
}

