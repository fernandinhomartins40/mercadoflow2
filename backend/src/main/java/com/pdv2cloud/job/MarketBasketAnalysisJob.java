package com.pdv2cloud.job;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.MarketBasketRule;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketBasketRuleRepository;
import com.pdv2cloud.service.MarketBasketService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class MarketBasketAnalysisJob {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private MarketBasketService marketBasketService;

    @Autowired
    private MarketBasketRuleRepository marketBasketRuleRepository;

    @Scheduled(cron = "0 30 2 * * ?")
    public void runMarketBasket() {
        log.info("Starting market basket analysis");
        List<Market> markets = marketRepository.findAllActive();
        LocalDateTime computedAt = LocalDateTime.now();
        for (Market market : markets) {
            // Corte por lift e contagem, não por suporte de 1% + confiança de 50%:
            // num supermercado com milhares de itens quase nenhum par passa
            // naquele corte (auditoria 06/10/2026: 6 de 3.299 pares no Super
            // Novo, enquanto 1.896 saíam juntos o dobro do acaso).
            List<MarketBasketDTO> rules = marketBasketService.analyzeMarketBasket(market.getId(), 0.0, 0.0).stream()
                .filter(r -> r.getLift() >= 1.5 && r.getPairCount() >= 5)
                .toList();
            persist(market, rules, computedAt);
        }
        log.info("Market basket analysis completed");
    }

    private void persist(Market market, List<MarketBasketDTO> rules, LocalDateTime computedAt) {
        // Keep a rolling window.
        marketBasketRuleRepository.deleteOlderThan(market.getId(), computedAt.minusDays(30));

        List<MarketBasketRule> entities = rules.stream()
            .limit(200)
            .map(dto -> {
                MarketBasketRule r = new MarketBasketRule();
                r.setMarket(market);
                r.setComputedAt(computedAt);
                r.setAntecedent(join(dto.getAntecedent()));
                r.setConsequent(join(dto.getConsequent()));
                r.setSupport(BigDecimal.valueOf(dto.getSupport()));
                r.setConfidence(BigDecimal.valueOf(dto.getConfidence()));
                r.setLift(BigDecimal.valueOf(dto.getLift()));
                r.setLeverage(BigDecimal.valueOf(dto.getLeverage()));
                r.setPairCount(dto.getPairCount());
                return r;
            })
            .toList();

        if (!entities.isEmpty()) {
            marketBasketRuleRepository.saveAll(entities);
        }
    }

    private String join(List<java.util.UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return "";
        }
        return ids.stream().map(java.util.UUID::toString).collect(java.util.stream.Collectors.joining(","));
    }
}
