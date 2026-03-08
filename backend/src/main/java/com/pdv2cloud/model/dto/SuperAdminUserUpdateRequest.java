package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.UserRole;
import jakarta.validation.constraints.Email;
import java.util.UUID;
import lombok.Data;

@Data
public class SuperAdminUserUpdateRequest {
    private String name;

    @Email
    private String email;

    private String password;

    private UserRole role;

    private UUID marketId;

    private Boolean isActive;
}
