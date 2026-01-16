package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "invoice_items")
@Data
@NoArgsConstructor
public class InvoiceItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(name = "codigo_ean")
    private String codigoEAN;

    @Column(name = "codigo_interno")
    private String codigoInterno;

    @Column(name = "descricao")
    private String descricao;

    private String ncm;
    private String cfop;

    @Column(precision = 10, scale = 3)
    private BigDecimal quantidade;

    @Column(name = "valor_unitario", precision = 10, scale = 2)
    private BigDecimal valorUnitario;

    @Column(name = "valor_total", precision = 10, scale = 2)
    private BigDecimal valorTotal;

    @Column(precision = 10, scale = 2)
    private BigDecimal icms;

    @Column(precision = 10, scale = 2)
    private BigDecimal pis;

    @Column(precision = 10, scale = 2)
    private BigDecimal cofins;
}
