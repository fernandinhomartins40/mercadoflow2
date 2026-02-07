package com.pdv2cloud.controller;

import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.model.dto.MarketSummaryDTO;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/industries")
@PreAuthorize("hasAnyRole('INDUSTRY_USER', 'ADMIN')")
public class IndustryController {

    @Autowired
    private MarketRepository marketRepository;

    @GetMapping("/markets")
    public ResponseEntity<List<MarketSummaryDTO>> listMarkets() {
        List<MarketSummaryDTO> markets = marketRepository.findAllActive().stream()
            .map(m -> new MarketSummaryDTO(m.getId(), m.getName()))
            .toList();
        return ResponseEntity.ok(markets);
    }
}
