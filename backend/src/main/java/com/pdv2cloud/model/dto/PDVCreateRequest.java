package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PDVCreateRequest {
    @NotBlank
    private String name;

    private String serialNumber;
}

