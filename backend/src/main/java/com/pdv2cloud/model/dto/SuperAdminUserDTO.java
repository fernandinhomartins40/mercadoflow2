package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.UserRole;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuperAdminUserDTO {
    private UUID id;
    private String name;
    private String email;
    private UserRole role;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastLoginAt;
    private UUID marketId;
    private String marketName;
    private PlanType marketPlan;
    private MarketBillingStatus marketBillingStatus;
    private Boolean marketActive;
    private LocalDateTime marketAccessExpiresAt;
    private String accessStatus;
    private String accessReason;
}
