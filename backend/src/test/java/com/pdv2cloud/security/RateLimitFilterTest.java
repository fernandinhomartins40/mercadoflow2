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
}
