package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class SuperAdminMarketCreateRequest {
    @NotBlank
    private String name;

    private String cnpj;

    @NotNull
    private PlanType planType;

    private MarketBillingStatus billingStatus = MarketBillingStatus.ACTIVE;

    private Boolean active = true;

    private Integer userSeatLimit;

    private LocalDateTime accessExpiresAt;

    private LocalDateTime trialEndsAt;

    private String contactName;

    @Email
    private String contactEmail;

    private String contactPhone;

    private String notes;
}
