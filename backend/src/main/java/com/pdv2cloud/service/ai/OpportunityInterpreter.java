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

    /**
     * Teto de chamadas ao provedor por mercado, por rodada.
     *
     * Uma loja em produção tem centenas de oportunidades abertas. Interpretar
     * todas de uma vez estouraria a cota gratuita do cliente logo na primeira
     * madrugada — e, pior, o circuit breaker desligaria o provedor por 10
     * minutos após o primeiro 429, deixando o resto em fallback de qualquer
     * forma.
     *
     * As oportunidades chegam ordenadas por prioridade, então o teto corta
     * exatamente onde deve: as 40 mais relevantes recebem a leitura da IA, as
     * demais ficam com o texto do sistema — e são interpretadas nas rodadas
     * seguintes, porque o cache faz as já feitas não custarem nada.
     */
    private static final int MAX_LLM_CALLS_PER_RUN = 40;

    /**
     * Espaçamento entre chamadas. Os free tiers trabalham na casa de 30
     * requisições por minuto; ~1,5 s entre elas mantém a rodada abaixo disso
     * sem depender de o provedor devolver 429 para descobrirmos o limite.
     */
    private static final long DEFAULT_THROTTLE_MILLIS = 1_500;

    /**
     * Não é final para que o teste possa zerá-la: verificar o teto de 40
     * chamadas com a pausa real custaria um minuto de suíte sem provar nada
     * além do que um sleep já prova.
     */
    private long throttleMillis = DEFAULT_THROTTLE_MILLIS;

    /** Só para teste — a produção usa a pausa padrão. */
    void setThrottleMillis(long millis) {
        this.throttleMillis = millis;
    }

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
        int llmCalls = 0;

        for (Opportunity o : opportunities) {
            // Interrompida = container sendo derrubado. Parar aqui deixa o
            // restante com o texto do sistema, que e o comportamento correto.
            if (Thread.currentThread().isInterrupted()) {
                log.info("Interpretacao do mercado {} interrompida; o restante fica "
                    + "com o texto do sistema", marketId);
                break;
            }
            if (llmCalls >= MAX_LLM_CALLS_PER_RUN) {
                log.info("Mercado {}: teto de {} interpretacoes por rodada atingido; "
                        + "as demais ficam com o texto do sistema ate a proxima",
                    marketId, MAX_LLM_CALLS_PER_RUN);
                break;
            }
            try {
                AiOrchestrator.Interpretation result = interpret(marketId, o);
                if (!result.deterministic()) {
                    done++;
                    // Só conta como chamada o que não veio do cache. Uma rodada
                    // em que tudo já estava interpretado não gasta o teto e
                    // avança para as oportunidades ainda sem leitura.
                    if (!result.fromCache()) {
                        llmCalls++;
                        throttle();
                    }
                }
            } catch (Exception e) {
                log.warn("Falha ao interpretar oportunidade {}: {}", o.getId(), e.getMessage());
            }
        }
        return done;
    }

    /**
     * Pausa entre chamadas ao provedor.
     *
     * Interrupção não é erro nem motivo para insistir: significa que o
     * container está sendo derrubado. Restaura a flag e deixa a rodada
     * terminar — as oportunidades restantes ficam com o texto do sistema, que
     * é o comportamento correto.
     */
    private void throttle() {
        try {
            Thread.sleep(throttleMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
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
