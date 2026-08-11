package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.service.opportunity.OpportunityDetector.DetectedOpportunity;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Motor de oportunidades: roda os detectores e mantém o ciclo de vida.
 *
 * O que este motor resolve, e que a Central v0 não resolvia: **memória**. Antes,
 * o feed era recalculado a cada request, então uma oportunidade que o usuário já
 * tinha visto e descartado reaparecia idêntica no dia seguinte. Agora cada
 * situação tem identidade estável (fingerprint), histórico de detecção e um
 * status que o usuário controla.
 *
 * Três regras de convivência entre detecção automática e decisão humana:
 *
 *  1. O que o usuário DESCARTOU não ressuscita. Se ele disse que não importa,
 *     redetectar e reabrir seria discutir com o dono da loja.
 *  2. O que deixou de ser detectado é CONCLUÍDO. A situação sumiu — o produto
 *     voltou a vender, o estoque normalizou —, então a pendência acabou.
 *  3. O que continua sendo detectado tem `detection_count` incrementado. Uma
 *     oportunidade que persiste há três semanas diz mais que uma de ontem.
 */
@Service
@Slf4j
public class OpportunityEngine {

    /**
     * Sem redetecção por este tempo, a oportunidade é dada por resolvida.
     *
     * Folga de mais de um dia porque o motor roda uma vez ao dia: com 24h
     * exatas, um atraso de minutos no job fecharia tudo indevidamente.
     */
    private static final int STALE_HOURS = 36;

    private final List<OpportunityDetector> detectors;
    private final OpportunityRepository opportunityRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;

    /**
     * O Spring injeta TODOS os beans que implementam OpportunityDetector — é o
     * que torna o motor extensível sem edição: basta anotar um detector novo
     * com @Component.
     */
    public OpportunityEngine(
        List<OpportunityDetector> detectors,
        OpportunityRepository opportunityRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository
    ) {
        this.detectors = detectors;
        this.opportunityRepository = opportunityRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
    }

    public record DetectionResult(
        UUID marketId,
        int detected,
        int created,
        int updated,
        int closed,
        int expired,
        long durationMillis
    ) {}

    /**
     * Roda todos os detectores para um mercado e reconcilia com o que já existe.
     *
     * Um detector que falha não derruba os demais: perder o capital porque a
     * inteligência de promoção quebrou deixaria o lojista sem o feed inteiro.
     */
    @Transactional
    public DetectionResult detectForMarket(UUID marketId) {
        long startedAt = System.currentTimeMillis();
        LocalDateTime now = LocalDateTime.now();

        List<DetectedOpportunity> detected = new ArrayList<>();
        for (OpportunityDetector detector : detectors) {
            try {
                List<DetectedOpportunity> found = detector.detect(marketId);
                if (found != null) {
                    detected.addAll(found);
                }
            } catch (Exception e) {
                log.error("Detector '{}' falhou no mercado {}", detector.name(), marketId, e);
            }
        }

        Market market = marketRepository.getReferenceById(marketId);
        int created = 0;
        int updated = 0;

        for (DetectedOpportunity d : detected) {
            Optional<Opportunity> existing =
                opportunityRepository.findByMarketIdAndFingerprint(marketId, d.fingerprint());

            if (existing.isPresent()) {
                if (refresh(existing.get(), d, now)) {
                    updated++;
                }
            } else {
                opportunityRepository.save(build(market, d, now));
                created++;
            }
        }

        // Reconciliação: fecha o que sumiu e expira o que venceu.
        int expired = opportunityRepository.expireOverdue(marketId, now);
        int closed = opportunityRepository.closeStale(
            marketId, now.minusHours(STALE_HOURS), now);

        return new DetectionResult(
            marketId, detected.size(), created, updated, closed, expired,
            System.currentTimeMillis() - startedAt);
    }

    private Opportunity build(Market market, DetectedOpportunity d, LocalDateTime now) {
        Opportunity o = new Opportunity();
        o.setMarket(market);
        o.setFingerprint(d.fingerprint());
        o.setType(d.type());
        o.setSource(d.source());
        o.setProduct(resolveProduct(d.productId()));
        o.setCategory(d.category());
        o.setTitle(truncate(d.title(), 300));
        o.setDescription(d.description());
        o.setEvidence(d.evidence());
        o.setExpectedImpactValue(d.expectedImpactValue());
        o.setConfidence(d.confidence());
        o.setPriorityScore(d.priorityScore());
        o.setExpiresAt(d.expiresAt());
        o.setFirstDetectedAt(now);
        o.setLastDetectedAt(now);
        o.setDetectionCount(1);
        o.setCreatedAt(now);
        return o;
    }

    /**
     * Atualiza os números de uma oportunidade já conhecida.
     *
     * @return true se a linha foi de fato tocada
     */
    private boolean refresh(Opportunity o, DetectedOpportunity d, LocalDateTime now) {
        // Decisão do usuário prevalece sobre redetecção: o que ele descartou
        // fica descartado, e o que ele concluiu não reabre sozinho.
        if (o.getStatus() == Opportunity.Status.DESCARTADA
            || o.getStatus() == Opportunity.Status.CONCLUIDA) {
            return false;
        }

        o.setTitle(truncate(d.title(), 300));
        o.setDescription(d.description());
        o.setEvidence(d.evidence());
        o.setExpectedImpactValue(d.expectedImpactValue());
        o.setConfidence(d.confidence());
        o.setPriorityScore(d.priorityScore());
        o.setExpiresAt(d.expiresAt());
        o.setLastDetectedAt(now);
        o.setDetectionCount(o.getDetectionCount() + 1);
        opportunityRepository.save(o);
        return true;
    }

    private Product resolveProduct(UUID productId) {
        return productId != null ? productRepository.findById(productId).orElse(null) : null;
    }

    private String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max - 3) + "...";
    }

    // ── Ciclo de vida controlado pelo usuário ────────────────────────────────

    /**
     * Marca como visto o que o usuário abriu.
     *
     * Só NOVA vira VISTA: uma oportunidade EM_ACAO não regride por alguém ter
     * aberto o feed de novo.
     */
    @Transactional
    public int markSeen(UUID marketId, List<UUID> opportunityIds) {
        int changed = 0;
        for (UUID id : opportunityIds) {
            Optional<Opportunity> found = opportunityRepository.findByIdAndMarketId(id, marketId);
            if (found.isPresent() && found.get().getStatus() == Opportunity.Status.NOVA) {
                Opportunity o = found.get();
                o.setStatus(Opportunity.Status.VISTA);
                o.setStatusChangedAt(LocalDateTime.now());
                opportunityRepository.save(o);
                changed++;
            }
        }
        return changed;
    }

    /** Transição explícita de status, disparada pelo usuário. */
    @Transactional
    public Opportunity changeStatus(
        UUID marketId, UUID opportunityId,
        Opportunity.Status newStatus, String actor, String reason
    ) {
        Opportunity o = opportunityRepository.findByIdAndMarketId(opportunityId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Oportunidade nao encontrada"));

        o.setStatus(newStatus);
        o.setStatusChangedAt(LocalDateTime.now());
        o.setStatusChangedBy(actor);
        if (newStatus == Opportunity.Status.DESCARTADA) {
            o.setDismissReason(reason);
        }
        return opportunityRepository.save(o);
    }
}
