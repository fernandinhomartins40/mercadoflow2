package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.intelligence.DataCompletenessService;
import com.pdv2cloud.service.intelligence.ProductTractionService;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Tração por produto e completude do histórico (base de toda comparação). */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}/analytics")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class TractionController {

    private final ProductTractionService traction;
    private final DataCompletenessService completeness;
    private final MarketAccessService access;

    public TractionController(ProductTractionService traction, DataCompletenessService completeness, MarketAccessService access) {
        this.traction = traction;
        this.completeness = completeness;
        this.access = access;
    }

    @GetMapping("/traction")
    public List<ProductTractionService.Traction> list(@PathVariable("id") UUID id,
                                                      @RequestParam(name = "onlyPositive", defaultValue = "true") boolean onlyPositive,
                                                      @RequestParam(name = "limit", defaultValue = "20") int limit,
                                                      Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        return traction.list(id, onlyPositive, Math.max(1, Math.min(limit, 200)));
    }

    @GetMapping("/traction/{productId}")
    public ResponseEntity<ProductTractionService.Traction> product(@PathVariable("id") UUID id,
                                                                   @PathVariable("productId") UUID productId,
                                                                   Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        ProductTractionService.Traction t = traction.forProduct(id, productId);
        return t == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(t);
    }

    /** Quanto do histórico já chegou: as telas avisam e as comparações usam só os dias completos. */
    @GetMapping("/data-completeness")
    public Map<String, Object> dataCompleteness(@PathVariable("id") UUID id, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        DataCompletenessService.Coverage c = completeness.coverage(id);
        LocalDate today = c.today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("share90", c.share(today.minusDays(90), today));
        out.put("share180", c.share(today.minusDays(180), today));
        out.put("share365", c.share(today.minusDays(365), today));
        out.put("gaps", c.gaps(today.minusDays(365), today));
        return out;
    }
}
