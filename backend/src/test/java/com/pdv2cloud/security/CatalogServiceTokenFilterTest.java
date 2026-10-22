package com.pdv2cloud.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/** SEG-08: token de serviço dos coletores só nas rotas de catálogo. */
class CatalogServiceTokenFilterTest {

    private static final String TOKEN = "mfcat_0123456789abcdef0123456789abcdef0123456789abcdef";

    private final CatalogServiceTokenFilter filter = new CatalogServiceTokenFilter(TOKEN);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Authentication run(String method, String uri, String token) throws Exception {
        SecurityContextHolder.clearContext();
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        req.addHeader("Authorization", "Bearer " + token);
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(req, new MockHttpServletResponse(), chain);
        assertThat(chain.getRequest()).isNotNull();
        return SecurityContextHolder.getContext().getAuthentication();
    }

    @Test
    void tokenCertoNaRotaDoColetorAutenticaSoComoCatalogService() throws Exception {
        Authentication auth = run("POST", "/api/v1/super-admin/catalog/crawler/runs/claim", TOKEN);

        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isInstanceOf(CatalogServicePrincipal.class);
        assertThat(auth.getAuthorities()).extracting(GrantedAuthority::getAuthority).containsExactly("ROLE_CATALOG_SERVICE");
    }

    @Test
    void tokenCertoValeNasRotasComIdENaImportacao() throws Exception {
        assertThat(run("POST", "/api/v1/super-admin/catalog/crawler/runs/3f1c2a4e-1b2c-4d5e-8f90-123456789abc/finish", TOKEN)).isNotNull();
        assertThat(run("GET", "/api/v1/super-admin/catalog/crawler/runs/3f1c2a4e-1b2c-4d5e-8f90-123456789abc", TOKEN)).isNotNull();
        assertThat(run("POST", "/api/v1/admin/catalog/import/records", TOKEN)).isNotNull();
    }

    @Test
    void tokenCertoEmOutraRotaDeSuperAdminNaoAutentica() throws Exception {
        assertThat(run("GET", "/api/v1/super-admin/users", TOKEN)).isNull();
        assertThat(run("GET", "/api/v1/super-admin/catalog/crawler/monitor", TOKEN)).isNull();
        // Mesma rota, outro método: salvar a configuração continua só do superadmin.
        assertThat(run("PUT", "/api/v1/super-admin/catalog/crawler/config", TOKEN)).isNull();
        assertThat(run("POST", "/api/v1/super-admin/catalog/crawler/runs/3f1c2a4e-1b2c-4d5e-8f90-123456789abc/cancel", TOKEN)).isNull();
        assertThat(run("GET", "/api/v1/admin/catalog/products", TOKEN)).isNull();
    }

    @Test
    void tokenErradoNaoAutentica() throws Exception {
        assertThat(run("GET", "/api/v1/super-admin/catalog/crawler/config", TOKEN + "x")).isNull();
        assertThat(run("GET", "/api/v1/super-admin/catalog/crawler/config", "mfcat_outro")).isNull();
        assertThat(run("GET", "/api/v1/super-admin/catalog/crawler/config", "")).isNull();
    }

    @Test
    void semTokenConfiguradoOuCurtoDemaisFicaDesligado() {
        assertThat(new CatalogServiceTokenFilter("").matchesToken("")).isFalse();
        assertThat(new CatalogServiceTokenFilter("abc").matchesToken("abc")).isFalse();
    }

    @Test
    void listaDeRotasUsadaPeloSecurityConfig() {
        assertThat(CatalogServiceTokenFilter.isSuperAdminCatalogRoute(
            new MockHttpServletRequest("GET", "/api/v1/super-admin/catalog/image-lookups/pending"))).isTrue();
        assertThat(CatalogServiceTokenFilter.isSuperAdminCatalogRoute(
            new MockHttpServletRequest("POST", "/api/v1/super-admin/users"))).isFalse();
        assertThat(CatalogServiceTokenFilter.isAdminCatalogRoute(
            new MockHttpServletRequest("POST", "/api/v1/admin/catalog/import/records"))).isTrue();
    }
}
