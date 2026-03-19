package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferMarketProfileDTO {
    private UUID id;
    private UUID marketId;
    private String footerContent;
    private String footerLegalText;
    private String primaryLogoUrl;
    private String primaryLogoStorageKey;
    private String secondaryLogoUrl;
    private String secondaryLogoStorageKey;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
