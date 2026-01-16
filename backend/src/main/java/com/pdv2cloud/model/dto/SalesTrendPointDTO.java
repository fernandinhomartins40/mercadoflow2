package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SalesTrendPointDTO {
    private LocalDate date;
    private BigDecimal revenue;
}
