package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferGenerationJobDTO {
    private UUID id;
    private UUID templateId;
    private String templateName;
    private String name;
    private String status;
    private String outputType;
    private String generationMode;
    private String variantKey;
    private Integer productCount;
    private Integer pageCount;
    private String templateSnapshotJson;
    private String publishTargetsJson;
    private String renderOptionsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<OfferGenerationJobItemDTO> items;
    private List<OfferRenderOutputDTO> outputs;
}

