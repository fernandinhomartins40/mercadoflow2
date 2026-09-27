package com.pdv2cloud.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetAddress;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OutboundUrlGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "http://8.8.8.8/v1",                 // sem TLS
        "ftp://8.8.8.8/",
        "https://127.0.0.1/v1",
        "https://localhost/v1",
        "https://10.0.0.5/v1",
        "https://172.17.0.1:3300/v1",        // gateway Docker da VPS
        "https://192.168.1.10/v1",
        "https://169.254.169.254/latest",    // metadados de nuvem
        "https://100.64.0.1/v1",
        "https://0.0.0.0/v1",
        "https://[::1]/v1",
        "https://[fd00::1]/v1",
        "https://user:pass@8.8.8.8/v1",
        "nao e url"
    })
    void recusaUrlsInternasOuSemHttps(String url) {
        assertThrows(IllegalArgumentException.class, () -> OutboundUrlGuard.assertPublicHttps(url));
    }

    @Test
    void aceitaIpPublicoComHttps() {
        assertDoesNotThrow(() -> OutboundUrlGuard.assertPublicHttps("https://8.8.8.8/v1"));
        assertDoesNotThrow(() -> OutboundUrlGuard.assertPublicHttps("https://[2001:4860:4860::8888]/v1"));
    }

    @Test
    void classificaEnderecos() throws Exception {
        assertTrue(OutboundUrlGuard.isPublic(InetAddress.getByName("1.1.1.1")));
        assertFalse(OutboundUrlGuard.isPublic(InetAddress.getByName("172.31.255.255")));
        assertFalse(OutboundUrlGuard.isPublic(InetAddress.getByName("198.18.0.1")));
        assertFalse(OutboundUrlGuard.isPublic(InetAddress.getByName("255.255.255.255")));
    }
}
