package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Follow-up comercial sobre uma conta (ver V38__commercial_crm.sql).
 *
 * "Retornar ligação dia 20", "cobrar assinatura do contrato". Criadas à mão ou
 * pela régua de cobrança, quando uma fatura passa do prazo.
 */
@Entity
@Table(name = "customer_tasks")
@Data
@NoArgsConstructor
public class CustomerTask {

    public enum Status {
        OPEN,
        DONE,
        CANCELLED
    }

    public enum Priority {
        LOW,
        NORMAL,
        HIGH
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Priority priority = Priority.NORMAL;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "assignee_email")
    private String assigneeEmail;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "completed_by")
    private String completedBy;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /** Aberta e com prazo passado. */
    public boolean isOverdue() {
        return status == Status.OPEN && dueDate != null && dueDate.isBefore(LocalDate.now());
    }
}
