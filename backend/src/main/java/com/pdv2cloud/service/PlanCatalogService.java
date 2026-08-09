package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.PlanCatalogRepository;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogo de planos: preços e limites configuráveis pelo painel.
 *
 * Substitui as constantes do enum {@link PlanType} como fonte de verdade. O
 * enum continua existindo por dois motivos: é o tipo usado em toda a
 * aplicação (mais seguro que string solta) e serve de fallback quando a linha
 * do catálogo não existir — assim uma tabela vazia nunca deixa o sistema sem
 * limites, o que liberaria acesso ilimitado por acidente.
 *
 * Os valores são cacheados porque {@code limitsFor} roda no caminho quente da
 * ingestão de notas; o cache é invalidado a cada escrita do painel.
 */
@Service
@Slf4j
public class PlanCatalogService {

    private final PlanCatalogRepository catalogRepository;

    /** Cache por código de plano. Invalidado ao salvar qualquer alteração. */
    private final ConcurrentHashMap<String, PlanCatalogEntry> cache = new ConcurrentHashMap<>();

    public PlanCatalogService(PlanCatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    @Transactional(readOnly = true)
    public List<PlanCatalogEntry> listAll() {
        return catalogRepository.findAllByOrderByDisplayOrderAsc();
    }

    @Transactional(readOnly = true)
    public List<PlanCatalogEntry> listActive() {
        return catalogRepository.findByIsActiveTrueOrderByDisplayOrderAsc();
    }

    /**
     * Entrada do catálogo para o plano, ou uma derivada do enum quando a linha
     * não existe (base recém-migrada, ou plano removido do catálogo por engano).
     */
    @Transactional(readOnly = true)
    public PlanCatalogEntry entryFor(PlanType plan) {
        PlanCatalogEntry cached = cache.get(plan.name());
        if (cached != null) {
            return cached;
        }

        PlanCatalogEntry entry = catalogRepository.findById(plan.name())
            .orElseGet(() -> fallbackFrom(plan));
        cache.put(plan.name(), entry);
        return entry;
    }

    @Transactional(readOnly = true)
    public Optional<PlanCatalogEntry> findByStripePriceId(String stripePriceId) {
        if (stripePriceId == null || stripePriceId.isBlank()) {
            return Optional.empty();
        }
        return catalogRepository.findByStripePriceId(stripePriceId);
    }

    @Transactional
    public PlanCatalogEntry save(PlanCatalogEntry entry) {
        PlanCatalogEntry saved = catalogRepository.save(entry);
        invalidate();
        return saved;
    }

    /** Limpa o cache. Chamado após qualquer escrita vinda do painel. */
    public void invalidate() {
        cache.clear();
    }

    /**
     * Cópia em memória dos valores do enum.
     *
     * Não é persistida de propósito: se a linha sumiu do catálogo, gravá-la de
     * volta silenciosamente esconderia o problema real.
     */
    private PlanCatalogEntry fallbackFrom(PlanType plan) {
        log.warn("Plano {} ausente do catálogo — usando os limites padrão do código", plan);

        PlanCatalogEntry entry = new PlanCatalogEntry();
        entry.setCode(plan.name());
        entry.setDisplayName(plan.getDisplayName());
        entry.setMonthlyPriceCents(plan.getMonthlyPriceCents());
        entry.setMonthlyInvoiceLimit(plan.getMonthlyInvoiceLimit());
        entry.setBranchLimit(plan.getBranchLimit());
        entry.setPdvPerBranchLimit(plan.getPdvPerBranchLimit());
        entry.setPdvLimit(plan.getPdvLimit());
        entry.setUserSeatLimit(plan.getUserSeatLimit());
        entry.setHistoryRetentionDays(plan.getHistoryRetentionDays());
        entry.setFullInsights(plan.hasFullInsights());
        entry.setPurchasable(plan != PlanType.FREE);
        entry.setIsActive(true);
        return entry;
    }
}
