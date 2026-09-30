package com.pdv2cloud.service.ai.platform;

/**
 * Simulador de provedores de IA para testes locais.
 *
 * Só existe quando a JVM é iniciada com a propriedade de sistema
 * {@code -Dmercadoflow.ai.mock-base-url=http://...} (nunca variável de ambiente,
 * nunca configuração da aplicação). Nesse caso, DeepSeek, OpenRouter e Jev da
 * plataforma apontam para o simulador, e a proteção contra endereço interno
 * aceita esse único endereço. Em produção a propriedade não existe e nada muda.
 */
public final class AiDevMock {

    private static final String PROPERTY = "mercadoflow.ai.mock-base-url";

    private AiDevMock() {
    }

    public static String baseUrl() {
        String v = System.getProperty(PROPERTY);
        return v == null || v.isBlank() ? null : v.trim().replaceAll("/+$", "");
    }

    public static boolean isMock(String url) {
        String mock = baseUrl();
        return mock != null && url != null && url.trim().replaceAll("/+$", "").equals(mock);
    }
}
