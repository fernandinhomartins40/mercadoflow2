package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "markets")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Market {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String cnpj;

    private String address;
    private String city;
    private String state;
    private String region;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private User owner;

    @Enumerated(EnumType.STRING)
    private PlanType planType;

    @Enumerated(EnumType.STRING)
    private MarketBillingStatus billingStatus = MarketBillingStatus.ACTIVE;

    private Boolean isActive = true;

    private Integer userSeatLimit;

    private LocalDateTime accessExpiresAt;

    private LocalDateTime trialEndsAt;

    private String contactName;

    private String contactEmail;

    private String contactPhone;

    @Column(length = 4000)
    private String notes;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "market", cascade = CascadeType.ALL)
    private List<PDV> pdvs;
}
