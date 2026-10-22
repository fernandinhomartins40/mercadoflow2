package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * REC-07 (resto): o histórico de decisões e as ações por id de recomendação
 * (decide, order, undo) usam {@link PlanService#canSeeRecommendation}, que
 * segue o tipo da oportunidade de origem.
 */
class RecommendationPlanFilterTest {

    private final PlanService plans = new PlanService(mock(MarketRepository.class), mock(MarketUsageCounterRepository.class),
        mock(PDVRepository.class), mock(UserRepository.class), mock(PlanCatalogService.class), mock(ProductEventService.class));

    private static PlanService.EffectiveLimits limits(boolean full) {
        return new PlanService.EffectiveLimits(full ? PlanType.PROFISSIONAL : PlanType.FREE, 1_000, 1, 1, 1, 2, 90, full, UUID.randomUUID());
    }

    private static Recommendation rec(String type) {
        Recommendation r = new Recommendation();
        if (type != null) {
            Opportunity o = new Opportunity();
            o.setType(type);
            r.setOpportunity(o);
        }
        return r;
    }

    @Test
    void gratuitoNaoVeRecomendacaoDeTipoPago() {
        assertFalse(plans.canSeeRecommendation(limits(false), rec("PRODUTO_TRACIONADOR")));
        assertFalse(plans.canSeeRecommendation(limits(false), rec("OPORTUNIDADE_DE_COMBO")));
    }

    @Test
    void gratuitoVeRecomendacaoDeTipoLivre() {
        assertTrue(plans.canSeeRecommendation(limits(false), rec("OPORTUNIDADE_DE_COMPRA")));
        assertTrue(plans.canSeeRecommendation(limits(false), rec(null)));
    }

    @Test
    void pagoVeTudo() {
        assertTrue(plans.canSeeRecommendation(limits(true), rec("PRODUTO_TRACIONADOR")));
    }
}
