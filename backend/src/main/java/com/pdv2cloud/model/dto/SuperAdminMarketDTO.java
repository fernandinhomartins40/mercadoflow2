package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuperAdminMarketDTO {
    private UUID id;
    private String name;
    private String cnpj;
    private PlanType planType;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private long usersCount;
}
