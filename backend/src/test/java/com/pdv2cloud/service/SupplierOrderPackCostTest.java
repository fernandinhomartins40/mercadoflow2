package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.pdv2cloud.model.entity.SupplierOrderItem;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Custo por embalagem pedida × custo por unidade vendida no caixa. */
class SupplierOrderPackCostTest {

    private SupplierOrderItem item(String unit, String pack, String cost) {
        SupplierOrderItem i = new SupplierOrderItem();
        i.setUnitType(unit);
        i.setUnitsPerPack(pack == null ? null : new BigDecimal(pack));
        i.setUnitCost(new BigDecimal(cost));
        return i;
    }

    @Test
    @DisplayName("caixa de 6 a R$ 120 custa R$ 20 a unidade")
    void packCostIsDividedByUnits() {
        SupplierOrderItem box = item("CX", "6", "120");
        assertEquals(new BigDecimal("6"), SupplierOrderService.packFactor(box));
        assertEquals(new BigDecimal("20.0000"), SupplierOrderService.costPerUnit(box));
    }

    @Test
    @DisplayName("unidade, quilo e caixa sem tamanho informado ficam como estão")
    void unitsAndUnknownPacksAreKept() {
        assertEquals(new BigDecimal("4.5000"), SupplierOrderService.costPerUnit(item("UN", "12", "4.5")));
        assertEquals(new BigDecimal("9.9000"), SupplierOrderService.costPerUnit(item("KG", null, "9.9")));
        assertEquals(new BigDecimal("120.0000"), SupplierOrderService.costPerUnit(item("CX", null, "120")));
    }
}
