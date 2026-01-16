package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class MeResponse {
    private UUID userId;
    private String email;
    private String name;
    private String role;
    private UUID marketId;
}
