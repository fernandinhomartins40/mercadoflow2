package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.service.team.TeamRole;
import com.pdv2cloud.service.team.TeamService;
import com.pdv2cloud.service.team.TwoFactorService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A conta da própria pessoa: verificação em duas etapas e pedido de titularidade recebido. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/me")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
public class MyAccountController {

    private final TwoFactorService twoFactor;
    private final TeamService team;
    private final NamedParameterJdbcTemplate jdbc;

    public MyAccountController(TwoFactorService twoFactor, TeamService team, NamedParameterJdbcTemplate jdbc) {
        this.twoFactor = twoFactor;
        this.team = team;
        this.jdbc = jdbc;
    }

    private record Me(UUID id, String email, TeamRole role) {}

    private Me me(Authentication auth) {
        Map<String, Object> u = jdbc.queryForMap("select id, email, role, team_role from users where email = :e", Map.of("e", auth.getName()));
        return new Me((UUID) u.get("id"), (String) u.get("email"),
            TeamRole.of((String) u.get("team_role"), UserRole.valueOf((String) u.get("role"))));
    }

    @GetMapping("/2fa")
    public Map<String, Object> status(Authentication auth) {
        Me me = me(auth);
        return Map.of("enabled", twoFactor.enabled(me.id()), "available", me.role() != null && me.role().canUseTwoFactor());
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup(Authentication auth) {
        return guard(() -> {
            Me me = me(auth);
            return twoFactor.setup(me.id(), me.email(), me.role());
        });
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<?> enable(@RequestBody Map<String, String> body, Authentication auth) {
        return guard(() -> Map.of("recoveryCodes", twoFactor.enable(me(auth).id(), body.get("code"))));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable(@RequestBody Map<String, String> body, Authentication auth) {
        return guard(() -> {
            twoFactor.disable(me(auth).id(), body.get("password"), body.get("code"));
            return Map.of("ok", true);
        });
    }

    @GetMapping("/ownership-transfers")
    public List<Map<String, Object>> transfers(Authentication auth) {
        UUID id = me(auth).id();
        return TenantContext.runAsSystem(() -> team.pendingFor(id));
    }

    @PostMapping("/ownership-transfers/{id}/{decision}")
    public ResponseEntity<?> decide(@PathVariable UUID id, @PathVariable String decision, Authentication auth) {
        UUID me = me(auth).id();
        return guard(() -> TenantContext.runAsSystem(() -> {
            team.decideTransfer(id, me, "accept".equals(decision));
            return Map.of("ok", true);
        }));
    }

    private ResponseEntity<?> guard(java.util.function.Supplier<Object> work) {
        try {
            return ResponseEntity.ok(work.get());
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "account", "userMessage", e.getMessage()));
        }
    }
}
