package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ProductCatalogBackfillResponse {
    private int invoiceItemsScanned;
    private int observationsCreated;
    private int aliasesTouched;
    private int productsUpdated;
}
