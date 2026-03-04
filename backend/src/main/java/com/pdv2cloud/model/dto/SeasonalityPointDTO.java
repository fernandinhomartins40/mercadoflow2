package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SeasonalityPointDTO {
    private String key;
    private String label;
    private BigDecimal revenue;
    private BigDecimal quantity;
    private Long transactions;
    private BigDecimal averageTicket;
}
