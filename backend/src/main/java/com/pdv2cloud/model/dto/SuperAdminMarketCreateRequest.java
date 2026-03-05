package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SuperAdminMarketCreateRequest {
    @NotBlank
    private String name;

    private String cnpj;

    @NotNull
    private PlanType planType;

    private Boolean active = true;
}
