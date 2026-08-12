package com.pdv2cloud.service.ai;

/**
 * Perfil de chamada por tarefa — o roteamento da Fase 6.
 *
 * As tarefas de IA do Mercadoflow têm exigências diferentes, e tratá-las com
 * os mesmos parâmetros desperdiça de um lado e trunca do outro:
 *
 * <ul>
 *   <li>interpretar uma oportunidade é um parágrafo curto, feito em lote sobre
 *       dezenas de itens — cada token extra multiplica pelo tamanho da rodada;</li>
 *   <li>o resumo semanal é um texto por semana, então cabe mais espaço;</li>
 *   <li>o chat responde a uma pessoa esperando na tela e pode precisar
 *       encadear várias consultas antes de concluir.</li>
 * </ul>
 *
 * <b>Por que não roteia por modelo:</b> no modelo BYOK (decisão do dono, §31-A)
 * a plataforma não escolhe o provedor — o cliente cadastra a chave dele e a
 * ordem da cadeia é dele. Rotear por modelo aqui seria decidir no lugar do
 * dono da conta. O que cabe à plataforma é ajustar os parâmetros de cada
 * chamada, que é o que este enum faz.
 */
public enum AiTaskProfile {

    /**
     * Interpretação de oportunidade: parágrafo curto, em lote.
     *
     * Temperatura baixa mas não zero — o mesmo texto repetido dezenas de vezes
     * no feed cansaria a leitura, e uma variação mínima entre itens diferentes
     * ajuda sem comprometer a consistência.
     */
    INTERPRETAR_OPORTUNIDADE(400, 0.3),

    /**
     * Resumo semanal: um por semana, então cabe mais espaço para relacionar os
     * números entre si — que é o valor do resumo.
     */
    RESUMO_SEMANAL(600, 0.4),

    /**
     * Chat: temperatura zero porque a mesma pergunta sobre os mesmos números
     * deve dar a mesma resposta. Variação aqui pareceria inconsistência dos
     * dados, não estilo.
     */
    PERGUNTE_AOS_DADOS(900, 0.0),

    /** Teste de credencial: resposta de uma palavra. */
    TESTE_DE_CONEXAO(16, 0.0);

    private final int maxTokens;
    private final double temperature;

    AiTaskProfile(int maxTokens, double temperature) {
        this.maxTokens = maxTokens;
        this.temperature = temperature;
    }

    public int maxTokens() {
        return maxTokens;
    }

    public double temperature() {
        return temperature;
    }

    /**
     * Resolve o perfil pelo nome da tarefa gravado no log.
     *
     * Tarefa desconhecida cai no perfil de interpretação, que é o mais
     * conservador em tokens — errar para o lado barato é o certo quando quem
     * paga é o cliente.
     */
    public static AiTaskProfile forTask(String task) {
        if (task == null) {
            return INTERPRETAR_OPORTUNIDADE;
        }
        for (AiTaskProfile profile : values()) {
            if (profile.name().equals(task)) {
                return profile;
            }
        }
        return INTERPRETAR_OPORTUNIDADE;
    }
}
