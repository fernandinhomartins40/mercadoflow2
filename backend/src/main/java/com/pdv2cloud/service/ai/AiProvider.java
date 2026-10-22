package com.pdv2cloud.service.ai;

/**
 * Catálogo de provedores de IA que o cliente pode configurar.
 *
 * Todos expõem API compatível com a da OpenAI ({@code POST /chat/completions}),
 * então um único cliente HTTP atende a lista inteira trocando base URL, chave e
 * modelo. É por isso que acrescentar um provedor aqui é acrescentar uma linha,
 * não uma implementação.
 *
 * A ordem da enum é a ordem sugerida da cadeia de fallback; o cliente pode
 * reordenar pela prioridade.
 *
 * Só camada paga (dono, 22/10/2026, LGPD-07): nas camadas gratuitas o provedor
 * pode usar perguntas e números do mercado para treinar modelos. Por isso
 * nenhum modelo gratuito ({@link #isFreeModel}) é cadastrado nem chamado, e o
 * padrão de cada provedor é um modelo pago. O tipo de plano da chave do
 * cliente (BYOK) não é visível pela API; a tela pede uma conta paga.
 */
public enum AiProvider {

    /** Tem free tier; aqui só com conta paga. Contexto menor exige contexto enxuto. */
    CEREBRAS("https://api.cerebras.ai/v1", "llama-3.3-70b", true),

    /** LPU: latência muito baixa. Tem free tier; aqui só com conta paga. */
    GROQ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", true),

    /** Catálogo grande. Tem plano free; aqui só com conta paga. */
    NVIDIA_NIM("https://integrate.api.nvidia.com/v1", "meta/llama-3.3-70b-instruct", true),

    /**
     * Agregador. O padrão era um modelo ":free"; passou ao mesmo modelo pago da
     * reserva da plataforma (V69). Rotas ":free" são recusadas.
     */
    OPENROUTER("https://openrouter.ai/api/v1", "qwen/qwen3.7-flash", true),

    /** Camada compatível com OpenAI do Gemini. Sem faturamento, o Google usa os dados para treino. */
    GEMINI("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash", true),

    /**
     * Pago, mas barato; é o provedor que a plataforma usa nos temas de encarte.
     * Mesmo modelo padrão de {@code PlatformAiService} (ago/2026).
     */
    DEEPSEEK("https://api.deepseek.com", "deepseek-flash", false),

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

    /**
     * O provedor também tem camada gratuita. A UI usa para pedir conta paga
     * (na gratuita os dados podem ir para treino), não para oferecer o grátis.
     */
    public boolean hasFreeTier() {
        return hasFreeTier;
    }

    /**
     * Modelo de camada gratuita: as rotas ":free" do OpenRouter e o roteador
     * "openrouter/free". Nunca é cadastrado nem chamado (LGPD-07).
     */
    public static boolean isFreeModel(String model) {
        if (model == null) {
            return false;
        }
        String m = model.trim().toLowerCase(java.util.Locale.ROOT);
        return m.endsWith(":free") || m.equals("openrouter/free");
    }

    /** Frase para o cliente quando um modelo gratuito é recusado. */
    /**
     * Fora do catálogo do lojista (dono, 22/10/2026): têm camada gratuita e a API
     * não diz se a chave do cliente é de conta paga. Os valores ficam na enum
     * porque credenciais antigas guardam o nome; só não são cadastrados nem usados.
     */
    public boolean retired() {
        return this == CEREBRAS || this == GROQ || this == NVIDIA_NIM || this == GEMINI;
    }

    public static final String RETIRED_REFUSED =
        "Este provedor saiu da lista: ele tem plano gratuito, em que pode usar seus dados para treinar a IA. "
            + "Use OpenRouter, OpenAI, DeepSeek ou um endpoint próprio.";

    public static final String FREE_MODEL_REFUSED =
        "Modelos gratuitos não são aceitos: nesses planos o provedor pode usar seus dados para treinar a IA. "
            + "Escolha um modelo pago.";

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
            case DEEPSEEK -> "DeepSeek";
            case OPENAI -> "OpenAI";
            case CUSTOM -> "Endpoint próprio";
        };
    }
}
