package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Par rotulo/valor de um atributo tecnico do produto (peso, volume, dimensao...). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductSpecAttributeDTO {

    private String label;
    private String value;

    /** Agrupamento para a interface: MEDIDAS, COMPOSICAO, CONSERVACAO ou GERAL. */
    private String group;
}
