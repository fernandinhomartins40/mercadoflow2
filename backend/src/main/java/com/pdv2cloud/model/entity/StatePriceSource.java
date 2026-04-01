package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "state_price_sources")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
public class StatePriceSource {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String provider;

    @Column(nullable = false)
    private String name;

    @Column(name = "state_code")
    private String stateCode;

    @Column(name = "service_name")
    private String serviceName;

    @Column(name = "service_url", length = 1024)
    private String serviceUrl;

    @Column(name = "coverage_states", length = 512)
    private String coverageStates;

    @Column(length = 4000)
    private String notes;

    @Column(nullable = false)
    private Boolean active = true;

    @CreatedDate
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
