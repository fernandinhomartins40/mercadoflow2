package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.DemandForecastDTO;
import com.pdv2cloud.model.entity.DemandForecast;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.DemandForecastRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ForecastService {

    private final DemandForecastRepository demandForecastRepository;
    private final ProductRepository productRepository;

    public ForecastService(DemandForecastRepository demandForecastRepository, ProductRepository productRepository) {
        this.demandForecastRepository = demandForecastRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<DemandForecastDTO> getForecast(UUID marketId, int days) {
        int clampedDays = Math.max(1, Math.min(days, 30));
        LocalDate start = LocalDate.now().plusDays(1);
        LocalDate end = start.plusDays(clampedDays - 1L);

        List<DemandForecast> rows = demandForecastRepository
            .findByMarketIdAndForecastDateBetweenOrderByForecastDateAsc(marketId, start, end);

        Set<UUID> ids = new HashSet<>();
        for (DemandForecast row : rows) {
            if (row.getProduct() != null) {
                ids.add(row.getProduct().getId());
            }
        }
        Map<UUID, String> names = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(Product::getId, Product::getName));

        return rows.stream()
            .map(row -> new DemandForecastDTO(
                row.getForecastDate(),
                row.getProduct().getId(),
                names.get(row.getProduct().getId()),
                row.getPredictedQuantity()
            ))
            .toList();
    }
}

