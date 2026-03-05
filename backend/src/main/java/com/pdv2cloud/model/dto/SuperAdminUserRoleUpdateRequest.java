package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.UserRole;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SuperAdminUserRoleUpdateRequest {
    @NotNull
    private UserRole role;
}
