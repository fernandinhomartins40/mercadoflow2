package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AgentInvoicePresenceResponse {
    private List<String> present;
    private List<String> missing;
}
