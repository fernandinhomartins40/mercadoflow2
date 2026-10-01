package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.pdv2cloud.service.ai.LlmClient;
import org.junit.jupiter.api.Test;

/** Chave colada com sujeira não pode virar "401" misterioso; o motivo do provedor aparece sem vazar chave. */
class ProviderKeyTest {

    @Test
    void limpaAChaveColada() {
        assertEquals("sk-or-v1-abc123def456", AiPlatformConfig.cleanKey("  sk-or-v1-abc123def456\n"));
        assertEquals("sk-or-v1-abc123def456", AiPlatformConfig.cleanKey("sk-or-v1-abc123\u200Bdef456"));
        assertEquals("sk-or-v1-abc123def456", AiPlatformConfig.cleanKey("\"sk-or-v1-abc123def456\""));
        assertEquals("sk-or-v1-abc123def456", AiPlatformConfig.cleanKey("Bearer sk-or-v1-abc123def456"));
        assertEquals("", AiPlatformConfig.cleanKey(null));
    }

    @Test
    void motivoDoProvedorSemVazarChave() {
        assertEquals("User not found.", LlmClient.providerReason("{\"error\":{\"message\":\"User not found.\",\"code\":401}}"));
        String masked = LlmClient.providerReason("{\"error\":{\"message\":\"Invalid key sk-or-v1-0123456789abcdef\"}}");
        assertFalse(masked.contains("0123456789abcdef"));
        assertNull(LlmClient.providerReason("<html>erro</html>"));
        assertNull(LlmClient.providerReason(null));
    }
}
