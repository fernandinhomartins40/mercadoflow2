package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ShoppingListOverviewDTO {
    private long totalItems;
    private long checkedItems;
    private long pendingItems;
    private List<ShoppingListItemDTO> items;
}
