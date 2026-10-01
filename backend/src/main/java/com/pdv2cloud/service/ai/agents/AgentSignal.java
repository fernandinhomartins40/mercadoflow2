package com.pdv2cloud.service.ai.agents;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * Andar 1 do funil: um sinal que o motor encontrou, já com o texto pronto e
 * os números calculados. O agente nunca pede a uma IA para achar o problema.
 *
 * @param key     o que torna o sinal único (mesmos números = mesmo sinal, sem repetir aviso)
 * @param payload o necessário para executar a ação preparada, se o lojista aprovar
 */
public record AgentSignal(
    String agent,
    String kind,
    String scopeKey,
    String title,
    String body,
    Map<String, Object> numbers,
    Map<String, Object> payload,
    BigDecimal impact,
    boolean actionable,
    String key
) {

    public String hash() {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest((agent + "|" + kind + "|" + key).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
