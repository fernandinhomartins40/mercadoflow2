package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.model.dto.LoginRequest;
import com.pdv2cloud.model.dto.LoginResponse;
import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.model.dto.RegisterResponse;
import com.pdv2cloud.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import com.pdv2cloud.model.dto.MeResponse;
import com.pdv2cloud.service.UserProfileService;

@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.PasswordResetService passwordResetService;


    private static final String COOKIE_NAME = "pdv2cloud_token";

    @Autowired
    private AuthService authService;

    @Autowired
    private UserProfileService userProfileService;

    @Value("${auth.cookie.same-site:None}")
    private String sameSite;

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        // Escopo de sistema antes do serviço: o cadastro cria o mercado que
        // ainda não existe, e a conexão precisa estar marcada como is_admin
        // antes de o @Transactional obtê-la.
        RegisterResponse response = TenantContext.runAsSystem(() -> authService.register(request));
        TenantContext.runAsSystem(() -> authService.sendWelcome(response.getMarketId(), request.getName()));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        // Escopo de sistema, como no cadastro: o login grava last_login_at em
        // users, e sem tenant na sessao a policy users_modify recusa a linha de
        // qualquer usuario ligado a um mercado (UPDATE afeta 0 linhas -> 500).
        LoginResponse response = TenantContext.runAsSystem(() -> authService.login(request));
        if (response.isMfaRequired()) {
            // Sem cookie: a sessão só existe depois do código do aplicativo.
            return ResponseEntity.ok(response);
        }
        boolean keepConnected = request.getKeepConnected() != null && request.getKeepConnected();
        ResponseCookie cookie = buildCookie(response.getToken(), http.isSecure(), keepConnected);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(response);
    }

    /** Segunda etapa do login: código do aplicativo autenticador (ou de recuperação). */
    @PostMapping("/login/2fa")
    public ResponseEntity<?> loginSecondStep(@RequestBody java.util.Map<String, String> body, HttpServletRequest http) {
        try {
            var result = TenantContext.runAsSystem(() -> authService.loginSecondStep(body.get("challenge"), body.get("code")));
            ResponseCookie cookie = buildCookie(result.getKey().getToken(), http.isSecure(), result.getValue());
            return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(result.getKey());
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("error", "mfa_failed", "userMessage", e.getMessage()));
        }
    }

    /** "Esqueci minha senha": resposta sempre igual, exista ou não a conta. */
    @PostMapping("/forgot-password")
    public ResponseEntity<java.util.Map<String, String>> forgotPassword(@RequestBody java.util.Map<String, String> body, HttpServletRequest http) {
        passwordResetService.request(body.get("email"), http.getRemoteAddr());
        return ResponseEntity.accepted().body(java.util.Map.of("message",
            "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 30 minutos."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<java.util.Map<String, Object>> resetPassword(@RequestBody java.util.Map<String, String> body) {
        com.pdv2cloud.service.PasswordResetService.Result r = passwordResetService.reset(body.get("token"), body.get("password"));
        return ResponseEntity.status(r.ok() ? HttpStatus.OK : HttpStatus.BAD_REQUEST)
            .body(java.util.Map.of("ok", r.ok(), "message", r.message()));
    }

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal UserDetails userDetails) {
        MeResponse response = userProfileService.getProfile(userDetails.getUsername());
        if ("SUPER_ADMIN".equalsIgnoreCase(response.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest http) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
            .httpOnly(true)
            .secure(http.isSecure())
            .path("/")
            .maxAge(Duration.ZERO)
            .sameSite(resolveSameSite(http.isSecure()))
            .build();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
    }

    private ResponseCookie buildCookie(String token, boolean secure, boolean keepConnected) {
        Duration maxAge = keepConnected ? Duration.ofDays(30) : Duration.ofDays(1);
        return ResponseCookie.from(COOKIE_NAME, token)
            .httpOnly(true)
            .secure(secure)
            .path("/")
            .maxAge(maxAge)
            .sameSite(resolveSameSite(secure))
            .build();
    }

    private String resolveSameSite(boolean secure) {
        if (!secure) {
            return "Lax";
        }
        return sameSite;
    }
}
