package com.pdv2cloud.controller;

import com.pdv2cloud.service.team.TeamService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Aceite do convite para a equipe: o link é a credencial (válido 7 dias, uso único). */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/invites")
public class PublicInviteController {

    private final TeamService team;

    public PublicInviteController(TeamService team) {
        this.team = team;
    }

    @GetMapping("/{token}")
    public ResponseEntity<?> info(@PathVariable String token) {
        try {
            return ResponseEntity.ok(TenantContext.runAsSystem(() -> team.inviteInfo(token)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invite", "userMessage", e.getMessage()));
        }
    }

    @PostMapping("/{token}/accept")
    public ResponseEntity<?> accept(@PathVariable String token, @RequestBody Map<String, String> body) {
        try {
            String email = TenantContext.runAsSystem(() -> team.accept(token, body.get("name"), body.get("password")));
            return ResponseEntity.ok(Map.of("ok", true, "email", email));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invite", "userMessage", e.getMessage()));
        }
    }
}
