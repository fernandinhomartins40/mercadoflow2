package com.pdv2cloud.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class StatePriceImportRequestDTO {
    @NotBlank
    private String provider;

    private String name;
    private String stateCode;
    private String serviceName;
    private String serviceUrl;
    private String coverageStates;
    private String notes;

    @Valid
    @NotEmpty
    private List<StatePriceImportObservationRequestDTO> observations;
}
