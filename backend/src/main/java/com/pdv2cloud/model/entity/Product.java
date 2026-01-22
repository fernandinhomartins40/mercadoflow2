package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "products")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true)
    private String ean;

    private String name;
    private String category;
    private String brand;
    private String unit;

    @CreatedDate
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(columnDefinition = "TEXT")
    private LocalDateTime createdAt;
}
