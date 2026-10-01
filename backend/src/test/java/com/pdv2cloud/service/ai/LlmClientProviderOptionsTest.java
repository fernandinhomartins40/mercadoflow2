package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** DeepSeek: raciocínio desligado (senão o teto de tokens vai todo no "pensar" e a resposta sai vazia). */
class LlmClientProviderOptionsTest {

    private final LlmClient client = new LlmClient();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deepSeekDesligaORaciocinio() throws Exception {
        JsonNode body = mapper.readTree(client.providerOptions("https://api.deepseek.com", "{\"model\":\"deepseek-flash\",\"max_tokens\":32}"));
        assertEquals("disabled", body.path("thinking").path("type").asText());
        assertEquals(32, body.path("max_tokens").asInt());
    }

    @Test
    void outrosProvedoresNaoMudam() {
        String body = "{\"model\":\"qwen/qwen3.5-flash\"}";
        assertEquals(body, client.providerOptions("https://openrouter.ai/api/v1", body));
        assertEquals(body, client.providerOptions(null, body));
    }

    @Test
    void motivoDaRespostaVazia() throws Exception {
        assertTrue(LlmClient.emptyReason(mapper.readTree(
            "{\"finish_reason\":\"length\",\"message\":{\"content\":\"\",\"reasoning_content\":\"Vou pensar...\"}}"))
            .contains("raciocinando"));
        assertTrue(LlmClient.emptyReason(mapper.readTree("{\"finish_reason\":\"length\",\"message\":{\"content\":\"\"}}"))
            .contains("limite de tokens"));
        assertFalse(LlmClient.emptyReason(mapper.readTree("{\"finish_reason\":\"stop\",\"message\":{\"content\":\"\"}}"))
            .contains("limite"));
    }
}
