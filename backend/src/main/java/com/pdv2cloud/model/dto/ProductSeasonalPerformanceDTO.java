package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ProductSeasonalPerformanceDTO {
    private String key;           // ex: "natal", "pascoa"
    private String title;         // ex: "Natal"
    private String status;        // CURRENT, UPCOMING, RECENT
    private String proximityLabel;// ex: "Começa em 12 dias"
    private String periodLabel;   // ex: "01/12/2025 a 25/12/2025"
    private BigDecimal revenue;   // receita do produto nesta janela
    private BigDecimal quantity;  // quantidade vendida
    private long transactions;    // nº de cupons
    private double indexVsBaseline; // receita nesta janela / média diária baseline — >1 = acima
    private String signal;        // HIGH_SEASON, LOW_SEASON, NEUTRAL
}
