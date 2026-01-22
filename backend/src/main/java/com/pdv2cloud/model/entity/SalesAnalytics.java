package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sales_analytics", indexes = {
    @Index(name = "idx_market_product_date", columnList = "market_id,product_id,date")
})
@Data
@NoArgsConstructor
public class SalesAnalytics {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id")
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column
    private LocalDate date;

    @Column(name = "quantity_sold", precision = 10, scale = 3)
    private BigDecimal quantitySold;

    @Column(precision = 10, scale = 2)
    private BigDecimal revenue;

    @Column(name = "average_price", precision = 10, scale = 2)
    private BigDecimal averagePrice;

    @Column(name = "transaction_count")
    private Integer transactionCount;
}
