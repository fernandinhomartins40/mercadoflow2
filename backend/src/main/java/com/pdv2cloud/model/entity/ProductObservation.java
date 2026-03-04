package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "product_observations")
@Data
@NoArgsConstructor
public class ProductObservation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_item_id", nullable = false, unique = true)
    private InvoiceItem invoiceItem;

    @Column(name = "observed_gtin")
    private String observedGtin;

    @Column(name = "local_name", nullable = false)
    private String localName;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Column(name = "internal_code")
    private String internalCode;

    @Column(precision = 10, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price", precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "total_price", precision = 10, scale = 2)
    private BigDecimal totalPrice;

    @Column(name = "discount_amount", precision = 10, scale = 2)
    private BigDecimal discountAmount;

    @Column(name = "freight_amount", precision = 10, scale = 2)
    private BigDecimal freightAmount;

    @Column(name = "other_amount", precision = 10, scale = 2)
    private BigDecimal otherAmount;

    @Column(name = "net_unit_price", precision = 10, scale = 2)
    private BigDecimal netUnitPrice;

    @Column(name = "net_total_price", precision = 10, scale = 2)
    private BigDecimal netTotalPrice;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false)
    private ProductDataSource sourceType = ProductDataSource.INVOICE;

    @Column(name = "observed_at", nullable = false)
    private LocalDateTime observedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
