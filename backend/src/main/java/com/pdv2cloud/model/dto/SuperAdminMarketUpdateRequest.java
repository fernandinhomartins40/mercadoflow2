package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import lombok.Data;

@Data
public class SuperAdminMarketUpdateRequest {
    private String name;
    private PlanType planType;
    private Boolean active;
}
