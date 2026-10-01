package com.pdv2cloud.service.ai.agents;

import java.util.List;
import java.util.UUID;

/**
 * Um agente do Copiloto: olha os números do motor (andar 1 do funil) e devolve
 * os sinais com texto pronto. Não chama IA; quem decide se o sinal acorda o
 * lojista é o {@link AgentRunner}.
 */
public interface CopilotAgent {

    String name();

    List<AgentSignal> signals(UUID marketId);

    /** Executa a ação preparada, quando o lojista aprova uma decisão de nível 2. */
    default java.util.Map<String, Object> execute(UUID marketId, java.util.Map<String, Object> payload, String actor) {
        return java.util.Map.of();
    }

    /**
     * Desfaz o que {@link #execute} fez (até 24 h depois). O padrão não tem nada
     * a desfazer: o agente só informou ou abriu uma mensagem para o lojista.
     */
    default java.util.Map<String, Object> undo(UUID marketId, java.util.Map<String, Object> payload,
                                               java.util.Map<String, Object> result, String actor) {
        return java.util.Map.of();
    }
}
