package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {
    @Email
    @NotBlank
    private String email;

    @NotBlank
    private String password;

    // When true, the API issues a longer-lived auth cookie.
    private Boolean keepConnected;
}
