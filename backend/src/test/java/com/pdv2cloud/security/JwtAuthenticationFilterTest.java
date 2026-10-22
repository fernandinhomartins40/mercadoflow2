package com.pdv2cloud.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.UserRole;
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
}
