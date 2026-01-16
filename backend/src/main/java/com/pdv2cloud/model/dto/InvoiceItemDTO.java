package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InvoiceItemDTO {
    @NotBlank
    private String codigoEAN;

    private String codigoInterno;

    @NotBlank
    private String descricao;

    private String ncm;
    private String cfop;

    @NotNull
    private BigDecimal quantidade;

    @NotNull
    private BigDecimal valorUnitario;

    @NotNull
    private BigDecimal valorTotal;

    private BigDecimal icms;
    private BigDecimal pis;
    private BigDecimal cofins;
}
