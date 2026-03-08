package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuperAdminMarketDTO {
    private UUID id;
    private String name;
    private String cnpj;
    private PlanType planType;
    private MarketBillingStatus billingStatus;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime accessExpiresAt;
    private LocalDateTime trialEndsAt;
    private Integer userSeatLimit;
    private String contactName;
    private String contactEmail;
    private String contactPhone;
    private String notes;
    private long usersCount;
    private long activeUsersCount;
    private String accessStatus;
    private String accessReason;
}
