package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.storemap.StoreMapInsights;
import com.pdv2cloud.service.storemap.StoreMapService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Loja Viva: planta da loja, setores com vendas, "onde fica?" e sugestões. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/store-map")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class StoreMapController {

    private final StoreMapService storeMapService;
    private final MarketAccessService marketAccessService;

    public StoreMapController(StoreMapService storeMapService, MarketAccessService marketAccessService) {
        this.storeMapService = storeMapService;
        this.marketAccessService = marketAccessService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getPlan(@PathVariable UUID marketId, Authentication auth) {
        marketAccessService.assertCanAccessMarket(marketId, auth);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan", storeMapService.getPlan(marketId));
        return ResponseEntity.ok(body);
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> savePlan(
        @PathVariable UUID marketId, @RequestBody Map<String, Object> plan, Authentication auth) {
        marketAccessService.assertCanAccessMarket(marketId, auth);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan", storeMapService.savePlan(marketId, plan));
        return ResponseEntity.ok(body);
    }

    @GetMapping("/departments")
    public ResponseEntity<StoreMapService.DepartmentsReport> departments(@PathVariable UUID marketId, Authentication auth) {
        marketAccessService.assertCanAccessMarket(marketId, auth);
        return ResponseEntity.ok(storeMapService.departments(marketId));
    }

    @GetMapping("/insights")
    public ResponseEntity<List<StoreMapInsights.Insight>> insights(@PathVariable UUID marketId, Authentication auth) {
        marketAccessService.assertCanAccessMarket(marketId, auth);
        return ResponseEntity.ok(storeMapService.insights(marketId));
    }

    @GetMapping("/locate")
    public ResponseEntity<List<StoreMapService.LocatedProduct>> locate(
        @PathVariable UUID marketId, @RequestParam(name = "q", defaultValue = "") String q, Authentication auth) {
        marketAccessService.assertCanAccessMarket(marketId, auth);
        return ResponseEntity.ok(storeMapService.locate(marketId, q));
    }
}
