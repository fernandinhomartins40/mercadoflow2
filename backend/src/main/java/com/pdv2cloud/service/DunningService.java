package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.CustomerActivity;
import com.pdv2cloud.model.entity.CustomerTask;
import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.model.entity.DunningLog;
import com.pdv2cloud.model.entity.DunningRule;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.repository.DunningLogRepository;
import com.pdv2cloud.repository.DunningRuleRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Régua de cobrança: o que fazer, e quando, conforme a fatura se aproxima do
 * vencimento ou o ultrapassa.
 *
 * Roda uma vez por dia. Cada regra tem um deslocamento em dias relativo ao
 * vencimento — negativo para lembrete preventivo, positivo para cobrança de
 * atraso — e uma ação.
 *
 * Duas decisões deliberadas:
 *
 *  NÃO BLOQUEIA ACESSO. A régua padrão vai até "alertar o administrador" e
 *    para. Rede grande tem trâmite interno de pagamento, e suspender sozinho
 *    quebraria a operação de um cliente que apenas aguarda aprovação no
 *    financeiro. Quem decide bloquear é uma pessoa, com contexto.
 *
 *  NÃO REPETE. {@link DunningLog} registra cada par (fatura, regra) executado.
 *    Sem isso, o job diário reenviaria a mesma cobrança a cada rodada enquanto
 *    a fatura seguisse vencida — o cliente receberia o mesmo e-mail todo dia.
 */
@Service
@Slf4j
public class DunningService {

    /**
     * Auto-referência para atravessar o proxy do Spring: chamar um método
     * @Transactional de dentro da própria classe ignora o proxy e a transação
     * não abre. @Lazy evita ciclo na criação do bean.
     */
    @Autowired
    @Lazy
    private DunningService self;

    private final DunningRuleRepository ruleRepository;
    private final DunningLogRepository logRepository;
    private final NetworkInvoiceRepository invoiceRepository;
    private final MarketRepository marketRepository;
    private final NetworkContractService networkContractService;
    private final CrmService crmService;

    public DunningService(
        DunningRuleRepository ruleRepository,
        DunningLogRepository logRepository,
        NetworkInvoiceRepository invoiceRepository,
        MarketRepository marketRepository,
        NetworkContractService networkContractService,
        CrmService crmService
    ) {
        this.ruleRepository = ruleRepository;
        this.logRepository = logRepository;
        this.invoiceRepository = invoiceRepository;
        this.marketRepository = marketRepository;
        this.networkContractService = networkContractService;
        this.crmService = crmService;
    }

    /**
     * Executa a régua sobre todas as faturas em aberto.
     *
     * Diário às 9h: cedo o bastante para a cobrança sair no horário comercial,
     * tarde o bastante para o Stripe já ter processado as compensações da noite
     * (boleto pago cai como {@code invoice.paid} no dia útil seguinte).
     */
    /**
     * A régua percorre faturas de todos os mercados e roda sem usuário. Sob
     * RLS, sem escopo de sistema ela não enxergaria fatura nenhuma e
     * "concluiria" sem cobrar ninguém — falha silenciosa no fluxo de receita.
     *
     * O runAsSystem envolve a chamada transacional, e não o contrário: as
     * variáveis de tenant são fixadas no checkout da conexão, que o
     * @Transactional faz antes de o corpo executar. A chamada passa por `self`
     * para atravessar o proxy do Spring — auto-invocação ignoraria a transação.
     */
    public DunningRunResult run() {
        return TenantContext.runAsSystem(() -> self.executeRun());
    }

    @Transactional
    public DunningRunResult executeRun() {
        List<DunningRule> rules = ruleRepository.findByIsActiveTrueOrderByDaysOffsetAsc();
        if (rules.isEmpty()) {
            return new DunningRunResult(0, 0, List.of());
        }

        List<NetworkInvoice> openInvoices = invoiceRepository.findOpen();
        List<String> details = new ArrayList<>();
        int executed = 0;

        LocalDate today = LocalDate.now();

        for (NetworkInvoice invoice : openInvoices) {
            if (invoice.getDueDate() == null) {
                continue;
            }
            long daysFromDue = ChronoUnit.DAYS.between(invoice.getDueDate().toLocalDate(), today);

            for (DunningRule rule : rules) {
                // A regra dispara no dia exato ou depois dele; nunca antes, para
                // um lembrete de -3 não sair com 10 dias de antecedência.
                if (daysFromDue < rule.getDaysOffset()) {
                    continue;
                }
                if (logRepository.existsByInvoiceIdAndRuleId(invoice.getId(), rule.getId())) {
                    continue;
                }

                String detail = apply(rule, invoice, daysFromDue);
                details.add(detail);
                executed++;
            }
        }

        log.info("Régua de cobrança executada | faturas={} | ações={}", openInvoices.size(), executed);
        return new DunningRunResult(openInvoices.size(), executed, details);
    }

