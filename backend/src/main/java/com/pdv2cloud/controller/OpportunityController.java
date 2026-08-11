package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.opportunity.OpportunityEngine;
import com.pdv2cloud.service.opportunity.RecommendationEngine;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
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
@RestController
@RequestMapping("/api/v1/markets/{marketId}/opportunities")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class OpportunityController {

    private final OpportunityEngine opportunityEngine;
    private final RecommendationEngine recommendationEngine;
    private final OpportunityRepository opportunityRepository;
    private final RecommendationRepository recommendationRepository;
    private final MarketAccessService marketAccessService;

    public OpportunityController(
        OpportunityEngine opportunityEngine,
        RecommendationEngine recommendationEngine,
        OpportunityRepository opportunityRepository,
        RecommendationRepository recommendationRepository,
        MarketAccessService marketAccessService
    ) {
        this.opportunityEngine = opportunityEngine;
        this.recommendationEngine = recommendationEngine;
        this.opportunityRepository = opportunityRepository;
        this.recommendationRepository = recommendationRepository;
        this.marketAccessService = marketAccessService;
    }

    /** Oportunidades abertas, mais relevantes primeiro. */
    @GetMapping
    public ResponseEntity<List<OpportunityDTO>> list(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "all", defaultValue = "false") boolean all,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        List<Opportunity> rows = all
            ? opportunityRepository.findAllByMarket(marketId)
            : opportunityRepository.findOpenByMarket(marketId);
        return ResponseEntity.ok(rows.stream().map(OpportunityDTO::from).toList());
    }

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

    // ── DTOs ─────────────────────────────────────────────────────────────────

    public record OpportunityDTO(
        UUID id, String type, String source, String status,
        String title, String description,
        UUID productId, String productName, String productImage,
        Map<String, Object> evidence,
        BigDecimal expectedImpactValue, BigDecimal confidence, BigDecimal priorityScore,
        int detectionCount, LocalDateTime firstDetectedAt, LocalDateTime lastDetectedAt,
        LocalDateTime expiresAt
    ) {
        static OpportunityDTO from(Opportunity o) {
            return new OpportunityDTO(
                o.getId(), o.getType(), o.getSource(), o.getStatus().name(),
                o.getTitle(), o.getDescription(),
                o.getProduct() != null ? o.getProduct().getId() : null,
                o.getProduct() != null ? o.getProduct().getName() : null,
                o.getProduct() != null ? o.getProduct().getImageUrl() : null,
                o.getEvidence(),
                o.getExpectedImpactValue(), o.getConfidence(), o.getPriorityScore(),
                o.getDetectionCount() != null ? o.getDetectionCount() : 1,
                o.getFirstDetectedAt(), o.getLastDetectedAt(), o.getExpiresAt()
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
