package com.pdv2cloud.controller;

import com.pdv2cloud.security.AgentPrincipal;
import com.pdv2cloud.service.storemap.StoreMapService;
import com.pdv2cloud.service.storemap.StoreTrafficService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** O que o app MercadoFlow Câmeras usa com a chave da loja: ler a planta e enviar os números. */
@RestController
@RequestMapping("/api/v1/agent/store-traffic")
public class AgentStoreTrafficController {

    public record Upload(String cameraId, List<StoreTrafficService.Bucket> buckets) {}

    private final StoreMapService storeMap;
    private final StoreTrafficService traffic;

    public AgentStoreTrafficController(StoreMapService storeMap, StoreTrafficService traffic) {
        this.storeMap = storeMap;
        this.traffic = traffic;
    }

    /** Planta da loja, para calibrar a câmera. {@code plan} nulo: a loja ainda não montou a planta. */
    @GetMapping("/plan")
    public ResponseEntity<Map<String, Object>> plan(Authentication authentication) {
        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        Map<String, Object> out = new HashMap<>();
        out.put("plan", storeMap.getPlan(principal.getMarketId()));
        out.put("cellSize", StoreTrafficService.CELL_SIZE);
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> upload(@RequestBody Upload body, Authentication authentication) {
        AgentPrincipal principal = (AgentPrincipal) authentication.getPrincipal();
        return ResponseEntity.ok(Map.of("cells", traffic.ingest(principal.getMarketId(), body.cameraId(), body.buckets())));
    }
}
