package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import lombok.Data;

@Data
public class AgentApiKeyCreateRequest {
    @NotNull
    private UUID marketId;

    @NotBlank
    private String name;
}
