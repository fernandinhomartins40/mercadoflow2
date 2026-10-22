package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanPriceHistory;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.PlanPriceHistoryRepository;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reajuste de preço dos planos pelo painel super admin.
 *
 * O catálogo é a fonte do preço: o Asaas cobra o valor do catálogo na próxima
 * contratação. Quem já assina continua no valor contratado. Cada reajuste fica
 * no histórico, para saber qual preço vigorava em cada data.
 */
@Service
@Slf4j
public class PlanPriceService {

    private final PlanCatalogService planCatalogService;
    private final PlanPriceHistoryRepository priceHistoryRepository;

    public PlanPriceService(PlanCatalogService planCatalogService, PlanPriceHistoryRepository priceHistoryRepository) {
        this.planCatalogService = planCatalogService;
        this.priceHistoryRepository = priceHistoryRepository;
    }

    @Transactional
    public PriceChangeResult changePlanPrice(String planCode, int newPriceCents, String reason, String actorEmail) {
        PlanType plan = PlanType.fromString(planCode);
        PlanCatalogEntry entry = planCatalogService.entryFor(plan);

        Integer oldPrice = entry.getMonthlyPriceCents();
        if (oldPrice != null && oldPrice == newPriceCents) {
            return new PriceChangeResult(planCode, oldPrice, newPriceCents, "Preço já era esse — nada a fazer.");
        }

        entry.setMonthlyPriceCents(newPriceCents);
        entry.setPriceChangedAt(LocalDateTime.now());
        planCatalogService.save(entry);

        PlanPriceHistory history = new PlanPriceHistory();
        history.setPlanCode(planCode);
        history.setFromPriceCents(oldPrice);
        history.setToPriceCents(newPriceCents);
        history.setMigratedCount(0);
        history.setReason(reason);
        history.setActorEmail(actorEmail);
        priceHistoryRepository.save(history);

        log.info("Preço do plano alterado | plano={} | de={} | para={} | por={}", planCode, oldPrice, newPriceCents, actorEmail);
        return new PriceChangeResult(planCode, oldPrice, newPriceCents, null);
    }

    public record PriceChangeResult(String planCode, Integer fromPriceCents, int toPriceCents, String warning) {}
}
