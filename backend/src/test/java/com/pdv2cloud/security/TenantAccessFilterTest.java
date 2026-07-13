package com.pdv2cloud.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.tenancy.TenantContext;
import jakarta.servlet.FilterChain;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Valida o isolamento estrutural da Fase 1: qualquer rota com {marketId} é
 * verificada automaticamente contra o tenant do principal, e o TenantContext
 * é populado/limpo por request (alimenta a Row-Level Security).
 */
class TenantAccessFilterTest {

    private static final UUID MARKET_A = UUID.randomUUID();
    private static final UUID MARKET_B = UUID.randomUUID();

    private final TenantAccessFilter filter = new TenantAccessFilter();

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Test
    void usuarioDeUmMercadoNaoAcessaRotaDeOutroMercado() throws Exception {
        authenticateUser(UserRole.MARKET_OWNER, MARKET_A);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);

        filter.doFilter(requestTo("/api/v1/markets/" + MARKET_B + "/supplier-orders"), response,
            chain(chainCalled, new AtomicReference<>()));

        assertFalse(chainCalled.get(), "request cross-tenant nao deve chegar ao controller");
        assertEquals(403, response.getStatus());
    }

    @Test
    void usuarioAcessaOProprioMercadoEContextoEPopulado() throws Exception {
        authenticateUser(UserRole.MARKET_OWNER, MARKET_A);
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        AtomicReference<TenantContext.TenantInfo> seen = new AtomicReference<>();

        filter.doFilter(requestTo("/api/v1/markets/" + MARKET_A + "/pdvs"),
            new MockHttpServletResponse(), chain(chainCalled, seen));

        assertTrue(chainCalled.get());
        assertNotNull(seen.get());
        assertEquals(MARKET_A, seen.get().marketId());
        assertFalse(seen.get().bypassTenantIsolation());
        assertNull(TenantContext.get(), "contexto deve ser limpo ao fim do request");
    }

    @Test
    void adminTemEscopoGlobalEBypassaValidacao() throws Exception {
        authenticateUser(UserRole.ADMIN, MARKET_A);
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        AtomicReference<TenantContext.TenantInfo> seen = new AtomicReference<>();

        filter.doFilter(requestTo("/api/v1/markets/" + MARKET_B + "/pdvs"),
            new MockHttpServletResponse(), chain(chainCalled, seen));

        assertTrue(chainCalled.get());
        assertTrue(seen.get().bypassTenantIsolation());
    }

    @Test
    void agentePopulaContextoComMercadoDaApiKey() throws Exception {
        AgentPrincipal principal = new AgentPrincipal(UUID.randomUUID(), MARKET_A, "pdv2_key", "Agente");
        SecurityContextHolder.getContext().setAuthentication(new AgentAuthenticationToken(principal));
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        AtomicReference<TenantContext.TenantInfo> seen = new AtomicReference<>();

        filter.doFilter(requestTo("/api/v1/ingest/invoices"),
            new MockHttpServletResponse(), chain(chainCalled, seen));

        assertTrue(chainCalled.get());
        assertNotNull(seen.get());
        assertEquals(MARKET_A, seen.get().marketId());
        assertFalse(seen.get().bypassTenantIsolation());
    }

    @Test
    void requestNaoAutenticadoSegueParaAutorizacaoPorRota() throws Exception {
        AtomicBoolean chainCalled = new AtomicBoolean(false);

        filter.doFilter(requestTo("/api/v1/markets/" + MARKET_A + "/pdvs"),
            new MockHttpServletResponse(), chain(chainCalled, new AtomicReference<>()));

        assertTrue(chainCalled.get(), "sem principal, quem nega e a camada de autorizacao (401)");
    }

    private void authenticateUser(UserRole role, UUID marketId) {
        AppUserDetails principal = new AppUserDetails(
            "user@test.com", "senha", true,
            List.of(new SimpleGrantedAuthority("ROLE_" + role.name())),
            marketId, role);
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private MockHttpServletRequest requestTo(String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setRequestURI(uri);
        return request;
    }

    private FilterChain chain(AtomicBoolean called, AtomicReference<TenantContext.TenantInfo> seen) {
        return (req, res) -> {
            called.set(true);
            seen.set(TenantContext.get());
        };
    }
}
