package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.Supplier;
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
    String porte
) {
    public static SupplierDTO from(Supplier s) {
        return new SupplierDTO(
            s.getId(), s.getCnpj(), s.getRazaoSocial(), s.getNomeFantasia(),
            s.getEmail(), s.getTelefone(), s.getLogradouro(), s.getMunicipio(),
            s.getUf(), s.getCep(), s.getSituacaoCadastral(), s.getCnaePrincipal(),
            s.getDescricaoCnae(), s.getPorte()
        );
    }
}
