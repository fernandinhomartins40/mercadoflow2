package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AgentProfileResponse {
    private UUID marketId;
    private String marketName;
    private UUID agentKeyId;
}
