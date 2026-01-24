package com.pdv2cloud.security;

import java.util.UUID;
import lombok.Value;

@Value
public class AgentPrincipal {
    UUID agentKeyId;
    UUID marketId;
    String apiKey;
    String name;
}
