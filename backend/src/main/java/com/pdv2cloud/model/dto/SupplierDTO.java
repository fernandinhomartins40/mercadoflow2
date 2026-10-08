package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.Supplier;
import java.time.LocalDateTime;
import java.util.UUID;

public record SupplierDTO(
    UUID id,
    String cnpj,
    String razaoSocial,
    String nomeFantasia,
    String email,
    String telefone,
    String logradouro,
    String municipio,
    String uf,
    String cep,
    String situacaoCadastral,
    String cnaePrincipal,
    String descricaoCnae,
    String porte,
    /** MANUAL ou CONFERE (cadastrado pela nota de entrada). */
    String source,
    /** Quantos produtos ele vende, pelas notas do Confere. */
    Integer productCount,
    LocalDateTime lastPurchaseAt
) {
    public static SupplierDTO from(Supplier s) {
        return from(s, null, null);
    }

    public static SupplierDTO from(Supplier s, Integer productCount, LocalDateTime lastPurchaseAt) {
        return new SupplierDTO(
            s.getId(), s.getCnpj(), s.getRazaoSocial(), s.getNomeFantasia(),
            s.getEmail(), s.getTelefone(), s.getLogradouro(), s.getMunicipio(),
            s.getUf(), s.getCep(), s.getSituacaoCadastral(), s.getCnaePrincipal(),
            s.getDescricaoCnae(), s.getPorte(), s.getSource(), productCount, lastPurchaseAt
        );
    }
}
