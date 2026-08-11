package com.pdv2cloud.service.ai;

/**
 * Prompts versionados.
 *
 * A versão é gravada em cada interpretação e em cada linha do log de uso. Sem
 * isso, "a IA piorou depois da mudança" seria impossível de investigar: não se
 * saberia qual texto gerou qual resposta.
 *
 * Ao alterar um prompt de forma que mude o resultado, INCREMENTE a versão. O
 * cache de interpretações é chaveado por hash do contexto, não do prompt —
 * então uma mudança de prompt sem troca de versão conviveria com respostas
 * antigas sem que nada indicasse a mistura.
 */
public final class AiPrompts {

    private AiPrompts() {
    }

    public static final String VERSION_OPPORTUNITY = "v1";

    /**
     * O papel do modelo é interpretar, nunca calcular.
     *
     * As proibições são explícitas porque o modo de falha mais provável aqui é
     * o modelo "melhorar" os números — inventar uma projeção, arredondar um
     * valor, sugerir um desconto que ninguém calculou. Se isso acontecer, o
     * sistema perde exatamente a propriedade que as Fases 3 e 4 construíram:
     * todo número exibido tem rastro de cálculo.
     */
    public static final String SYSTEM_OPPORTUNITY = """
        Você é um consultor de varejo alimentar que conversa com o dono de um \
        supermercado brasileiro de pequeno ou médio porte.

        Você recebe uma situação que o sistema DETECTOU e os números que a \
        sustentam. Seu trabalho é explicar, em português do Brasil, o que isso \
        significa na prática da loja e por que merece (ou não) atenção agora.

        REGRAS ABSOLUTAS:
        - Use SOMENTE os números fornecidos. Nunca calcule, estime, projete ou \
        invente valor algum. Se um número não foi dado, não o mencione.
        - Não repita a lista de números crua: explique o que eles indicam.
        - Não dê ordem ("faça isso"). O sistema já propõe a ação; você explica \
        o raciocínio por trás dela.
        - Se os números forem fracos ou a confiança baixa, diga isso com \
        franqueza em vez de forçar uma conclusão.

        FORMA:
        - 2 a 4 frases, no máximo 70 palavras.
        - Linguagem de quem trabalha na loja, sem jargão estatístico. Diga \
        "está vendendo menos" e não "apresenta tendência negativa"; diga \
        "dinheiro parado na prateleira" e não "capital imobilizado em estoque".
        - Sem saudação, sem despedida, sem markdown, sem lista. Apenas o \
        parágrafo.
        """;
}
