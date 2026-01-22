package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "invoices", indexes = {
    @Index(name = "idx_chave_nfe", columnList = "chave_nfe"),
    @Index(name = "idx_market_date", columnList = "market_id,data_emissao")
})
@Data
@NoArgsConstructor
public class Invoice {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "chave_nfe", unique = true, nullable = false, length = 44)
    private String chaveNFe;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pdv_id")
    private PDV pdv;

    private String serie;
    private String numero;

    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "data_emissao", columnDefinition = "TEXT")
    private LocalDateTime dataEmissao;

    @Column(name = "cnpj_emitente")
    private String cnpjEmitente;

    @Column(name = "cpf_cnpj_destinatario")
    private String cpfCnpjDestinatario;

    @Column(name = "valor_total", precision = 10, scale = 2)
    private BigDecimal valorTotal;

    @Column(name = "raw_xml_hash")
    private String rawXmlHash;

    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "processed_at", columnDefinition = "TEXT")
    private LocalDateTime processedAt;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InvoiceItem> items = new ArrayList<>();
}
