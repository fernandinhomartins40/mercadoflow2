package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationOutcomeRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.ai.OpportunityInterpreter;
import com.pdv2cloud.service.intelligence.ForecastAccuracyService;
import com.pdv2cloud.service.opportunity.OpportunityEngine;
import com.pdv2cloud.service.opportunity.RecommendationEngine;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Oportunidades e recomendações: o ciclo de decisão do supermercadista.
 *
 * Os DTOs são achatados de propósito — as entidades têm associações lazy
 * (market, product, opportunity) que serializadas direto causariam
 * LazyInitializationException ou payload gigante.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/opportunities")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class OpportunityController {

    private final OpportunityEngine opportunityEngine;
    private final RecommendationEngine recommendationEngine;
    private final OpportunityRepository opportunityRepository;
    private final RecommendationRepository recommendationRepository;
    private final RecommendationOutcomeRepository outcomeRepository;
    private final ForecastAccuracyService forecastAccuracyService;
    private final OpportunityInterpreter opportunityInterpreter;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public OpportunityController(
        OpportunityEngine opportunityEngine,
        RecommendationEngine recommendationEngine,
        OpportunityRepository opportunityRepository,
        RecommendationRepository recommendationRepository,
        RecommendationOutcomeRepository outcomeRepository,
        ForecastAccuracyService forecastAccuracyService,
        OpportunityInterpreter opportunityInterpreter,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.opportunityEngine = opportunityEngine;
        this.recommendationEngine = recommendationEngine;
        this.opportunityRepository = opportunityRepository;
        this.recommendationRepository = recommendationRepository;
        this.outcomeRepository = outcomeRepository;
        this.forecastAccuracyService = forecastAccuracyService;
        this.opportunityInterpreter = opportunityInterpreter;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    /**
     * Oportunidades abertas, mais relevantes primeiro.
     *
     * A régua de 12/08/2026 divide os tipos entre os que DESCREVEM o presente
     * (livres) e os que ANTECIPAM (pagos). O que fica de fora vem CONTADO na
     * resposta, nunca simplesmente omitido: "3 riscos de ruptura detectados" é
     * um argumento concreto sobre a loja do usuário, enquanto um recurso oculto
     * não gera desejo porque ele nem sabe que existe.
     */
    @GetMapping
    public ResponseEntity<OpportunityFeedDTO> list(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "all", defaultValue = "false") boolean all,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        List<Opportunity> rows = all
            ? opportunityRepository.findAllByMarket(marketId)
            : opportunityRepository.findOpenByMarket(marketId);

        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);

        List<Opportunity> visible = new ArrayList<>();
        Map<String, Long> lockedByType = new LinkedHashMap<>();
        BigDecimal lockedImpact = BigDecimal.ZERO;

        for (Opportunity o : rows) {
            if (planService.canSeeOpportunityType(limits, o.getType())) {
                visible.add(o);
            } else {
                lockedByType.merge(o.getType(), 1L, Long::sum);
                if (o.getExpectedImpactValue() != null) {
                    lockedImpact = lockedImpact.add(o.getExpectedImpactValue());
                }
            }
        }

        // Só o que JÁ foi interpretado pelo job noturno. Montar o feed nunca
        // chama provedor externo: uma tela com 60 oportunidades faria o
        // usuário esperar minutos por algo que ele já podia ler.
        Map<UUID, String> interpretations = opportunityInterpreter.loadExisting(
            marketId, visible.stream().map(Opportunity::getId).toList());

        return ResponseEntity.ok(new OpportunityFeedDTO(
            visible.stream()
                .map(o -> OpportunityDTO.from(o, interpretations.get(o.getId())))
                .toList(),
            lockedByType,
            lockedByType.values().stream().mapToLong(Long::longValue).sum(),
            lockedImpact
        ));
    }

    /**
     * O feed e o que o plano não deixa ver.
     *
     * @param bloqueadasPorTipo tipo → quantas, para a UI dizer exatamente o que
     *                          o upgrade destravaria
     * @param impactoBloqueado  soma do impacto estimado do que ficou de fora —
     *                          o argumento em reais
     */
    public record OpportunityFeedDTO(
        List<OpportunityDTO> oportunidades,
        Map<String, Long> bloqueadasPorTipo,
        long totalBloqueadas,
        BigDecimal impactoBloqueado
    ) { }

    /** Recomendações aguardando decisão. */
    @GetMapping("/recommendations")
    public ResponseEntity<List<RecommendationDTO>> pendingRecommendations(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(recommendationRepository.findPendingByMarket(marketId)
            .stream().map(RecommendationDTO::from).toList());
    }

    /**
     * Histórico de decisões — o que foi aceito, rejeitado e executado.
     *
     * É a tela que responde "o que eu decidi e no que deu", base da Fase 8.
     */
    @GetMapping("/recommendations/history")
    public ResponseEntity<List<RecommendationDTO>> decisionHistory(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(recommendationRepository.findDecidedByMarket(marketId)
            .stream().map(RecommendationDTO::from).toList());
    }

    /** Marca como vistas as oportunidades que o usuário abriu no feed. */
    @PostMapping("/seen")
    public ResponseEntity<Map<String, Object>> markSeen(
        @PathVariable("marketId") UUID marketId,
        @RequestBody List<UUID> opportunityIds,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        int changed = opportunityEngine.markSeen(marketId, opportunityIds);
        return ResponseEntity.ok(Map.of("marcadas", changed));
    }

    /** Descarta uma oportunidade — o usuário avaliou e não considera relevante. */
    @PostMapping("/{opportunityId}/dismiss")
    public ResponseEntity<OpportunityDTO> dismiss(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("opportunityId") UUID opportunityId,
        @RequestBody(required = false) Map<String, String> body,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        String reason = body != null ? body.get("reason") : null;
        Opportunity o = opportunityEngine.changeStatus(
            marketId, opportunityId, Opportunity.Status.DESCARTADA,
            authentication.getName(), reason);
        return ResponseEntity.ok(OpportunityDTO.from(o));
    }

    /** Registra a decisão sobre uma recomendação (aceitar, rejeitar, executar). */
    @PostMapping("/recommendations/{recommendationId}/decide")
    public ResponseEntity<RecommendationDTO> decide(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("recommendationId") UUID recommendationId,
        @RequestBody Map<String, String> body,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        String decisionRaw = body.getOrDefault("decision", "");
        Recommendation.Status decision;
        try {
            decision = Recommendation.Status.valueOf(decisionRaw.toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
        if (decision == Recommendation.Status.PROPOSTA) {
            // PROPOSTA é o estado inicial, não uma decisão que se possa tomar.
            return ResponseEntity.badRequest().build();
        }

        Recommendation r = recommendationEngine.decide(
            marketId, recommendationId, decision, authentication.getName(), body.get("note"));
        return ResponseEntity.ok(RecommendationDTO.from(r));
    }

    /**
     * Roda a detecção agora, sem esperar o job das 03:30.
     *
     * Operação cara (percorre todos os detectores); serve para o lojista que
     * acabou de corrigir um cadastro e quer ver o feed atualizado.
     */
    @PostMapping("/detect")
    public ResponseEntity<Map<String, Object>> detectNow(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        OpportunityEngine.DetectionResult result = opportunityEngine.detectForMarket(marketId);
        int recs = recommendationEngine.generateForMarket(marketId);

        return ResponseEntity.ok(Map.of(
            "detectadas", result.detected(),
            "novas", result.created(),
            "atualizadas", result.updated(),
            "concluidas", result.closed(),
            "expiradas", result.expired(),
            "recomendacoesGeradas", recs,
            "duracaoMs", result.durationMillis()
        ));
    }

    /**
     * Resultado das decisões: o que foi aceito e no que deu.
     *
     * É a tela que fecha o ciclo — sem ela, o usuário decide no escuro para
     * sempre e o sistema nunca ganha crédito pelos acertos.
     */
    @GetMapping("/outcomes")
    public ResponseEntity<Map<String, Object>> outcomes(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        List<OutcomeDTO> measured = outcomeRepository.findMeasuredByMarket(marketId)
            .stream().map(OutcomeDTO::from).toList();

        // Taxa de acerto por tipo de ação: se COMPRAR acerta 80% e PROMOVER
        // 30%, o score de promoção está otimista e precisa de calibração.
        Map<String, Map<String, Long>> byAction = new LinkedHashMap<>();
        for (Object[] row : outcomeRepository.summarizeByActionAndVerdict(marketId)) {
            String action = row[0] != null ? row[0].toString() : "OUTRO";
            String verdict = row[1] != null ? row[1].toString() : "SEM_DADOS";
            byAction.computeIfAbsent(action, k -> new LinkedHashMap<>())
                .put(verdict, ((Number) row[2]).longValue());
        }

        /*
         * O Essencial vê o RESUMO — taxa de acerto por tipo de ação e acurácia
         * da previsão, que é o que responde "o sistema está me ajudando?". O
         * histórico decisão a decisão fica no Profissional.
         *
         * O corte é por natureza do dado, não por castigo: o histórico completo
         * só rende com meses de decisões acumuladas, e quem tem isso é o
         * cliente maduro — não quem assinou semana passada.
         */
        boolean fullHistory = planService.canSeeFullOutcomes(planService.limitsFor(marketId));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resultados", fullHistory ? measured : List.of());
        body.put("porTipoDeAcao", byAction);
        body.put("acuraciaPrevisao", forecastAccuracyService.summarize(marketId));
        body.put("historicoCompleto", fullHistory);
        if (!fullHistory) {
            body.put("decisoesMedidas", measured.size());
            body.put("mensagemUpgrade", "O histórico decisão a decisão, com o previsto "
                + "contra o realizado de cada uma, faz parte do plano Profissional.");
        }
        return ResponseEntity.ok(body);
    }

    /** Produtos em que a previsão de demanda mais erra. */
    @GetMapping("/outcomes/forecast-accuracy")
    public ResponseEntity<Map<String, Object>> forecastAccuracy(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(Map.of(
            "resumo", forecastAccuracyService.summarize(marketId),
            "pioresProdutos", forecastAccuracyService.worstProducts(marketId, limit)
        ));
    }

    // ── DTOs ─────────────────────────────────────────────────────────────────

    public record OutcomeDTO(
        UUID id, UUID recommendationId, String recommendationTitle,
        String actionType, String verdict,
        UUID productId, String productName,
        BigDecimal predictedValue, BigDecimal actualValue,
        BigDecimal deltaValue, BigDecimal deltaPercent,
        int horizonDays, LocalDateTime measuredAt, String notes
    ) {
        static OutcomeDTO from(com.pdv2cloud.model.entity.RecommendationOutcome o) {
            return new OutcomeDTO(
                o.getId(),
                o.getRecommendation().getId(),
                o.getRecommendation().getTitle(),
                o.getActionType(),
                o.getVerdict() != null ? o.getVerdict().name() : null,
                o.getProduct() != null ? o.getProduct().getId() : null,
                o.getProduct() != null ? o.getProduct().getName() : null,
                o.getPredictedValue(), o.getActualValue(),
                o.getDeltaValue(), o.getDeltaPercent(),
                o.getHorizonDays() != null ? o.getHorizonDays() : 30,
                o.getMeasuredAt(), o.getNotes()
            );
        }
    }

    public record OpportunityDTO(
        UUID id, String type, String source, String status,
        String title, String description,
        UUID productId, String productName, String productImage,
        Map<String, Object> evidence,
        BigDecimal expectedImpactValue, BigDecimal confidence, BigDecimal priorityScore,
        int detectionCount, LocalDateTime firstDetectedAt, LocalDateTime lastDetectedAt,
        LocalDateTime expiresAt,
        /** Texto escrito pela IA do cliente; null quando não há (a UI usa description). */
        String aiInsight
    ) {
        static OpportunityDTO from(Opportunity o) {
            return from(o, null);
        }

        static OpportunityDTO from(Opportunity o, String aiInsight) {
            return new OpportunityDTO(
                o.getId(), o.getType(), o.getSource(), o.getStatus().name(),
                o.getTitle(), o.getDescription(),
                o.getProduct() != null ? o.getProduct().getId() : null,
                o.getProduct() != null ? o.getProduct().getName() : null,
                o.getProduct() != null ? o.getProduct().getImageUrl() : null,
                o.getEvidence(),
                o.getExpectedImpactValue(), o.getConfidence(), o.getPriorityScore(),
                o.getDetectionCount() != null ? o.getDetectionCount() : 1,
                o.getFirstDetectedAt(), o.getLastDetectedAt(), o.getExpiresAt(),
                aiInsight
            );
        }
    }

    public record RecommendationDTO(
        UUID id, UUID opportunityId, String actionType, String status,
        String title, String rationale, String calculationTrace,
        Map<String, Object> parameters, Map<String, Object> evidence,
        BigDecimal confidence, BigDecimal expectedImpactValue,
        UUID productId, String productName, String productImage,
        String decidedBy, LocalDateTime decidedAt, String decisionNote,
        LocalDateTime createdAt
    ) {
        static RecommendationDTO from(Recommendation r) {
            Opportunity o = r.getOpportunity();
            return new RecommendationDTO(
                r.getId(), o.getId(), r.getActionType().name(), r.getStatus().name(),
                r.getTitle(), r.getRationale(), r.getCalculationTrace(),
                r.getParameters(), r.getEvidence(),
                r.getConfidence(), r.getExpectedImpactValue(),
                o.getProduct() != null ? o.getProduct().getId() : null,
                o.getProduct() != null ? o.getProduct().getName() : null,
                o.getProduct() != null ? o.getProduct().getImageUrl() : null,
                r.getDecidedBy(), r.getDecidedAt(), r.getDecisionNote(),
                r.getCreatedAt()
            );
        }
    }
}
