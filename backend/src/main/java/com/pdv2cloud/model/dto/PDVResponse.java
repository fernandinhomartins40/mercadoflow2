package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PDVResponse {
    private UUID id;
    private String name;
    private String serialNumber;
    private LocalDateTime createdAt;
}

