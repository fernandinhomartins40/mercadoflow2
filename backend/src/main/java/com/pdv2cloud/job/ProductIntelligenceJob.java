package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.service.intelligence.ProductIntelligenceMaterializer;
import com.pdv2cloud.service.intelligence.ProductIntelligenceMaterializer.MaterializationResult;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Materializa a inteligência de produto (capital, estoque estimado e
 * sazonalidade) nas tabelas da V31.
 *
 * Roda às 03:00 — depois da agregação diária (02:00) e da análise de cesta
 * (02:30), das quais depende indiretamente, e antes da previsão de demanda
 * (04:00).
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class ProductIntelligenceJob {

    private final ProductIntelligenceMaterializer materializer;

    public ProductIntelligenceJob(ProductIntelligenceMaterializer materializer) {
        this.materializer = materializer;
    }

    /**
     * O job percorre todos os mercados e roda sem usuário autenticado. Sob RLS
     * efetiva, sem escopo de sistema ele não enxergaria mercado nenhum e
     * "concluiria" sem gravar nada — falha silenciosa que só apareceria como
     * telas vazias no dia seguinte.
     *
     * O runAsSystem envolve CADA chamada transacional, e não o laço inteiro:
     * as variáveis de tenant são fixadas no checkout da conexão, que o
     * @Transactional faz antes de o corpo executar. Um mercado que falha não
     * derruba os demais — a materialização de cada loja é independente.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void materializeProductIntelligence() {
        List<Market> markets = TenantContext.runAsSystem(materializer::activeMarkets);
        log.info("Materializacao da inteligencia de produto iniciada para {} mercado(s)", markets.size());

        int ok = 0;
        int failed = 0;
        long totalRows = 0;

        for (Market market : markets) {
            try {
                MaterializationResult result = TenantContext.runAsSystem(
                    () -> materializer.materializeMarket(market.getId()));

                totalRows += result.capitalMetrics() + result.inventoryEstimates()
                    + result.seasonalityRows() + result.haloEffects()
                    + result.customerProfiles() + result.repurchaseRows();
                ok++;
                log.debug(
                    "Mercado {}: {} metricas de capital, {} estimativas de estoque, "
                        + "{} linhas de sazonalidade, {} efeitos halo, {} perfis de cliente, "
                        + "{} produtos com recompra em {} ms",
                    market.getId(), result.capitalMetrics(), result.inventoryEstimates(),
                    result.seasonalityRows(), result.haloEffects(),
                    result.customerProfiles(), result.repurchaseRows(), result.durationMillis());
            } catch (Exception e) {
                failed++;
                log.error("Falha ao materializar inteligencia do mercado {}", market.getId(), e);
            }
        }

        log.info("Materializacao concluida: {} mercado(s) com sucesso, {} com falha, {} linhas gravadas",
            ok, failed, totalRows);
    }
}
