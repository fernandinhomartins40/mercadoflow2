package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contas a receber dos contratos de rede, calculadas sobre {@link NetworkInvoice}.
 *
 * As faturas gravadas ali vieram da Stripe, que não é mais usada: o histórico
 * fica para consulta e o resumo continua funcionando sobre ele.
 */
@Service
@Slf4j
public class InvoiceReconciliationService {

    private final NetworkInvoiceRepository invoiceRepository;

    public InvoiceReconciliationService(NetworkInvoiceRepository invoiceRepository) {
        this.invoiceRepository = invoiceRepository;
    }

    /**
     * Resumo de contas a receber para o painel.
     *
     * Calculado sobre as faturas gravadas no banco.
     */
    @Transactional(readOnly = true)
    public ReceivablesSummary receivables() {
        LocalDateTime now = LocalDateTime.now();
        List<NetworkInvoice> open = invoiceRepository.findOpen();

        long openCents = 0;
        long overdueCents = 0;
        int overdueCount = 0;
        long worstDelay = 0;

        for (NetworkInvoice invoice : open) {
            openCents += invoice.getAmountDueCents();
            if (invoice.getDueDate() != null && invoice.getDueDate().isBefore(now)) {
                overdueCents += invoice.getAmountDueCents();
                overdueCount++;
                worstDelay = Math.max(worstDelay, invoice.daysOverdue());
            }
        }

        long paidLast30 = invoiceRepository.sumPaidSince(now.minusDays(30));
        long paidLast90 = invoiceRepository.sumPaidSince(now.minusDays(90));

        return new ReceivablesSummary(
            openCents, open.size(),
            overdueCents, overdueCount, worstDelay,
            paidLast30, paidLast90
        );
    }

    public record ReceivablesSummary(
        long openCents,
        int openCount,
        long overdueCents,
        int overdueCount,
        /** Maior atraso em dias — indica a gravidade da inadimplência. */
        long worstDelayDays,
        long paidLast30DaysCents,
        long paidLast90DaysCents
    ) {}
}
