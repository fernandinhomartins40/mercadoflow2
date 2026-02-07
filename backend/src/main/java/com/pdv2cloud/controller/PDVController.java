package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.PDVCreateRequest;
import com.pdv2cloud.model.dto.PDVResponse;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PDV;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.service.MarketAccessService;
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
@RequestMapping("/api/v1/markets/{marketId}/pdvs")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class PDVController {

    private final PDVRepository pdvRepository;
    private final MarketRepository marketRepository;
    private final MarketAccessService marketAccessService;

    public PDVController(PDVRepository pdvRepository,
                         MarketRepository marketRepository,
                         MarketAccessService marketAccessService) {
        this.pdvRepository = pdvRepository;
        this.marketRepository = marketRepository;
        this.marketAccessService = marketAccessService;
    }

    @GetMapping
    public ResponseEntity<List<PDVResponse>> list(@PathVariable UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        List<PDVResponse> items = pdvRepository.findByMarketId(marketId).stream()
            .map(p -> new PDVResponse(p.getId(), p.getName(), p.getSerialNumber(), p.getCreatedAt()))
            .toList();
        return ResponseEntity.ok(items);
    }

    @PostMapping
    public ResponseEntity<PDVResponse> create(@PathVariable UUID marketId,
                                              @Valid @RequestBody PDVCreateRequest request,
                                              Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        Market market = marketRepository.getReferenceById(marketId);

        PDV pdv = new PDV();
        pdv.setMarket(market);
        pdv.setName(request.getName());
        pdv.setSerialNumber(request.getSerialNumber());
        pdvRepository.save(pdv);

        return ResponseEntity.ok(new PDVResponse(pdv.getId(), pdv.getName(), pdv.getSerialNumber(), pdv.getCreatedAt()));
    }
}

