package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.LoginRequest;
import com.pdv2cloud.model.dto.LoginResponse;
import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import com.pdv2cloud.model.dto.MeResponse;
import com.pdv2cloud.service.UserProfileService;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final String COOKIE_NAME = "pdv2cloud_token";

    @Autowired
    private AuthService authService;

    @Autowired
    private UserProfileService userProfileService;

    @Value("${auth.cookie.same-site:None}")
    private String sameSite;

    @PostMapping("/register")
    public ResponseEntity<LoginResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        LoginResponse response = authService.register(request);
        // Register uses the default session duration.
        ResponseCookie cookie = buildCookie(response.getToken(), http.isSecure(), false);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        LoginResponse response = authService.login(request);
        boolean keepConnected = request.getKeepConnected() != null && request.getKeepConnected();
        ResponseCookie cookie = buildCookie(response.getToken(), http.isSecure(), keepConnected);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(response);
    }

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal UserDetails userDetails) {
        MeResponse response = userProfileService.getProfile(userDetails.getUsername());
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
