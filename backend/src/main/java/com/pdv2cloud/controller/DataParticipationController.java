package com.pdv2cloud.controller;

import com.pdv2cloud.security.AppUserDetails;
import com.pdv2cloud.service.industry.DataParticipationService;
import com.pdv2cloud.service.team.TeamRole;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** "Seus dados e a indústria": a loja vê e, no plano pago, decide se participa. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/data-participation")
public class DataParticipationController {

    private final DataParticipationService participation;

    public DataParticipationController(DataParticipationService participation) {
        this.participation = participation;
    }

    @GetMapping
    public Map<String, Object> get(@PathVariable UUID marketId) {
        return participation.get(marketId);
    }

    @PutMapping
    public Map<String, Object> set(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                   @AuthenticationPrincipal AppUserDetails user) {
        if (user != null && user.getTeamRole() != null && user.getTeamRole() != TeamRole.DONO) {
            throw new IllegalArgumentException("Só o dono da conta decide sobre a participação nos dados.");
        }
        return participation.set(marketId, !Boolean.FALSE.equals(body.get("participate")), (String) body.get("reason"),
            user == null ? null : user.getUsername());
    }
}
