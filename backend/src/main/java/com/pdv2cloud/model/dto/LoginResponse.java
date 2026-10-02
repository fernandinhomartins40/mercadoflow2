package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private UUID userId;
    private String role;
    private UUID marketId;
    /** Segunda etapa pendente: o token só sai depois do código. */
    private boolean mfaRequired;
    private String mfaChallenge;

    public LoginResponse(String token, UUID userId, String role, UUID marketId) {
        this(token, userId, role, marketId, false, null);
    }
}
