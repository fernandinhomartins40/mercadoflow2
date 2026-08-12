package com.pdv2cloud.service.ai.chat;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import com.pdv2cloud.service.ai.AiContextBuilder;
import com.pdv2cloud.service.intelligence.StoreRhythmService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Ferramentas que expõem ao chat o trabalho das Fases 3, 4 e da cadência
 * adaptativa: as oportunidades detectadas, as recomendações com o cálculo por
 * trás, e o ritmo da loja.
 *
 * Isto fecha um ciclo: o motor de oportunidades já sabia o que estava errado na
 * loja, mas o lojista precisava abrir a Central para descobrir. Agora ele pode
 * simplesmente perguntar.
 *
 * A evidência das oportunidades passa pelo mesmo {@link AiContextBuilder} usado
 * na interpretação — ou seja, pela mesma allowlist LGPD. Nenhum campo escapa
 * por este caminho só porque a porta de entrada é outra.
 */
@Component
public class OpportunityTools {

    private final OpportunityRepository opportunityRepository;
    private final RecommendationRepository recommendationRepository;
    private final AiContextBuilder contextBuilder;
    private final StoreRhythmService rhythmService;

    public OpportunityTools(
        OpportunityRepository opportunityRepository,
        RecommendationRepository recommendationRepository,
        AiContextBuilder contextBuilder,
        StoreRhythmService rhythmService
    ) {
        this.opportunityRepository = opportunityRepository;
        this.recommendationRepository = recommendationRepository;
        this.contextBuilder = contextBuilder;
        this.rhythmService = rhythmService;
    }

    public List<DataTool> tools() {
        return List.of(oportunidades(), recomendacoesPendentes(), horarioDeMovimento());
    }

    /** "O que preciso resolver hoje?" */
    private DataTool oportunidades() {
        return new DataTool() {
            @Override
            public String name() {
                return "listar_oportunidades";
            }

            @Override
            public String description() {
                return "Lista o que o sistema detectou que merece atenção na loja: "
                    + "risco de ruptura, capital parado, queda de venda, candidatos a "
                    + "promoção, preço acima do mercado. Cada item vem com os números "
                    + "que o sustentam. Use para 'o que devo fazer', 'o que está errado' "
                    + "ou perguntas sobre um tipo específico de problema.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "tipo", DataTool.stringParam(
                        "Filtra por tipo, ex.: CAPITAL_PARADO, RISCO_DE_RUPTURA, "
                            + "QUEDA_DE_VENDAS, OPORTUNIDADE_DE_COMPRA, "
                            + "OPORTUNIDADE_DE_PROMOCAO. Omita para ver todos"),
                    "limite", DataTool.numberParam("Quantas listar (padrão 10)")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int limit = DataTool.limitArg(args);
                String type = DataTool.stringArg(args, "tipo");

                List<Opportunity> open = opportunityRepository.findOpenByMarket(marketId);
                List<Map<String, Object>> items = new ArrayList<>();

                for (Opportunity o : open) {
                    if (type != null && !type.equalsIgnoreCase(o.getType())) {
                        continue;
                    }
                    if (items.size() >= limit) {
                        break;
                    }
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("tipo", o.getType());
                    item.put("resumo", o.getTitle());
                    if (o.getProduct() != null) {
                        item.put("produto", o.getProduct().getName());
                    }
                    item.put("impactoEstimado", o.getExpectedImpactValue());
                    item.put("detectadaVezes", o.getDetectionCount());
                    // Mesma allowlist da interpretação: o caminho é outro, a
                    // regra de minimização é a mesma.
                    Map<String, Object> evidence =
                        contextBuilder.filterEvidence(o.getEvidence());
                    if (!evidence.isEmpty()) {
                        item.put("numeros", evidence);
                    }
                    items.add(item);
                }

                if (items.isEmpty()) {
                    return Map.of("resultado", type == null
                        ? "Nenhuma oportunidade aberta no momento."
                        : "Nenhuma oportunidade aberta do tipo " + type + ".");
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("oportunidades", items);
                out.put("totalAbertas", open.size());
                return out;
            }
        };
    }

    /** "O que o sistema está me sugerindo?" */
    private DataTool recomendacoesPendentes() {
        return new DataTool() {
            @Override
            public String name() {
                return "listar_recomendacoes";
            }

            @Override
            public String description() {
                return "Lista as ações que o sistema sugere e ainda aguardam decisão "
                    + "(comprar, promover, liquidar, ajustar preço), com o retorno "
                    + "esperado e o cálculo que gerou o número. Use quando a pergunta "
                    + "for sobre o que fazer ou sobre sugestões pendentes.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "limite", DataTool.numberParam("Quantas listar (padrão 10)")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int limit = DataTool.limitArg(args);
                List<Recommendation> pending =
                    recommendationRepository.findPendingByMarket(marketId);

                if (pending.isEmpty()) {
                    return Map.of("resultado", "Nenhuma recomendação aguardando decisão.");
                }

                List<Map<String, Object>> items = new ArrayList<>();
                BigDecimal totalImpact = BigDecimal.ZERO;
                for (Recommendation r : pending.stream().limit(limit).toList()) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("acao", r.getActionType().name());
                    item.put("resumo", r.getTitle());
                    item.put("porque", r.getRationale());
                    item.put("comoFoiCalculado", r.getCalculationTrace());
                    item.put("retornoEsperado", r.getExpectedImpactValue());
                    items.add(item);
                }
                for (Recommendation r : pending) {
                    if (r.getExpectedImpactValue() != null) {
                        totalImpact = totalImpact.add(r.getExpectedImpactValue());
                    }
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("recomendacoes", items);
                out.put("totalPendentes", pending.size());
                out.put("somaDoRetornoEsperado", totalImpact);
                out.put("observacao", "Nada é executado automaticamente: as ações "
                    + "aguardam a decisão do dono da loja.");
                return out;
            }
        };
    }

    /** "Qual meu horário de pico?" */
    private DataTool horarioDeMovimento() {
        return new DataTool() {
            @Override
            public String name() {
                return "horario_de_movimento";
            }

            @Override
            public String description() {
                return "Mostra em quais horas do dia a loja vende mais e menos, com o "
                    + "índice de movimento de cada hora. Use para perguntas sobre "
                    + "horário de pico, hora fraca, quando repor prateleira ou escalar "
                    + "funcionário.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                List<StoreRhythmService.HourlyMovement> profile =
                    rhythmService.dailyProfile(marketId);

                if (profile.isEmpty()) {
                    return Map.of("resultado", "Ainda não há histórico suficiente para "
                        + "identificar o padrão de horários desta loja.");
                }

                List<Map<String, Object>> hours = new ArrayList<>();
                for (StoreRhythmService.HourlyMovement h : profile) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("hora", String.format(Locale.ROOT, "%02dh", h.hour()));
                    item.put("indiceDeMovimento", h.relativeIndex());
                    item.put("classificacao", h.rhythm().name());
                    hours.add(item);
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("resumo", rhythmService.describePeakHours(marketId));
                out.put("porHora", hours);
                out.put("comoLer", "Índice 1,0 é a média da loja. Acima de 1,3 é pico; "
                    + "abaixo de 0,6 é hora fraca.");
                return out;
            }
        };
    }
}
