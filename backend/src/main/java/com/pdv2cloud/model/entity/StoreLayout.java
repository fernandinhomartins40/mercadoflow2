package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "store_layouts")
@Data
@NoArgsConstructor
public class StoreLayout {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(name = "grid_cols", nullable = false)
    private int gridCols = 4;

    @Column(name = "grid_rows", nullable = false)
    private int gridRows = 5;

    // Each cell: { row, col, sectionName, categorySlug, color }
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cells", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> cells;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
