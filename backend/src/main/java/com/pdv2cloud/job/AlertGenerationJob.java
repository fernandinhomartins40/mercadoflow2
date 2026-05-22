package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.AlertService;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class AlertGenerationJob {

    @Autowired private AlertService alertService;
    @Autowired private MarketRepository marketRepository;

    @Scheduled(fixedRate = 3600000)
    public void generateAlerts() {
        log.info("Starting alert generation");
        List<Market> markets = marketRepository.findAllActive();

        for (Market market : markets) {
            UUID id = market.getId();
            try { alertService.checkZeroSales(id); }        catch (Exception e) { log.warn("checkZeroSales failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkLowStock(id); }         catch (Exception e) { log.warn("checkLowStock failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkSlowMoving(id); }       catch (Exception e) { log.warn("checkSlowMoving failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkHealthCritical(id); }   catch (Exception e) { log.warn("checkHealthCritical failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkMomentumReversal(id); } catch (Exception e) { log.warn("checkMomentumReversal failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkPromotionOpportunities(id); } catch (Exception e) { log.warn("checkPromotionOpportunities failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkHighPerformers(id); }   catch (Exception e) { log.warn("checkHighPerformers failed for {}: {}", id, e.getMessage()); }
            try { alertService.checkBasketOpportunities(id); } catch (Exception e) { log.warn("checkBasketOpportunities failed for {}: {}", id, e.getMessage()); }
        }

        log.info("Alert generation completed for {} markets", markets.size());
    }
}
