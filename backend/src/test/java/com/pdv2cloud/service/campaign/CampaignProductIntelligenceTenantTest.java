package com.pdv2cloud.service.campaign;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.CampaignProductRepository;
import com.pdv2cloud.repository.CampaignRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** SEG-04: a análise de campanha não serve campanha de outro mercado. */
class CampaignProductIntelligenceTenantTest {

    @Test
    void campanhaDeOutroMercadoNaoEAnalisada() {
        CampaignRepository campaigns = mock(CampaignRepository.class);
        CampaignProductRepository products = mock(CampaignProductRepository.class);
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        CampaignProductIntelligenceService service = new CampaignProductIntelligenceService(campaigns, products, jdbc);

        Market other = new Market();
        other.setId(UUID.randomUUID());
        Campaign campaign = new Campaign();
        campaign.setId(UUID.randomUUID());
        campaign.setMarket(other);
        campaign.setStartDate(LocalDateTime.now().minusDays(10));
        campaign.setEndDate(LocalDateTime.now().minusDays(3));
        when(campaigns.findById(campaign.getId())).thenReturn(Optional.of(campaign));

        assertNull(service.analyze(UUID.randomUUID(), campaign.getId()));
        verify(products, never()).findByCampaignId(any());
    }
}
