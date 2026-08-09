package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Exportação em CSV para contabilidade e planilhas.
 *
 * Formatado para Excel brasileiro: separador ponto e vírgula e decimal com
 * vírgula. Um CSV com separador de vírgula abre em coluna única no Excel pt-BR,
 * que é justamente onde esses arquivos são usados.
 */
@Service
public class CsvExportService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final String SEP = ";";

    private final CrmService crmService;
    private final NetworkInvoiceRepository invoiceRepository;

    public CsvExportService(CrmService crmService, NetworkInvoiceRepository invoiceRepository) {
        this.crmService = crmService;
        this.invoiceRepository = invoiceRepository;
    }

    /** Base de clientes com plano, consumo e saúde. */
    @Transactional(readOnly = true)
    public String customersCsv() {
        StringBuilder sb = new StringBuilder();
        // BOM para o Excel reconhecer UTF-8 e não quebrar os acentos.
        sb.append('﻿');
        sb.append(join("Mercado", "CNPJ", "E-mail", "Plano", "Status", "Ativo",
            "Mensalidade", "Notas no ciclo", "Uso %", "Lojas", "PDVs",
            "Vencido", "Saude", "Faixa", "Responsavel", "Cliente desde"));

        for (CrmService.CustomerSummary c : crmService.listCustomers()) {
            sb.append(join(
                c.name(),
                c.cnpj(),
                c.contactEmail(),
                c.planName(),
                c.billingStatus(),
                c.active() ? "Sim" : "Nao",
                money(c.monthlyPriceCents()),
                String.valueOf(c.invoicesUsed()),
                c.usagePercent() < 0 ? "ilimitado" : c.usagePercent() + "%",
                String.valueOf(c.branchCount()),
                String.valueOf(c.pdvCount()),
                money(c.overdueCents()),
                String.valueOf(c.healthScore()),
                c.healthBand(),
                c.accountOwnerEmail(),
                c.createdAt() != null ? DATE.format(c.createdAt()) : ""
            ));
        }
        return sb.toString();
    }

    /** Faturas emitidas, para conferência com o contador. */
    @Transactional(readOnly = true)
    public String invoicesCsv() {
        StringBuilder sb = new StringBuilder();
        sb.append('﻿');
        sb.append(join("Mercado", "Numero", "Status", "Valor", "Pago",
            "Emissao", "Vencimento", "Pagamento", "Dias de atraso"));

        List<NetworkInvoice> invoices = invoiceRepository.findAllWithMarket();
        for (NetworkInvoice invoice : invoices) {
            sb.append(join(
                invoice.getMarket() != null ? invoice.getMarket().getName() : "",
                invoice.getInvoiceNumber(),
                statusLabel(invoice.getStatus()),
                money(invoice.getAmountDueCents()),
                money(invoice.getAmountPaidCents()),
                invoice.getCreatedAt() != null ? DATE.format(invoice.getCreatedAt()) : "",
                invoice.getDueDate() != null ? DATE.format(invoice.getDueDate()) : "",
                invoice.getPaidAt() != null ? DATE.format(invoice.getPaidAt()) : "",
                invoice.isOverdue() ? String.valueOf(invoice.daysOverdue()) : ""
            ));
        }
        return sb.toString();
    }

    /** Só o que está vencido — a lista de cobrança. */
    @Transactional(readOnly = true)
    public String overdueCsv() {
        StringBuilder sb = new StringBuilder();
        sb.append('﻿');
        sb.append(join("Mercado", "Contato", "Numero", "Valor",
            "Vencimento", "Dias de atraso", "Link da fatura"));

        for (NetworkInvoice invoice : invoiceRepository.findOverdue(java.time.LocalDateTime.now())) {
            sb.append(join(
                invoice.getMarket() != null ? invoice.getMarket().getName() : "",
                invoice.getMarket() != null ? invoice.getMarket().getContactEmail() : "",
                invoice.getInvoiceNumber(),
                money(invoice.getAmountDueCents()),
                invoice.getDueDate() != null ? DATE.format(invoice.getDueDate()) : "",
                String.valueOf(invoice.daysOverdue()),
                invoice.getHostedInvoiceUrl()
            ));
        }
        return sb.toString();
    }

    private static String statusLabel(String status) {
        if (status == null) {
            return "";
        }
        return switch (status) {
            case "draft" -> "Rascunho";
            case "open" -> "Em aberto";
            case "paid" -> "Paga";
            case "void" -> "Cancelada";
            case "uncollectible" -> "Incobravel";
            default -> status;
        };
    }

    /** Decimal com vírgula: é o que o Excel pt-BR reconhece como número. */
    private static String money(long cents) {
        return String.format("%d,%02d", cents / 100, Math.abs(cents % 100));
    }

    private static String join(String... values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                sb.append(SEP);
            }
            sb.append(escape(values[i]));
        }
        return sb.append('\n').toString();
    }

    /** Aspas duplicadas e campo entre aspas quando há separador ou quebra. */
    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        String sanitized = value.replace("\"", "\"\"");
        if (sanitized.contains(SEP) || sanitized.contains("\n") || sanitized.contains("\"")) {
            return "\"" + sanitized + "\"";
        }
        return sanitized;
    }
}
