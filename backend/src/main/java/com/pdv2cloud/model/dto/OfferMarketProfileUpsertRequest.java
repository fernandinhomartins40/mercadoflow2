package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferMarketProfileUpsertRequest {
    private String footerContent;
    private String footerLegalText;
    private String primaryLogoUrl;
    private String secondaryLogoUrl;
}
