package com.pdv2cloud.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class AuditClientIpTest {

    @Test
    void ignoraXForwardedForQueOClienteManda() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Forwarded-For", "1.2.3.4, 203.0.113.9");
        req.addHeader("X-Real-IP", "203.0.113.9");

        assertThat(AuditService.getClientIp(req)).isEqualTo("203.0.113.9");
    }

    @Test
    void semProxyUsaOEnderecoDaConexao() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Forwarded-For", "1.2.3.4");
        req.setRemoteAddr("198.51.100.7");

        assertThat(AuditService.getClientIp(req)).isEqualTo("198.51.100.7");
    }
}
