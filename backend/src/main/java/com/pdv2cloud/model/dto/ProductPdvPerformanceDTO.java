package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Desempenho de um produto por frente de caixa (PDV) DESTA loja.
 *
 * Atenção: isto não é desempenho por filial. A hierarquia de rede vive em
 * markets.parent_market_id e não é usada aqui — cada Market é uma loja, e o
 * agrupamento abaixo é por pdvs.id. O nome anterior (ProductBranchPerformanceDTO,
 * "branch") fazia a UI apresentar caixas como se fossem lojas da rede.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPdvPerformanceDTO {
    private UUID pdvId;
    private String pdvName;
    private BigDecimal revenue;
    private BigDecimal quantitySold;
    private BigDecimal averagePrice;
    private Long transactionCount;
    private BigDecimal promoRevenueShare;
    private LocalDateTime lastSoldAt;
}
