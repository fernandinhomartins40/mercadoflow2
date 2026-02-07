package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DemandForecastDTO {
    private LocalDate forecastDate;
    private UUID productId;
    private String productName;
    private BigDecimal predictedQuantity;
}

