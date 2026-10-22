package com.pdv2cloud.controller;

import com.pdv2cloud.service.account.AccountDeletionService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Excluir minha conta" (LGPD-03), no painel e no Bipaê.
 *
 *  GET    /api/v1/me/account-deletion           estado do pedido
 *  POST   /api/v1/me/account-deletion           pede (exige a senha atual)
 *  DELETE /api/v1/me/account-deletion           desiste (sessão ainda aberta)
 *  POST   /api/v1/auth/account-deletion/cancel  desiste pela tela de login (e-mail e senha):
 *                                               o pedido derruba as sessões, então este é o caminho normal.
 */
@Profile("!jobs")
@RestController
public class AccountDeletionController {

    private final AccountDeletionService deletion;
    private final NamedParameterJdbcTemplate jdbc;

    public AccountDeletionController(AccountDeletionService deletion, NamedParameterJdbcTemplate jdbc) {
        this.deletion = deletion;
        this.jdbc = jdbc;
    }

    @GetMapping("/api/v1/me/account-deletion")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<?> status(Authentication auth) {
        return guard(() -> TenantContext.runAsSystem(() -> deletion.status(me(auth))));
    }

    @PostMapping("/api/v1/me/account-deletion")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<?> request(@RequestBody(required = false) Map<String, String> body, Authentication auth) {
        String password = body == null ? null : body.get("password");
        return guard(() -> TenantContext.runAsSystem(() -> deletion.request(me(auth), password)));
    }

    @DeleteMapping("/api/v1/me/account-deletion")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<?> cancel(Authentication auth) {
        return guard(() -> TenantContext.runAsSystem(() -> deletion.cancel(me(auth))));
    }

    @PostMapping("/api/v1/auth/account-deletion/cancel")
    public ResponseEntity<?> cancelFromLogin(@RequestBody(required = false) Map<String, String> body) {
        String email = body == null ? null : body.get("email");
        String password = body == null ? null : body.get("password");
        return guard(() -> TenantContext.runAsSystem(() -> deletion.cancelWithPassword(email, password)));
    }

    private UUID me(Authentication auth) {
        return jdbc.queryForObject("select id from users where email = :e", Map.of("e", auth.getName()), UUID.class);
    }

    private ResponseEntity<?> guard(java.util.function.Supplier<Object> work) {
        try {
            return ResponseEntity.ok(work.get());
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "account_deletion", "userMessage", e.getMessage()));
        }
    }
}
