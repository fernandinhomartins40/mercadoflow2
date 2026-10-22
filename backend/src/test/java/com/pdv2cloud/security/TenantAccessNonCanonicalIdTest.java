package com.pdv2cloud.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * SEG-01: o {marketId} escrito fora do formato canônico vira o mesmo UUID no
 * Spring (UUID.fromString é tolerante), mas escapava da regex do filtro e
 * pulava a checagem de mercado.
 */
class TenantAccessNonCanonicalIdTest {

    /** Mercado alheio com um segmento começando em zero: dá para escrever "+bcdef1" ou "abcdef1". */
    private static final String OTHER = "0abcdef1-2345-4678-9abc-def012345678";
    private static final UUID MINE = UUID.randomUUID();

    private final TenantAccessFilter filter = new TenantAccessFilter();

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Test
    void formasNaoCanonicasSaoReconhecidas() {
        // Pré-condição: o Java aceita estas formas como o mesmo UUID.
        assertEquals(UUID.fromString(OTHER), UUID.fromString("+abcdef1-2345-4678-9abc-def012345678"));
        assertEquals(UUID.fromString(OTHER), UUID.fromString("abcdef1-2345-4678-9abc-def012345678"));

        assertTrue(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/+abcdef1-2345-4678-9abc-def012345678/commerce"));
        assertTrue(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/abcdef1-2345-4678-9abc-def012345678"));
        assertTrue(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/%2Babcdef1-2345-4678-9abc-def012345678/x"));
        assertTrue(TenantAccessFilter.nonCanonicalMarketId("/api/v1/partner/markets/abcdef1-2345-4678-9abc-def012345678/sales"));
        assertFalse(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/" + OTHER + "/commerce"));
        assertFalse(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/" + OTHER.toUpperCase() + "/commerce"));
        assertFalse(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets/nao-e-uuid/x"));
        assertFalse(TenantAccessFilter.nonCanonicalMarketId("/api/v1/markets"));
    }

    @Test
    void usuarioNaoEntraNoMercadoAlheioComIdNaoCanonico() throws Exception {
        AppUserDetails principal = new AppUserDetails("user@test.com", "senha", true,
            List.of(new SimpleGrantedAuthority("ROLE_MARKET_OWNER")), MINE, UserRole.MARKET_OWNER);
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        String uri = "/api/v1/markets/+abcdef1-2345-4678-9abc-def012345678/data-participation";
        MockHttpServletRequest request = new MockHttpServletRequest("PUT", uri);
        request.setRequestURI(uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> chainCalled.set(true));

        assertFalse(chainCalled.get(), "id fora do formato não pode chegar ao controller");
        assertEquals(400, response.getStatus());
    }
}
