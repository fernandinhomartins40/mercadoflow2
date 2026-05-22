package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "suppliers",
    uniqueConstraints = @UniqueConstraint(columnNames = {"market_id", "cnpj"}))
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Supplier {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(nullable = false, length = 14)
    private String cnpj;

    @Column(name = "razao_social", nullable = false, length = 255)
    private String razaoSocial;

    @Column(name = "nome_fantasia", length = 255)
    private String nomeFantasia;

    @Column(length = 255)
    private String email;

    @Column(length = 30)
    private String telefone;

    @Column(length = 255)
    private String logradouro;

    @Column(length = 100)
    private String municipio;

    @Column(length = 2)
    private String uf;

    @Column(length = 10)
    private String cep;

    @Column(name = "situacao_cadastral", length = 50)
    private String situacaoCadastral;

    @Column(name = "cnae_principal", length = 10)
    private String cnaePrincipal;

    @Column(name = "descricao_cnae", length = 255)
    private String descricaoCnae;

    @Column(name = "porte", length = 50)
    private String porte;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
