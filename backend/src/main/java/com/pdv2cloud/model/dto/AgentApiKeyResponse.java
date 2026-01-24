package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AgentApiKeyResponse {
    private UUID id;
    private UUID marketId;
    private String name;
    private String keyPrefix;
    private LocalDateTime createdAt;
    private String apiKey;
}
