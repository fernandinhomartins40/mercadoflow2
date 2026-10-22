package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class MeResponse {
    private UUID userId;
    private String email;
    private String name;
    private String role;
    private UUID marketId;
    /** Papel de equipe (Dono, Gerente, ...). */
    private String teamRole;
    private boolean twoFactorEnabled;
    /** Falta aceitar a versão vigente dos Termos, da Privacidade ou do DPA (S1): o front mostra a tela de aceite. */
    private boolean legalAcceptanceRequired;

    public MeResponse(UUID userId, String email, String name, String role, UUID marketId) {
        this(userId, email, name, role, marketId, null, false, false);
    }

    public MeResponse(UUID userId, String email, String name, String role, UUID marketId, String teamRole,
                      boolean twoFactorEnabled) {
        this(userId, email, name, role, marketId, teamRole, twoFactorEnabled, false);
    }
}
