package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import jakarta.validation.constraints.Email;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class SuperAdminMarketUpdateRequest {
    private String name;
    private String cnpj;
    private PlanType planType;
    private MarketBillingStatus billingStatus;
    private Boolean active;
    private Integer userSeatLimit;
    private LocalDateTime accessExpiresAt;
    private LocalDateTime trialEndsAt;
    private String contactName;
    @Email
    private String contactEmail;
    private String contactPhone;
    private String notes;
}
