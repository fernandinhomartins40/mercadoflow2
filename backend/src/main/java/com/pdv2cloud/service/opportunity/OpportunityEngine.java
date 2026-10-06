package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.service.opportunity.OpportunityDetector.DetectedOpportunity;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    /**
     * Sem mudança nos números, a linha só é tocada uma vez por este intervalo,
     * para manter {@code last_detected_at} longe do corte de {@link #STALE_HOURS}.
     *
     * Antes cada rodada (a cada 5 minutos, pelo ciclo adaptativo) regravava
     * todas as oportunidades abertas: em produção eram 17 mil UPDATEs por linha
     * e a tabela de 2 MB de dados ocupava 1,6 GB.
     */
    private static final int HEARTBEAT_HOURS = 1;

    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() { };

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

        // Uma consulta só: buscar por fingerprint dentro do laço forçava um flush
        // a cada volta, e cada flush regravava tudo o que já estava carregado.
        Map<String, Opportunity> known = new HashMap<>();
        for (Opportunity o : opportunityRepository.findAllByMarket(marketId)) {
            known.put(o.getFingerprint(), o);
        }

        for (DetectedOpportunity d : detected) {
            Opportunity existing = known.get(d.fingerprint());
            if (existing != null) {
                if (refresh(existing, d, now)) {
                    updated++;
                }
            } else {
                Opportunity o = build(market, d, now);
                opportunityRepository.save(o);
                known.put(d.fingerprint(), o);
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
        o.setEvidence(normalize(d.evidence()));
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
     * Atualiza os números de uma oportunidade já conhecida, só quando algo
     * mudou ou quando o último registro de detecção passou de uma hora.
     *
     * @return true se a linha foi de fato tocada
     */
    private boolean refresh(Opportunity o, DetectedOpportunity d, LocalDateTime now) {
        // Decisão do usuário prevalece sobre redetecção: o que ele descartou
        // fica descartado, e o que ele concluiu não reabre sozinho.
        if (o.getStatus() == Opportunity.Status.DESCARTADA) {
            return false;
        }
        if (o.getStatus() == Opportunity.Status.CONCLUIDA) {
            if (!closedBySystem(o)) {
                return false;
            }
            // Encerrada pelo sistema (sumiu da detecção, ou correção de dados) e
            // detectada de novo: a situação voltou, então reabre.
            o.setStatus(Opportunity.Status.NOVA);
            o.setStatusChangedAt(now);
            o.setStatusChangedBy(null);
            o.setTitle(truncate(d.title(), 300));
            o.setDescription(d.description());
            o.setEvidence(normalize(d.evidence()));
            o.setExpectedImpactValue(d.expectedImpactValue());
            o.setConfidence(d.confidence());
            o.setPriorityScore(d.priorityScore());
            o.setExpiresAt(d.expiresAt());
            o.setLastDetectedAt(now);
            o.setDetectionCount(o.getDetectionCount() + 1);
            return true;
        }

        String title = truncate(d.title(), 300);
        Map<String, Object> evidence = normalize(d.evidence());
        boolean changed = !Objects.equals(o.getTitle(), title)
            || !Objects.equals(o.getDescription(), d.description())
            || !Objects.equals(o.getEvidence(), evidence)
            || !sameNumber(o.getExpectedImpactValue(), d.expectedImpactValue())
            || !sameNumber(o.getConfidence(), d.confidence())
            || !sameNumber(o.getPriorityScore(), d.priorityScore())
            || !Objects.equals(o.getExpiresAt(), d.expiresAt());
        boolean heartbeatDue = o.getLastDetectedAt() == null
            || o.getLastDetectedAt().isBefore(now.minusHours(HEARTBEAT_HOURS));
        if (!changed && !heartbeatDue) {
            return false;
        }

        if (changed) {
            o.setTitle(title);
            o.setDescription(d.description());
            o.setEvidence(evidence);
            o.setExpectedImpactValue(d.expectedImpactValue());
            o.setConfidence(d.confidence());
            o.setPriorityScore(d.priorityScore());
            o.setExpiresAt(d.expiresAt());
        }
        o.setLastDetectedAt(now);
        o.setDetectionCount(o.getDetectionCount() + 1);
        return true;
    }

    /**
     * Encerrada sem decisão de alguém: por não ter sido redetectada (closeStale
     * não grava autor) ou pelas correções de dados de 06/10/2026.
     */
    static boolean closedBySystem(Opportunity o) {
        String by = o.getStatusChangedBy();
        return by == null || by.startsWith("auditoria ") || by.startsWith("correcao ");
    }

    /**
     * Passa a evidência pelo mesmo caminho JSON que o Hibernate usa para o
     * retrato da linha. Sem isso um BigDecimal virava Double no retrato, a
     * comparação nunca batia e a linha parecia alterada a cada flush.
     */
    static Map<String, Object> normalize(Map<String, Object> evidence) {
        if (evidence == null) {
            return null;
        }
        try {
            return JSON.readValue(JSON.writeValueAsString(evidence), MAP);
        } catch (Exception e) {
            return evidence;
        }
    }

    private static boolean sameNumber(Object a, Object b) {
        if (a instanceof BigDecimal x && b instanceof BigDecimal y) {
            return x.compareTo(y) == 0;
        }
        if (a instanceof Number x && b instanceof Number y) {
            return Double.compare(x.doubleValue(), y.doubleValue()) == 0;
        }
        return Objects.equals(a, b);
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
