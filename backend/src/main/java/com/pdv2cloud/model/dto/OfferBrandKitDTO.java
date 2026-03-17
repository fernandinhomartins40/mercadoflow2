package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferBrandKitDTO {
    private UUID id;
    private String kitKey;
    private String name;
    private String description;
    private String tokensJson;
    private String assetsJson;
    private Boolean active;
    private Boolean systemKit;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
