package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RegisterResponse {
    private UUID userId;
    private UUID marketId;
    private String status;
    private String message;
}
