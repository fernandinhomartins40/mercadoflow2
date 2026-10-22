package com.pdv2cloud.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.LoginRequest;
import com.pdv2cloud.model.dto.LoginResponse;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.security.JwtTokenProvider;
import com.pdv2cloud.service.team.TwoFactorService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

/** SEG-08: login do superadmin com verificação em duas etapas, sem trancar quem ainda não ligou. */
class SuperAdminTwoFactorLoginTest {

    private final AuthenticationManager authManager = mock(AuthenticationManager.class);
    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final UserRepository users = mock(UserRepository.class);
    private final TwoFactorService twoFactor = mock(TwoFactorService.class);
    private final AuthService service = new AuthService();

    SuperAdminTwoFactorLoginTest() {
        ReflectionTestUtils.setField(service, "authenticationManager", authManager);
        ReflectionTestUtils.setField(service, "tokenProvider", tokens);
        ReflectionTestUtils.setField(service, "userRepository", users);
        ReflectionTestUtils.setField(service, "twoFactor", twoFactor);
    }

    private User superAdmin(boolean totp) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail("sa@mercadoflow.com");
        u.setRole(UserRole.SUPER_ADMIN);
        u.setTotpEnabled(totp);
        return u;
    }

    private LoginRequest request() {
        LoginRequest r = new LoginRequest();
        r.setEmail("sa@mercadoflow.com");
        r.setPassword("senha-certa");
        r.setKeepConnected(true);
        return r;
    }

    private void passwordOk(User u) {
        Authentication auth = new UsernamePasswordAuthenticationToken(u.getEmail(), null);
        when(authManager.authenticate(any())).thenReturn(auth);
        when(users.findForAuthenticationByEmail("sa@mercadoflow.com")).thenReturn(Optional.of(u));
        when(tokens.generateToken(any(Authentication.class), anyLong())).thenReturn("jwt");
    }

    @Test
    void comTotpLigadoOLoginExigeOCodigoESemToken() {
        User u = superAdmin(true);
        passwordOk(u);
        when(twoFactor.challenge(u.getId(), true)).thenReturn("desafio");

        LoginResponse r = service.superAdminLogin(request());

        assertThat(r.isMfaRequired()).isTrue();
        assertThat(r.getMfaChallenge()).isEqualTo("desafio");
        assertThat(r.getToken()).isNull();
        verify(tokens, never()).generateToken(any(Authentication.class), anyLong());
    }

    @Test
    void semTotpOLoginSegueComoAntes() {
        User u = superAdmin(false);
        passwordOk(u);

        LoginResponse r = service.superAdminLogin(request());

        assertThat(r.isMfaRequired()).isFalse();
        assertThat(r.getToken()).isEqualTo("jwt");
        verify(twoFactor, never()).challenge(any(), anyBoolean());
    }

    @Test
    void segundaEtapaDoPainelRecusaQuemNaoESuperAdmin() {
        User admin = superAdmin(true);
        admin.setRole(UserRole.ADMIN);
        when(twoFactor.complete("desafio", "123456")).thenReturn(new TwoFactorService.Challenge(admin.getId(), false));
        when(users.findById(admin.getId())).thenReturn(Optional.of(admin));

        assertThrows(IllegalArgumentException.class, () -> service.superAdminLoginSecondStep("desafio", "123456"));
        verify(tokens, never()).generateToken(any(Authentication.class), anyLong());
    }

    @Test
    void segundaEtapaComumNaoEmiteTokenDeSuperAdmin() {
        User u = superAdmin(true);
        when(twoFactor.complete("desafio", "123456")).thenReturn(new TwoFactorService.Challenge(u.getId(), false));
        when(users.findById(u.getId())).thenReturn(Optional.of(u));

        assertThrows(IllegalArgumentException.class, () -> service.loginSecondStep("desafio", "123456"));
        verify(tokens, never()).generateToken(any(Authentication.class), anyLong());
    }
}
