package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.NetworkContract;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.NetworkContractRepository;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import com.stripe.model.Invoice;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Conciliação de faturas: espelha o estado do Stripe no banco.
 *
 * O que normalmente se chama de "conciliação bancária" — baixar retorno CNAB,
 * cruzar com o extrato — não se aplica aqui: o Stripe é quem recebe o
 * pagamento, confirma a compensação do boleto e avisa por webhook
 * ({@code invoice.paid} chega no dia útil seguinte ao pagamento). Esta classe
 * traduz esses eventos em linhas de {@link NetworkInvoice}, de modo que o
 * painel responda "quem deve, há quantos dias e quanto entrou" sem consultar a
 * API a cada tela.
 *
 * É idempotente por construção: reprocessar o mesmo evento apenas reescreve o
 * mesmo estado, o que importa porque o Stripe reenvia webhooks.
 */
@Service
@Slf4j
public class InvoiceReconciliationService {

    private final NetworkInvoiceRepository invoiceRepository;
    private final NetworkContractRepository contractRepository;
    private final MarketRepository marketRepository;

    public InvoiceReconciliationService(
        NetworkInvoiceRepository invoiceRepository,
        NetworkContractRepository contractRepository,
        MarketRepository marketRepository
    ) {
        this.invoiceRepository = invoiceRepository;
        this.contractRepository = contractRepository;
        this.marketRepository = marketRepository;
    }

    /**
     * Grava ou atualiza o espelho de uma fatura.
     *
     * Chamado pelo webhook em criação, finalização, pagamento e cancelamento —
     * todos caem aqui porque o objeto do evento traz o estado completo.
     */
    @Transactional
    public void sync(Invoice invoice) {
        Optional<Market> marketOpt = resolveMarket(invoice);
        if (marketOpt.isEmpty()) {
            // Fatura de um plano de prateleira (ou de outro produto na mesma
            // conta Stripe): não é assunto do contrato de rede.
            log.debug("Fatura {} sem mercado correspondente — ignorada", invoice.getId());
            return;
        }
        Market market = marketOpt.get();

        NetworkInvoice entry = invoiceRepository.findByStripeInvoiceId(invoice.getId())
            .orElseGet(() -> {
                NetworkInvoice created = new NetworkInvoice();
                created.setStripeInvoiceId(invoice.getId());
                created.setMarket(market);
                return created;
            });

        entry.setMarket(market);
        entry.setInvoiceNumber(invoice.getNumber());
        entry.setStatus(invoice.getStatus() != null ? invoice.getStatus() : "draft");
        entry.setAmountDueCents(toIntCents(invoice.getAmountDue()));
        entry.setAmountPaidCents(toIntCents(invoice.getAmountPaid()));
        entry.setCurrency(invoice.getCurrency() != null ? invoice.getCurrency() : "brl");
        entry.setHostedInvoiceUrl(invoice.getHostedInvoiceUrl());
        entry.setInvoicePdfUrl(invoice.getInvoicePdf());
        entry.setDueDate(toLocalDateTime(invoice.getDueDate()));
        entry.setAttemptCount(invoice.getAttemptCount() != null
            ? invoice.getAttemptCount().intValue() : 0);

        if (invoice.getPeriodStart() != null) {
            entry.setPeriodStart(toLocalDateTime(invoice.getPeriodStart()));
        }
        if (invoice.getPeriodEnd() != null) {
            entry.setPeriodEnd(toLocalDateTime(invoice.getPeriodEnd()));
        }

        // Marca o instante do pagamento uma única vez: reenvios do webhook não
        // devem reescrever a data em que o dinheiro efetivamente entrou.
        if ("paid".equals(entry.getStatus()) && entry.getPaidAt() == null) {
            entry.setPaidAt(LocalDateTime.now());
        }
        if ("void".equals(entry.getStatus()) && entry.getVoidedAt() == null) {
            entry.setVoidedAt(LocalDateTime.now());
        }

        contractRepository.findActiveByMarket(market.getId())
            .ifPresent(contract -> entry.setContractId(contract.getId()));

        invoiceRepository.save(entry);

        log.info("Fatura conciliada | market={} | invoice={} | status={} | valor={}",
            market.getId(), invoice.getId(), entry.getStatus(), entry.getAmountDueCents());
    }

    /**
     * Resumo de contas a receber para o painel.
     *
     * Calculado sobre o espelho local; o Stripe só é consultado quando o super
     * admin abre uma fatura específica.
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

    /** Localiza o mercado pelo metadata da assinatura ou pelo cliente Stripe. */
    private Optional<Market> resolveMarket(Invoice invoice) {
        Map<String, String> metadata = invoice.getMetadata();
        if (metadata != null && metadata.get("marketId") != null) {
            try {
                return marketRepository.findById(UUID.fromString(metadata.get("marketId")));
            } catch (IllegalArgumentException ignored) {
                // metadata inválido: tenta pelos caminhos abaixo
            }
        }

        // No SDK 33 a assinatura da fatura vive em parent.subscription_details,
        // e não mais em invoice.subscription.
        String subscriptionId = subscriptionIdOf(invoice);
        if (subscriptionId != null) {
            Optional<Market> byContract = contractRepository
                .findByStripeSubscriptionId(subscriptionId)
                .map(NetworkContract::getMarket);
            if (byContract.isPresent()) {
                return byContract;
            }
        }

        if (invoice.getCustomer() != null) {
            return marketRepository.findAll().stream()
                .filter(m -> invoice.getCustomer().equals(m.getStripeCustomerId()))
                .findFirst();
        }
        return Optional.empty();
    }

    /** Id da assinatura da fatura, tolerando os níveis nulos do objeto. */
    private static String subscriptionIdOf(Invoice invoice) {
        Invoice.Parent parent = invoice.getParent();
        if (parent == null || parent.getSubscriptionDetails() == null) {
            return null;
        }
        return parent.getSubscriptionDetails().getSubscription();
    }

    private static int toIntCents(Long value) {
        return value != null ? value.intValue() : 0;
    }

    private static LocalDateTime toLocalDateTime(Long epochSeconds) {
        if (epochSeconds == null) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneId.systemDefault());
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
