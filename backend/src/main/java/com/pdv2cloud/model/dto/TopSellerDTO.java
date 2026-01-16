package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class TopSellerDTO {
    private UUID productId;
    private String name;
    private BigDecimal revenue;
    private BigDecimal quantitySold;
}
