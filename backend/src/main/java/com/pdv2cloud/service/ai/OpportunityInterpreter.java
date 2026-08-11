package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiInterpretation;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Traduz uma oportunidade para a linguagem do supermercadista.
 *
 * A auditoria (§16) registrou que os textos determinísticos que já existiam —
 * {@code buildReason} do capital, {@code buildInsight} da promoção — eram "um
 * ótimo protótipo do que a IA generativa deveria produzir em escala". É
 * exatamente essa a relação aqui: o texto determinístico **não foi
 * substituído**, ele virou o piso. A IA escreve por cima quando o cliente tem
 * chave configurada e o provedor responde; quando não, o usuário lê o mesmo que
 * lia antes da Fase 5.
 *
 * Consequência prática: nenhuma tela, job ou endpoint passa a depender de IA.
 */
@Service
@Slf4j
public class OpportunityInterpreter {

    public static final String TASK = "INTERPRETAR_OPORTUNIDADE";
    private static final String SUBJECT_TYPE = "OPPORTUNITY";

    private final AiOrchestrator orchestrator;
    private final AiContextBuilder contextBuilder;
    private final AiInterpretationRepository interpretationRepository;
    private final RecommendationRepository recommendationRepository;

    public OpportunityInterpreter(
        AiOrchestrator orchestrator,
        AiContextBuilder contextBuilder,
        AiInterpretationRepository interpretationRepository,
        RecommendationRepository recommendationRepository
    ) {
        this.orchestrator = orchestrator;
        this.contextBuilder = contextBuilder;
        this.interpretationRepository = interpretationRepository;
        this.recommendationRepository = recommendationRepository;
    }

    /**
     * Interpreta uma oportunidade, chamando o provedor se necessário.
     *
     * Caminho de escrita: use no job noturno ou quando o usuário pedir
     * explicitamente. NÃO use ao montar o feed — ver
     * {@link #loadExisting(UUID, List)}.
     */
    public AiOrchestrator.Interpretation interpret(UUID marketId, Opportunity opportunity) {
        List<Recommendation> recommendations =
            recommendationRepository.findByOpportunityId(opportunity.getId());

        AiContextBuilder.AiContext context =
            contextBuilder.forOpportunity(opportunity, recommendations);

        return orchestrator.interpret(
            marketId,
            TASK,
            SUBJECT_TYPE,
            opportunity.getId(),
            context,
            AiPrompts.SYSTEM_OPPORTUNITY,
            AiPrompts.VERSION_OPPORTUNITY,
            fallbackText(opportunity, recommendations)
        );
    }

    /**
     * Interpretações já prontas para um conjunto de oportunidades.
     *
     * O feed usa ESTE método, não o {@link #interpret}: montar a tela nunca
     * dispara chamada externa. Um feed com 60 oportunidades e um provedor
     * lento faria o usuário esperar minutos por uma tela que já tinha tudo
     * para exibir. Quem não tem interpretação pronta simplesmente aparece com
     * o texto do sistema, e a geração acontece no job.
     *
     * @return oportunidadeId → texto da IA
     */
    public Map<UUID, String> loadExisting(UUID marketId, List<UUID> opportunityIds) {
        Map<UUID, String> byOpportunity = new HashMap<>();
        if (opportunityIds == null || opportunityIds.isEmpty()) {
            return byOpportunity;
        }
        for (AiInterpretation row :
            interpretationRepository.findBySubjects(marketId, SUBJECT_TYPE, opportunityIds)) {
            // Só o que veio de um modelo: repetir o texto determinístico aqui
            // duplicaria na tela o que a própria oportunidade já mostra.
            if (!Boolean.TRUE.equals(row.getDeterministic()) && row.getSubjectId() != null) {
                byOpportunity.put(row.getSubjectId(), row.getContent());
            }
        }
        return byOpportunity;
    }

    /**
     * Interpreta em lote as oportunidades abertas de um mercado.
     *
     * Chamado pelo job, depois da detecção. Erro numa oportunidade não derruba
     * as outras — mesma regra de convivência dos detectores da Fase 3.
     *
     * @return quantas foram interpretadas por um modelo (não conta fallback)
     */
    public int interpretMarket(UUID marketId, List<Opportunity> opportunities) {
        if (!orchestrator.isEnabledFor(marketId)) {
            return 0;
        }
        int done = 0;
        for (Opportunity o : opportunities) {
            try {
                AiOrchestrator.Interpretation result = interpret(marketId, o);
                if (!result.deterministic()) {
                    done++;
                }
            } catch (Exception e) {
                log.warn("Falha ao interpretar oportunidade {}: {}", o.getId(), e.getMessage());
            }
        }
        return done;
    }

    /**
     * O texto do sistema, sempre disponível.
     *
     * Não é um placeholder: é a descrição que os detectores da Fase 3 já
     * produzem, acrescida da ação calculada na Fase 4. Um usuário sem IA
     * configurada continua lendo algo útil.
     */
    String fallbackText(Opportunity opportunity, List<Recommendation> recommendations) {
        StringBuilder sb = new StringBuilder();
        if (opportunity.getDescription() != null && !opportunity.getDescription().isBlank()) {
            sb.append(opportunity.getDescription());
        } else {
            sb.append(opportunity.getTitle());
        }
        if (recommendations != null && !recommendations.isEmpty()) {
            Recommendation first = recommendations.get(0);
            if (first.getRationale() != null && !first.getRationale().isBlank()) {
                sb.append(' ').append(first.getRationale());
            }
        }
        return sb.toString();
    }
}
