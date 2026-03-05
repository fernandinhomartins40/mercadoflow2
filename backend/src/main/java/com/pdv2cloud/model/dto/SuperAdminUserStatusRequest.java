package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SuperAdminUserStatusRequest {
    @NotNull
    private Boolean active;
}
