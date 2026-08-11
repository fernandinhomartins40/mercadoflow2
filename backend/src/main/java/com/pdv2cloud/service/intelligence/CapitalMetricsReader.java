package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.ProductCapitalMetric;
import com.pdv2cloud.model.entity.ProductInventoryEstimate;
import com.pdv2cloud.repository.ProductCapitalMetricRepository;
import com.pdv2cloud.repository.ProductInventoryEstimateRepository;
import com.pdv2cloud.service.WorkingCapitalService;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura das métricas de capital, preferindo a versão MATERIALIZADA.
 *
 * Antes desta camada, toda tela que mostrava capital de giro disparava o
 * portfólio inteiro por request. Agora o caminho normal é ler a tabela que o
 * ProductIntelligenceJob gravou de madrugada — uma consulta indexada em vez de
 * duas agregações sobre `invoice_items` mais o processamento em memória.
 *
 * FALLBACK DELIBERADO: se a materialização ainda não rodou (loja nova, primeiro
 * deploy, job desligado por `jobs.enabled=false`), a leitura cai para o cálculo
 * on-line. É a diferença entre "a tela demora" e "a tela está vazia" — e evita
 * que a Fase 2 introduza uma dependência dura de job para o produto funcionar.
 *
 * A conversão de volta para {@link CapitalMetric} mantém o contrato de quem
 * consome: controllers, plano de compra e Central de Inteligência não precisam
 * saber de onde veio o número.
 */
@Service
@Slf4j
public class CapitalMetricsReader {

    private final ProductCapitalMetricRepository repository;
    private final ProductInventoryEstimateRepository inventoryRepository;
    private final WorkingCapitalService workingCapitalService;

    public CapitalMetricsReader(
        ProductCapitalMetricRepository repository,
        ProductInventoryEstimateRepository inventoryRepository,
        WorkingCapitalService workingCapitalService
    ) {
        this.repository = repository;
        this.inventoryRepository = inventoryRepository;
        this.workingCapitalService = workingCapitalService;
    }

    /**
     * Portfólio de capital do mercado, já ordenado por prioridade.
     *
     * @param windowDays janela pedida; quando difere da janela materializada
     *                   (90 dias), o cálculo on-line é usado, porque servir
     *                   outra janela seria responder à pergunta errada
     */
    @Transactional(readOnly = true)
    public List<CapitalMetric> portfolio(UUID marketId, int windowDays) {
        if (windowDays > 0 && windowDays != MATERIALIZED_WINDOW_DAYS) {
            return workingCapitalService.computePortfolio(marketId, windowDays);
        }

        List<ProductCapitalMetric> rows = repository.findByMarketOrderByPriority(marketId);
        if (rows.isEmpty()) {
            log.debug("Sem metricas materializadas para o mercado {}; calculando on-line", marketId);
            return workingCapitalService.computePortfolio(marketId, windowDays);
        }

        /*
         * A confiança e o motivo do estoque teórico vivem em
         * product_inventory_estimates, não em product_capital_metrics. São o que
         * permite à UI dizer "estoque estimado, confiança 0,4" em vez de
         * apresentar um palpite como se fosse inventário — por isso são juntados
         * aqui em vez de virem nulos.
         */
        Map<UUID, ProductInventoryEstimate> estimates = new HashMap<>();
        for (ProductInventoryEstimate e : inventoryRepository.findByMarketId(marketId)) {
            estimates.put(e.getProduct().getId(), e);
        }

        return rows.stream()
            .map(row -> toMetric(row, estimates.get(row.getProduct().getId())))
            .toList();
    }

    /** Janela em que o job materializa — ver ProductIntelligenceMaterializer. */
    private static final int MATERIALIZED_WINDOW_DAYS = 90;

    /**
     * Métrica de capital de um único produto, preferindo o materializado.
     *
     * Diferente do caminho on-line, aqui não é preciso recalcular o portfólio
     * inteiro para responder por um SKU: a classificação ABC relativa já está
     * gravada.
     */
    @Transactional(readOnly = true)
    public CapitalMetric forProduct(UUID marketId, UUID productId, int windowDays) {
        if (productId == null) return null;

        if (windowDays <= 0 || windowDays == MATERIALIZED_WINDOW_DAYS) {
            var materialized = repository.findByMarketIdAndProductId(marketId, productId);
            if (materialized.isPresent()) {
                return toMetric(
                    materialized.get(),
                    inventoryRepository.findByMarketIdAndProductId(marketId, productId).orElse(null));
            }
        }
        return workingCapitalService.computeForProduct(marketId, productId, windowDays);
    }

    private CapitalMetric toMetric(ProductCapitalMetric row, ProductInventoryEstimate estimate) {
        return new CapitalMetric(
            row.getProduct().getId(),
            row.getProduct().getName(),
            row.getProduct().getCategory(),
            row.getProduct().getEan(),
            row.getProduct().getImageUrl(),
            row.getRevenue(),
            row.getQuantitySold(),
            row.getGrossMarginValue(),
            row.getGrossMarginPercent(),
            row.getUnitCost(),
            row.getUnitPrice(),
            row.getCostSource(),
            row.getDailyVelocity(),
            row.getDemandCv(),
            row.getAbcClass(),
            row.getXyzClass(),
            row.getRevenueShare(),
            row.getRevenueCumulativeShare(),
            row.getInventoryUnits(),
            row.getInventoryValue(),
            estimate != null ? estimate.getConfidenceScore() : BigDecimal.ZERO,
            estimate != null ? estimate.getConfidenceReason() : "SEM_COMPRA_REGISTRADA",
            row.getCoverageDays(),
            row.getGmroi(),
            row.getReorderPointUnits(),
            row.getSuggestedOrderUnits(),
            row.getSuggestedOrderValue(),
            row.getMomentumScore(),
            row.getStagnationRisk(),
            row.getCapitalStatus(),
            row.getCapitalReason(),
            row.getPriorityScore(),
            // product_capital_metrics não guarda a data da última venda; a
            // estimativa de estoque guarda, e é a mesma data.
            estimate != null && estimate.getLastSaleAt() != null
                ? estimate.getLastSaleAt().toLocalDate()
                : null
        );
    }
}
