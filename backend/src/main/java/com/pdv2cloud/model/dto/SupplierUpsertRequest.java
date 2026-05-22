package com.pdv2cloud.model.dto;

public record SupplierUpsertRequest(
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
) {}
