package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InvoiceDTO {
    @NotBlank
    private String chaveNFe;

    @NotBlank
    private String cnpjEmitente;

    @NotBlank
    private String dataEmissao;

    private String serie;
    private String numero;

    @NotNull
    private BigDecimal valorTotal;

    private String cpfCnpjDestinatario;

    @NotNull
    @Valid
    private List<InvoiceItemDTO> items;

    private String rawXmlHash;

    /** Endereço do emitente (enderEmit): na NFC-e do caixa, é a própria loja. */
    @Valid
    private Emitente emitente;

    @Data
    public static class Emitente {
        private String logradouro;
        private String numero;
        private String bairro;
        private String municipio;
        private String codigoMunicipio;
        private String uf;
        private String cep;
    }
}
