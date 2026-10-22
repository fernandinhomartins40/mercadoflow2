package com.pdv2cloud.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.UserRole;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.test.util.ReflectionTestUtils;

class JwtAuthenticationFilterTest {

    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final CustomUserDetailsService users = mock(CustomUserDetailsService.class);
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter();

    JwtAuthenticationFilterTest() {
        ReflectionTestUtils.setField(filter, "tokenProvider", tokens);
        ReflectionTestUtils.setField(filter, "userDetailsService", users);
        when(tokens.validateToken("t")).thenReturn(true);
        when(tokens.getUsernameFromToken("t")).thenReturn("dono@loja.com");
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        req.addHeader("Authorization", "Bearer t");
        return req;
    }

    private AppUserDetails user(boolean enabled) {
        return new AppUserDetails("dono@loja.com", "x", enabled,
            List.of(new SimpleGrantedAuthority("ROLE_MARKET_OWNER")), UUID.randomUUID(), UserRole.MARKET_OWNER);
    }

    @Test
    void tokenValidoDeUsuarioAtivoAutentica() throws Exception {
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(user(true));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request(), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void contaBloqueadaPerdeASessaoMesmoComTokenValido() throws Exception {
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(user(false));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request(), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void usuarioExcluidoSegueSemSessaoEmVezDeErro() throws Exception {
        when(users.loadUserByUsername("dono@loja.com")).thenThrow(new UsernameNotFoundException("x"));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request(), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    // ── SEG-05: revogação por troca de credenciais ─────────────────────

    private AppUserDetails userChangedAt(LocalDateTime changedAt) {
        return new AppUserDetails("dono@loja.com", "x", true,
            List.of(new SimpleGrantedAuthority("ROLE_MARKET_OWNER")), UUID.randomUUID(), UserRole.MARKET_OWNER, null, changedAt);
    }

    private static Date at(LocalDateTime t) {
        return Date.from(t.atZone(ZoneId.systemDefault()).toInstant());
    }

    @Test
    void tokenEmitidoAntesDaTrocaDeSenhaPerdeASessao() throws Exception {
        LocalDateTime changed = LocalDateTime.now();
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(userChangedAt(changed));
        when(tokens.getIssuedAt("t")).thenReturn(at(changed.minusMinutes(10)));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request(), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void tokenEmitidoDepoisDaTrocaAutentica() throws Exception {
        LocalDateTime changed = LocalDateTime.now().minusMinutes(5);
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(userChangedAt(changed));
        when(tokens.getIssuedAt("t")).thenReturn(at(changed.plusMinutes(1)));

        filter.doFilter(request(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }

    @Test
    void tokenDoMesmoSegundoDaTrocaAutentica() throws Exception {
        // O iat é truncado no segundo: o token emitido logo após a troca não pode cair.
        LocalDateTime changed = LocalDateTime.of(2026, 10, 22, 10, 0, 0, 800_000_000);
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(userChangedAt(changed));
        when(tokens.getIssuedAt("t")).thenReturn(at(changed.withNano(0)));

        filter.doFilter(request(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }

    @Test
    void semTrocaRegistradaNenhumTokenCai() throws Exception {
        when(users.loadUserByUsername("dono@loja.com")).thenReturn(userChangedAt(null));
        when(tokens.getIssuedAt("t")).thenReturn(at(LocalDateTime.now().minusDays(20)));

        filter.doFilter(request(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }
}