    private String apply(DunningRule rule, NetworkInvoice invoice, long daysFromDue) {
        Market market = invoice.getMarket();
        String marketName = market != null ? market.getName() : "?";
        boolean success = true;
        String detail;

        try {
            switch (rule.getAction()) {
                case RESEND_INVOICE -> {
                    String warning = networkContractService.resendInvoice(invoice.getId());
                    success = warning == null;
                    detail = success
                        ? "Fatura reenviada para " + marketName
                        : "Falha ao reenviar para " + marketName + ": " + warning;
                    if (market != null && success) {
                        crmService.recordSystemActivity(
                            market, CustomerActivity.Type.INVOICE_SENT,
                            rule.getName(),
                            String.format("Fatura de %s reenviada (%d dia(s) do vencimento).",
                                formatCents(invoice.getAmountDueCents()), daysFromDue)
                        );
                    }
                }
                case CREATE_TASK -> {
                    if (market != null) {
                        crmService.createTask(
                            market.getId(),
                            "Cobrar fatura vencida — " + marketName,
                            String.format("%s · %s vencida há %d dia(s).",
                                rule.getMessage() != null ? rule.getMessage() : "",
                                formatCents(invoice.getAmountDueCents()), daysFromDue),
                            LocalDate.now(),
                            CustomerTask.Priority.HIGH,
                            market.getAccountOwnerEmail(),
                            "sistema"
                        );
                    }
                    detail = "Follow-up aberto para " + marketName;
                }
                case NOTIFY_ADMIN -> {
                    if (market != null) {
                        crmService.recordSystemActivity(
                            market, CustomerActivity.Type.NOTE,
                            "Inadimplência prolongada",
                            String.format("%s vencida há %d dia(s). Avaliar suspensão.",
                                formatCents(invoice.getAmountDueCents()), daysFromDue)
                        );
                    }
                    detail = "Alerta registrado para " + marketName;
                }
                case MARK_PAST_DUE -> {
                    if (market != null && market.getBillingStatus() != MarketBillingStatus.PAST_DUE) {
                        market.setBillingStatus(MarketBillingStatus.PAST_DUE);
                        // isActive não é tocado: marcar inadimplência não corta
                        // o acesso — essa decisão é humana.
                        marketRepository.save(market);
                    }
                    detail = marketName + " marcado como inadimplente";
                }
                default -> detail = "Ação não implementada: " + rule.getAction();
            }
        } catch (Exception exc) {
            success = false;
            detail = "Erro em " + rule.getName() + " para " + marketName + ": " + exc.getMessage();
            log.warn(detail);
        }

        DunningLog entry = new DunningLog();
        entry.setInvoiceId(invoice.getId());
        entry.setRuleId(rule.getId());
        entry.setMarketId(market != null ? market.getId() : null);
        entry.setAction(rule.getAction());
        entry.setSuccess(success);
        entry.setDetail(detail.length() > 500 ? detail.substring(0, 500) : detail);
        logRepository.save(entry);

        return detail;
    }

    // ── Configuração da régua ────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<DunningRule> listRules() {
        return ruleRepository.findAllByOrderByDaysOffsetAsc();
    }

    @Transactional
    public DunningRule saveRule(DunningRule rule) {
        return ruleRepository.save(rule);
    }

    @Transactional
    public void deleteRule(UUID ruleId) {
        ruleRepository.deleteById(ruleId);
    }

    @Transactional(readOnly = true)
    public List<DunningLog> recentLogs() {
        return logRepository.recentSince(LocalDateTime.now().minusDays(30));
    }

    private static String formatCents(Integer cents) {
        return String.format("R$ %.2f", (cents != null ? cents : 0) / 100.0);
    }

    public record DunningRunResult(int invoicesChecked, int actionsExecuted, List<String> details) {}
}
