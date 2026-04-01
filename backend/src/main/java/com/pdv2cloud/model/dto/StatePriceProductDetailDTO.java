package com.pdv2cloud.model.dto;

import java.util.List;

public record StatePriceProductDetailDTO(
    StatePriceProductSummaryDTO summary,
    List<StatePriceObservationDTO> observations
) {
}
