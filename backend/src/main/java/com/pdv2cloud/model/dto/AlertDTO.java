package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AlertDTO {
    private UUID id;
    private String type;
    private String title;
    private String message;
    private String priority;
    private UUID productId;
    private Boolean isRead;
    private LocalDateTime createdAt;
}
