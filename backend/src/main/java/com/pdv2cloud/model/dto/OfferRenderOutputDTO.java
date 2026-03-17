package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferRenderOutputDTO {
    private UUID id;
    private UUID jobId;
    private UUID templateId;
    private String variantKey;
    private String outputType;
    private String publishTarget;
    private String status;
    private String fileUrl;
    private String previewImageUrl;
    private String errorMessage;
    private String renderOptionsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
