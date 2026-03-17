package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferBackgroundRemovalRequest {
    private UUID productId;
    private String imageUrl;
    private String imageStorageKey;
}
