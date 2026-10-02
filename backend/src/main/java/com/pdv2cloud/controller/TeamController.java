package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.team.TeamService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Equipe da rede, para o dono: convidar, mudar papel e loja, desativar e
 * transferir a titularidade. O filtro de papéis já barra quem não é dono.
 * As operações rodam em escopo de sistema porque a equipe cruza as lojas da
 * rede; o escopo é conferido aqui (rede do mercado do dono).
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/team")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
public class TeamController {

    private final TeamService team;
    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;

    public TeamController(TeamService team, MarketAccessService access, NamedParameterJdbcTemplate jdbc) {
        this.team = team;
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> overview(@PathVariable UUID marketId, Authentication auth) {
        return run(marketId, auth, (root, me) -> team.overview(root, me));
    }

    @PostMapping("/invites")
    public ResponseEntity<?> invite(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            var c = team.invite(root, auth.getName(), str(body.get("email")), str(body.get("name")), str(body.get("role")), uuid(body.get("storeId")));
            return Map.of("id", c.id(), "link", c.link());
        });
    }

    @PostMapping("/invites/{inviteId}/resend")
    public ResponseEntity<?> resend(@PathVariable UUID marketId, @PathVariable UUID inviteId, Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            var c = team.resend(root, inviteId);
            return Map.of("id", c.id(), "link", c.link());
        });
    }

    @DeleteMapping("/invites/{inviteId}")
    public ResponseEntity<?> revoke(@PathVariable UUID marketId, @PathVariable UUID inviteId, Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            team.revoke(root, inviteId);
            return Map.of("ok", true);
        });
    }

    @PutMapping("/members/{userId}")
    public ResponseEntity<?> change(@PathVariable UUID marketId, @PathVariable UUID userId, @RequestBody Map<String, Object> body,
                                    Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            team.change(root, me, userId, str(body.get("role")), uuid(body.get("storeId")));
            return Map.of("ok", true);
        });
    }

    @PostMapping("/members/{userId}/active")
    public ResponseEntity<?> active(@PathVariable UUID marketId, @PathVariable UUID userId, @RequestBody Map<String, Object> body,
                                    Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            team.setActive(root, me, userId, Boolean.TRUE.equals(body.get("active")));
            return Map.of("ok", true);
        });
    }

    @PostMapping("/transfer")
    public ResponseEntity<?> transfer(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        return run(marketId, auth, (root, me) -> Map.of("id", team.startTransfer(root, me, uuid(body.get("toUserId")), str(body.get("password")))));
    }

    @DeleteMapping("/transfer")
    public ResponseEntity<?> cancelTransfer(@PathVariable UUID marketId, Authentication auth) {
        return run(marketId, auth, (root, me) -> {
            team.cancelTransfer(root);
            return Map.of("ok", true);
        });
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private interface Action {
        Object apply(UUID root, UUID me);
    }

    private ResponseEntity<?> run(UUID marketId, Authentication auth, Action action) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            Supplier<Object> work = () -> {
                UUID root = team.rootOf(marketId);
                UUID me = jdbc.queryForObject("select id from users where email = :e", Map.of("e", auth.getName()), UUID.class);
                return action.apply(root, me);
            };
            return ResponseEntity.ok(TenantContext.runAsSystem(work));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "team", "userMessage", e.getMessage()));
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static UUID uuid(Object v) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(String.valueOf(v));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Identificador inválido");
        }
    }
}
