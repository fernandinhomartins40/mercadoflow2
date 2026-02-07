package com.pdv2cloud.controller;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.model.dto.CampaignCreateRequest;
import com.pdv2cloud.model.dto.CampaignResponse;
import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.CampaignRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.util.DateUtils;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/markets/{marketId}/campaigns")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class CampaignController {

    private final CampaignRepository campaignRepository;
    private final MarketRepository marketRepository;
    private final MarketAccessService marketAccessService;

    public CampaignController(CampaignRepository campaignRepository,
                              MarketRepository marketRepository,
                              MarketAccessService marketAccessService) {
        this.campaignRepository = campaignRepository;
        this.marketRepository = marketRepository;
        this.marketAccessService = marketAccessService;
    }

    @GetMapping
    public ResponseEntity<List<CampaignResponse>> list(@PathVariable UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        List<CampaignResponse> items = campaignRepository.findByMarketId(marketId).stream()
            .map(this::map)
            .toList();
        return ResponseEntity.ok(items);
    }

    @PostMapping
    public ResponseEntity<CampaignResponse> create(@PathVariable UUID marketId,
                                                   @Valid @RequestBody CampaignCreateRequest request,
                                                   Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        Market market = marketRepository.getReferenceById(marketId);

        Campaign campaign = new Campaign();
        campaign.setMarket(market);
        campaign.setName(request.getName());
        campaign.setDescription(request.getDescription());
        if (request.getStartDate() != null && !request.getStartDate().isBlank()) {
            campaign.setStartDate(DateUtils.parseFlexible(request.getStartDate()));
        }
        if (request.getEndDate() != null && !request.getEndDate().isBlank()) {
            campaign.setEndDate(DateUtils.parseFlexible(request.getEndDate()));
        }
        campaignRepository.save(campaign);

        return ResponseEntity.ok(map(campaign));
    }

    private CampaignResponse map(Campaign c) {
        UUID marketId = c.getMarket() != null ? c.getMarket().getId() : null;
        if (marketId == null) {
            throw new CustomExceptions.NotFound("Campaign market not found");
        }
        return new CampaignResponse(
            c.getId(),
            marketId,
            c.getName(),
            c.getDescription(),
            c.getStartDate(),
            c.getEndDate(),
            c.getCreatedAt()
        );
    }
}

