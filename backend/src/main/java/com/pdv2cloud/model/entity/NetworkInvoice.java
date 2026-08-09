package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Espelho de uma fatura do Stripe (ver V37__network_contracts_and_invoices.sql).
 *
 * Mantido por webhook. Existe para o painel responder "quem deve, há quantos
 * dias e quanto entrou" sem consultar a API do Stripe a cada tela — e para o
 * histórico sobreviver a uma eventual troca de conta.
 *
 * No boleto, {@link #paidAt} só é preenchido no dia útil seguinte ao pagamento,
 * que é quando o Stripe confirma a compensação.
 */
@Entity
@Table(name = "network_invoices")
@Data
@NoArgsConstructor
public class NetworkInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(name = "contract_id")
    private UUID contractId;

    @Column(name = "stripe_invoice_id", nullable = false, unique = true, length = 64)
    private String stripeInvoiceId;

    @Column(name = "invoice_number", length = 64)
    private String invoiceNumber;

    /** draft, open, paid, void, uncollectible — estados do Stripe. */
    @Column(nullable = false, length = 24)
    private String status;

    @Column(name = "amount_due_cents", nullable = false)
    private Integer amountDueCents = 0;

    @Column(name = "amount_paid_cents", nullable = false)
    private Integer amountPaidCents = 0;

    @Column(nullable = false, length = 8)
    private String currency = "brl";

    /** Página hospedada onde o cliente paga (boleto, cartão). */
    @Column(name = "hosted_invoice_url", length = 500)
    private String hostedInvoiceUrl;

    @Column(name = "invoice_pdf_url", length = 500)
    private String invoicePdfUrl;

    @Column(name = "period_start")
    private LocalDateTime periodStart;

    @Column(name = "period_end")
    private LocalDateTime periodEnd;

    @Column(name = "due_date")
    private LocalDateTime dueDate;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "voided_at")
    private LocalDateTime voidedAt;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /** Em aberto e com vencimento passado. */
    public boolean isOverdue() {
        return "open".equals(status)
            && dueDate != null
            && dueDate.isBefore(LocalDateTime.now());
    }

    public long daysOverdue() {
        if (!isOverdue()) {
            return 0;
        }
        return java.time.Duration.between(dueDate, LocalDateTime.now()).toDays();
    }
}
