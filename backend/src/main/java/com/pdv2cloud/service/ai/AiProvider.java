package com.pdv2cloud.service.ai;

/**
 * Catálogo de provedores de IA que o cliente pode configurar.
 *
 * Todos expõem API compatível com a da OpenAI ({@code POST /chat/completions}),
 * então um único cliente HTTP atende a lista inteira trocando base URL, chave e
 * modelo. É por isso que acrescentar um provedor aqui é acrescentar uma linha,
 * não uma implementação.
 *
 * A ordem da enum é a ordem sugerida da cadeia de fallback, e reflete a cota
 * gratuita de cada um (levantamento de ago/2026, no plano §24): Cerebras dá 1M
 * tokens/dia, Groq não tem sistema de créditos, NVIDIA NIM tem plano free
 * permanente. Os limites mudam — o cliente pode reordenar pela prioridade.
 */
public enum AiProvider {

    /** 1M tokens/dia no free tier; contexto menor exige contexto enxuto. */
    CEREBRAS("https://api.cerebras.ai/v1", "llama-3.3-70b", true),

    /** LPU: latência muito baixa; free sem cartão. */
    GROQ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", true),

    /** Catálogo grande, plano free permanente. */
    NVIDIA_NIM("https://integrate.api.nvidia.com/v1", "meta/llama-3.3-70b-instruct", true),

    /** Agregador: rotas :free e fallback entre modelos num endpoint só. */
    OPENROUTER("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free", true),

    /** Camada compatível com OpenAI do Gemini. */
    GEMINI("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash", true),

    /** Pago; entra quando o cliente já tem conta e prefere usá-la. */
    OPENAI("https://api.openai.com/v1", "gpt-4o-mini", false),

    /**
     * Gateway do próprio cliente (LiteLLM, Ollama exposto, 9Router...). A base
     * URL vem do cadastro; sem ela a credencial é inválida.
     */
    CUSTOM(null, null, false);

    private final String defaultBaseUrl;
    private final String defaultModel;
    private final boolean hasFreeTier;

    AiProvider(String defaultBaseUrl, String defaultModel, boolean hasFreeTier) {
        this.defaultBaseUrl = defaultBaseUrl;
        this.defaultModel = defaultModel;
        this.hasFreeTier = hasFreeTier;
    }

    public String defaultBaseUrl() {
        return defaultBaseUrl;
    }

    public String defaultModel() {
        return defaultModel;
    }

    /** Usado pela UI para sinalizar quais opções não custam nada ao cliente. */
    public boolean hasFreeTier() {
        return hasFreeTier;
    }

    /** CUSTOM exige que o cliente informe a URL; os demais já a trazem. */
    public boolean requiresBaseUrl() {
        return defaultBaseUrl == null;
    }

    /** Nome como o cliente conhece o provedor, para a tela de configuração. */
    public String label() {
        return switch (this) {
            case CEREBRAS -> "Cerebras";
            case GROQ -> "Groq";
            case NVIDIA_NIM -> "NVIDIA NIM";
            case OPENROUTER -> "OpenRouter";
            case GEMINI -> "Google Gemini";
            case OPENAI -> "OpenAI";
            case CUSTOM -> "Endpoint próprio";
        };
    }
}
