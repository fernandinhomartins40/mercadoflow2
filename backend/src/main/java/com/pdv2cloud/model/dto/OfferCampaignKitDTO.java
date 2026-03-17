package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferCampaignKitDTO {
    private UUID id;
    private String kitKey;
    private String name;
    private String description;
    private String seasonKey;
    private LocalDateTime startsAt;
    private LocalDateTime endsAt;
    private String tokensJson;
    private String assetsJson;
    private Boolean active;
    private Boolean systemKit;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
