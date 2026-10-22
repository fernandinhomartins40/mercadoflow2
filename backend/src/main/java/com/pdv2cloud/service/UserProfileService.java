package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MeResponse;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.legal.LegalAcceptanceService;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {

    @Autowired
    private UserRepository userRepository;

    @Autowired(required = false)
    private LegalAcceptanceService legalAcceptance;

    public MeResponse getProfile(String email) {
        User user = userRepository.findForAuthenticationByEmail(email).orElseThrow();
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        com.pdv2cloud.service.team.TeamRole team = com.pdv2cloud.service.team.TeamRole.of(user.getTeamRole(), user.getRole());
        // S1: quem não aceitou a versão vigente vê a tela de aceite antes do painel e do Bipaê.
        // Leitura por user_id em escopo de sistema: na troca de filial da rede a
        // sessão pode estar em outro mercado e o RLS esconderia o aceite da matriz.
        boolean legalRequired = legalAcceptance != null
            && com.pdv2cloud.tenancy.TenantContext.runAsSystem(() -> legalAcceptance.required(user.getId(), user.getRole()));
        return new MeResponse(user.getId(), user.getEmail(), user.getName(), user.getRole().name(), marketId,
            team == null ? null : team.name(), Boolean.TRUE.equals(user.getTotpEnabled()), legalRequired);
    }

    /** Registra o aceite da versão vigente. Quem chama roda em runAsSystem. */
    public int acceptLegal(String email, String ip, String userAgent) {
        User user = userRepository.findForAuthenticationByEmail(email).orElseThrow();
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        return legalAcceptance == null ? 0 : legalAcceptance.record(user.getId(), marketId, user.getRole(), ip, userAgent);
    }
}
