package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.Data;

/**
 * Ficha tecnica do produto exibida na pagina de detalhe.
 *
 * Os coletores gravam muito mais do que nome e categoria: tabela nutricional,
 * ingredientes, peso/volume e dimensoes ficam em product_enrichments, dentro de
 * description e attributesJson. Este DTO expoe esse conteudo ja tratado para a
 * tela, evitando que o frontend precise interpretar o JSON cru.
 */
@Data
public class ProductSpecSheetDTO {

    /** Descricao longa do fabricante/mercado, ja convertida para texto puro. */
    private String description;

    /** Tabela nutricional em HTML, quando o mercado publica (ex.: Delivery Fort). */
    private String nutritionTableHtml;

    /** Lista de ingredientes, quando disponivel (ex.: Super Nosso). */
    private String ingredients;

    private String brand;
    private String manufacturer;
    private String ncm;
    private String unit;
    private String packageDescription;

    /** Origem do dado, para credito/auditoria na interface. */
    private String provider;
    private String sourceLicense;

    /** Pares rotulo/valor: peso liquido, volume, dimensoes, composicao, etc. */
    private List<ProductSpecAttributeDTO> attributes;

    /** true quando ha qualquer conteudo util; a tela oculta a secao se for false. */
    private boolean hasContent;
}
