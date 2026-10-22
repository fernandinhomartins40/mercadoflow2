package com.pdv2cloud.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RateLimitFilterTest {

    private final RateLimitFilter filter = new RateLimitFilter();

    private int post(String path, String ip, String body) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.addHeader("X-Real-IP", ip);
        request.addHeader("X-Forwarded-For", "1.2.3.4");
        request.setContentType("application/json");
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void loginLimitaPorEmailMesmoTrocandoDeIp() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertEquals(200, post("/api/v1/auth/login", "203.0.113." + i, "{\"email\":\"Dono@Loja.com\"}"));
        }
        assertEquals(429, post("/api/v1/auth/login", "203.0.113.99", "{\"email\":\"dono@loja.com\"}"));
    }

    @Test
    void loginLimitaPorIpRealIgnorandoXForwardedFor() throws Exception {
        for (int i = 0; i < 20; i++) {
            assertEquals(200, post("/api/v1/auth/login", "198.51.100.7", "{\"email\":\"u" + i + "@x.com\"}"));
        }
        assertEquals(429, post("/api/v1/auth/login", "198.51.100.7", "{\"email\":\"outro@x.com\"}"));
        assertEquals(200, post("/api/v1/auth/login", "198.51.100.8", "{\"email\":\"outro@x.com\"}"));
    }

    @Test
    void cadastroLimitaPorIp() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertEquals(200, post("/api/v1/auth/register", "192.0.2.1", "{}"));
        }
        assertEquals(429, post("/api/v1/auth/register", "192.0.2.1", "{}"));
    }

    @Test
    void corpoInvalidoNaoQuebraOLogin() throws Exception {
        assertEquals(200, post("/api/v1/super-admin/auth/login", "192.0.2.50", "nao-e-json"));
    }

    private int get(String path, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.addHeader("X-Real-IP", ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void muitasChavesNovasNaoZeramATravaDeUmEmail() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertEquals(200, post("/api/v1/auth/login", "203.0.113." + i, "{\"email\":\"alvo@loja.com\"}"));
        }
        assertEquals(429, post("/api/v1/auth/login", "203.0.113.50", "{\"email\":\"alvo@loja.com\"}"));
        // Varredura com mais chaves que o teto (um IP novo por requisição).
        for (int i = 0; i <= RateLimitFilter.MAX_KEYS; i++) {
            get("/api/v1/public/invites/abc", "10." + (i >> 16 & 255) + "." + (i >> 8 & 255) + "." + (i & 255));
        }
        assertEquals(429, post("/api/v1/auth/login", "203.0.113.51", "{\"email\":\"alvo@loja.com\"}"));
    }

    @Test
    void tokenDoParceiroLimitaPorIp() throws Exception {
        for (int i = 0; i < 20; i++) {
            assertEquals(200, post("/api/v1/partner/oauth/token", "192.0.2.77", "{}"));
        }
        assertEquals(429, post("/api/v1/partner/oauth/token", "192.0.2.77", "{}"));
        assertEquals(200, post("/api/v1/partner/oauth/token", "192.0.2.78", "{}"));
    }

    @Test
    void conviteLimitaPorIp() throws Exception {
        for (int i = 0; i < 30; i++) {
            assertEquals(200, i % 2 == 0 ? get("/api/v1/public/invites/abc", "192.0.2.90")
                : post("/api/v1/public/invites/abc/accept", "192.0.2.90", "{}"));
        }
        assertEquals(429, post("/api/v1/public/invites/abc/accept", "192.0.2.90", "{}"));
    }
}
