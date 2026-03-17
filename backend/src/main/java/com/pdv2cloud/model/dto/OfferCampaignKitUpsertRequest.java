package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferCampaignKitUpsertRequest {
    private String kitKey;
    private String name;
    private String description;
    private String seasonKey;
    private LocalDateTime startsAt;
    private LocalDateTime endsAt;
    private String tokensJson;
    private String assetsJson;
    private Boolean active;
}
