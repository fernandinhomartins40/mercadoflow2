package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.CustomerActivity;
import com.pdv2cloud.model.entity.CustomerTask;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.NetworkContract;
import com.pdv2cloud.model.entity.NetworkInvoice;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.repository.CustomerActivityRepository;
import com.pdv2cloud.repository.CustomerTaskRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.NetworkContractRepository;
import com.pdv2cloud.repository.NetworkInvoiceRepository;
import com.pdv2cloud.repository.SubscriptionEventRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRM comercial: a visão de trabalho sobre cada conta.
 *
 * O painel já respondia "qual o estado do cliente"; faltava o que uma operação
 * comercial precisa de fato — histórico do relacionamento, próximos passos e um
 * indicador que aponte, entre centenas de contas, quais merecem atenção agora.
 *
 * O health score é esse indicador. Combina três sinais que antecedem o
 * cancelamento e que isoladamente enganam:
 *
 *   uso        conta que parou de enviar notas já saiu do produto na prática,
 *              mesmo pagando em dia;
 *   pagamento  atraso é sintoma tardio — quando aparece, a insatisfação já
 *              existe há semanas;
 *   consumo    quem usa muito abaixo do que paga tende a questionar o valor na
 *              renovação, e quem estoura o teto é oportunidade de upgrade.
 */
@Service
@Slf4j
public class CrmService {

    private final MarketRepository marketRepository;
    private final CustomerActivityRepository activityRepository;
    private final CustomerTaskRepository taskRepository;
    private final NetworkContractRepository contractRepository;
    private final NetworkInvoiceRepository invoiceRepository;
    private final SubscriptionEventRepository eventRepository;
    private final PlanService planService;
    private final PlanCatalogService planCatalogService;

    public CrmService(
        MarketRepository marketRepository,
        CustomerActivityRepository activityRepository,
        CustomerTaskRepository taskRepository,
        NetworkContractRepository contractRepository,
        NetworkInvoiceRepository invoiceRepository,
        SubscriptionEventRepository eventRepository,
        PlanService planService,
        PlanCatalogService planCatalogService
    ) {
        this.marketRepository = marketRepository;
        this.activityRepository = activityRepository;
        this.taskRepository = taskRepository;
        this.contractRepository = contractRepository;
        this.invoiceRepository = invoiceRepository;
        this.eventRepository = eventRepository;
        this.planService = planService;
        this.planCatalogService = planCatalogService;
    }

    // ── Ficha 360 ────────────────────────────────────────────────────────────

    /**
     * Tudo sobre uma conta numa consulta.
     *
     * Reunir aqui, em vez de deixar a UI fazer seis chamadas, evita a ficha
     * abrir em pedaços e reduz o tempo até a informação aparecer.
     */
    @Transactional(readOnly = true)
    public CustomerProfile profileOf(UUID marketId) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));

        PlanService.UsageSnapshot usage = planService.usageFor(marketId);
        NetworkContract contract = contractRepository.findActiveByMarket(marketId).orElse(null);
        List<NetworkInvoice> invoices = invoiceRepository.findByMarket(marketId);
        List<CustomerActivity> timeline =
            activityRepository.timelineOf(marketId, PageRequest.of(0, 50));
        List<CustomerTask> tasks = taskRepository.findByMarket(marketId);
        List<SubscriptionEvent> events =
            eventRepository.findTop50ByMarketIdOrderByCreatedAtDesc(marketId);

        HealthAssessment health = assessHealth(market, usage, invoices);

        int monthlyPriceCents = resolvePrice(market, contract);
        long openCents = invoices.stream()
            .filter(i -> "open".equals(i.getStatus()))
            .mapToLong(NetworkInvoice::getAmountDueCents)
            .sum();
        long overdueCents = invoices.stream()
            .filter(NetworkInvoice::isOverdue)
            .mapToLong(NetworkInvoice::getAmountDueCents)
            .sum();
        long lifetimeCents = invoices.stream()
            .filter(i -> "paid".equals(i.getStatus()))
            .mapToLong(NetworkInvoice::getAmountPaidCents)
            .sum();

        long customerDays = market.getCreatedAt() != null
            ? ChronoUnit.DAYS.between(market.getCreatedAt(), LocalDateTime.now())
            : 0;

        return new CustomerProfile(
            market.getId(),
            market.getName(),
            market.getCnpj(),
            market.getContactName(),
            market.getContactEmail(),
            market.getContactPhone(),
            market.getCity(),
            market.getState(),
            usage.limits().plan().name(),
            planCatalogService.entryFor(usage.limits().plan()).getDisplayName(),
            market.getBillingStatus() != null ? market.getBillingStatus().name() : null,
            Boolean.TRUE.equals(market.getIsActive()),
            monthlyPriceCents,
            openCents,
            overdueCents,
            lifetimeCents,
            customerDays,
            market.getAccountOwnerEmail(),
            health,
            usage,
            contract,
            invoices,
            timeline,
            tasks,
            events,
            market.getCreatedAt()
        );
    }

    // ── Health score ─────────────────────────────────────────────────────────

    /**
     * Avalia a saúde da conta de 0 a 100.
     *
     * Começa em 100 e desconta por sinal de risco, o que torna cada penalidade
     * legível na lista de motivos — importante porque um número sozinho não diz
     * o que fazer a respeito.
     */
    public HealthAssessment assessHealth(
        Market market,
        PlanService.UsageSnapshot usage,
        List<NetworkInvoice> invoices
    ) {
        int score = 100;
        List<String> reasons = new ArrayList<>();

        // ── Uso: o sinal mais precoce de abandono ──
        LocalDateTime lastIngest = usage.limitReachedAt();
        int used = usage.invoicesUsed();
        if (used == 0) {
            score -= 35;
            reasons.add("Nenhuma nota recebida neste ciclo");
        } else if (usage.usagePercent() >= 0 && usage.usagePercent() < 10) {
            score -= 20;
            reasons.add("Uso muito abaixo do plano contratado");
        } else if (usage.limitReached()) {
            // Estourar o teto não é risco: é oportunidade comercial.
            reasons.add("Limite atingido — candidato a upgrade");
        }

        // ── Pagamento ──
        long overdueCount = invoices.stream().filter(NetworkInvoice::isOverdue).count();
        long worstDelay = invoices.stream()
            .filter(NetworkInvoice::isOverdue)
            .mapToLong(NetworkInvoice::daysOverdue)
            .max()
            .orElse(0);

        if (overdueCount > 0) {
            int penalty = (int) Math.min(40, 10 + worstDelay);
            score -= penalty;
            reasons.add(String.format("%d fatura(s) vencida(s), pior atraso de %d dia(s)",
                overdueCount, worstDelay));
        }

        // ── Cancelamento agendado: risco praticamente confirmado ──
        if (Boolean.TRUE.equals(market.getCancelAtPeriodEnd())) {
            score -= 30;
            reasons.add("Assinatura marcada para cancelar no fim do período");
        }

        // ── Estrutura ociosa: pagou por PDVs que não conectou ──
        if (!PlanType.isUnlimited(usage.limits().pdvs()) && usage.pdvCount() == 0) {
            score -= 15;
            reasons.add("Nenhum PDV conectado");
        }

        score = Math.max(0, Math.min(100, score));
        String band = score >= 75 ? "SAUDAVEL" : score >= 45 ? "ATENCAO" : "RISCO";

        if (reasons.isEmpty()) {
            reasons.add("Uso e pagamento em dia");
        }
        return new HealthAssessment(score, band, reasons);
    }

    /** Recalcula e grava o health score de todas as contas. */
    @Transactional
    public int refreshAllHealthScores() {
        int updated = 0;
        for (Market market : marketRepository.findAll()) {
            if (market.getParentMarket() != null) {
                continue; // filiais herdam a saúde da matriz
            }
            try {
                PlanService.UsageSnapshot usage = planService.usageFor(market.getId());
                List<NetworkInvoice> invoices = invoiceRepository.findByMarket(market.getId());
                HealthAssessment health = assessHealth(market, usage, invoices);

                market.setHealthScore(health.score());
                market.setHealthUpdatedAt(LocalDateTime.now());
                marketRepository.save(market);
                updated++;
            } catch (Exception exc) {
                log.warn("Falha ao calcular saúde do mercado {}: {}", market.getId(), exc.getMessage());
            }
        }
        return updated;
    }

    // ── Atividades ───────────────────────────────────────────────────────────

    @Transactional
    public CustomerActivity addActivity(
        UUID marketId,
        CustomerActivity.Type type,
        String title,
        String body,
        String actorEmail
    ) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));

        CustomerActivity activity = new CustomerActivity();
        activity.setMarket(market);
        activity.setActivityType(type);
        activity.setTitle(title);
        activity.setBody(body);
        activity.setAutomated(false);
        activity.setActorEmail(actorEmail);
        return activityRepository.save(activity);
    }

    /**
     * Registra um evento do sistema na linha do tempo.
     *
     * Em transação própria para que a trilha sobreviva a um rollback da
     * operação que a originou — perder o registro justamente quando algo falhou
     * é o pior momento para ficar sem ele.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSystemActivity(
        Market market,
        CustomerActivity.Type type,
        String title,
        String body
    ) {
        try {
            CustomerActivity activity = new CustomerActivity();
            activity.setMarket(market);
            activity.setActivityType(type);
            activity.setTitle(title);
            activity.setBody(body);
            activity.setAutomated(true);
            activityRepository.save(activity);
        } catch (Exception exc) {
            log.warn("Falha ao registrar atividade automática: {}", exc.getMessage());
        }
    }

    // ── Tarefas ──────────────────────────────────────────────────────────────

    @Transactional
    public CustomerTask createTask(
        UUID marketId,
        String title,
        String description,
        LocalDate dueDate,
        CustomerTask.Priority priority,
        String assigneeEmail,
        String creatorEmail
    ) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));

        CustomerTask task = new CustomerTask();
        task.setMarket(market);
        task.setTitle(title);
        task.setDescription(description);
        task.setDueDate(dueDate);
        task.setPriority(priority != null ? priority : CustomerTask.Priority.NORMAL);
        task.setAssigneeEmail(assigneeEmail);
        task.setCreatedBy(creatorEmail);
        return taskRepository.save(task);
    }

    @Transactional
    public CustomerTask completeTask(UUID taskId, String actorEmail) {
        CustomerTask task = taskRepository.findById(taskId)
            .orElseThrow(() -> new IllegalArgumentException("Tarefa não encontrada"));
        task.setStatus(CustomerTask.Status.DONE);
        task.setCompletedAt(LocalDateTime.now());
        task.setCompletedBy(actorEmail);
        return taskRepository.save(task);
    }

    @Transactional
    public void cancelTask(UUID taskId) {
        taskRepository.findById(taskId).ifPresent(task -> {
            task.setStatus(CustomerTask.Status.CANCELLED);
            taskRepository.save(task);
        });
    }

    @Transactional(readOnly = true)
    public List<CustomerTask> openTasks() {
        return taskRepository.findOpen();
    }

    @Transactional
    public Market assignOwner(UUID marketId, String ownerEmail) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
        market.setAccountOwnerEmail(ownerEmail);
        return marketRepository.save(market);
    }

    // ── Lista de clientes ────────────────────────────────────────────────────

    /** Contas com os dados que a lista do CRM precisa, ordenadas por risco. */
    @Transactional(readOnly = true)
    public List<CustomerSummary> listCustomers() {
        List<CustomerSummary> customers = new ArrayList<>();

        for (Market market : marketRepository.findAll()) {
            if (market.getParentMarket() != null) {
                continue; // filiais aparecem dentro da ficha da matriz
            }
            try {
                PlanService.UsageSnapshot usage = planService.usageFor(market.getId());
                List<NetworkInvoice> invoices = invoiceRepository.findByMarket(market.getId());
                HealthAssessment health = assessHealth(market, usage, invoices);
                NetworkContract contract = contractRepository.findActiveByMarket(market.getId())
                    .orElse(null);

                long overdueCents = invoices.stream()
                    .filter(NetworkInvoice::isOverdue)
                    .mapToLong(NetworkInvoice::getAmountDueCents)
                    .sum();

                customers.add(new CustomerSummary(
                    market.getId(),
                    market.getName(),
                    market.getCnpj(),
                    market.getContactEmail(),
                    usage.limits().plan().name(),
                    planCatalogService.entryFor(usage.limits().plan()).getDisplayName(),
                    market.getBillingStatus() != null ? market.getBillingStatus().name() : null,
                    Boolean.TRUE.equals(market.getIsActive()),
                    resolvePrice(market, contract),
                    usage.invoicesUsed(),
                    usage.usagePercent(),
                    usage.branchCount(),
                    usage.pdvCount(),
                    overdueCents,
                    health.score(),
                    health.band(),
                    market.getAccountOwnerEmail(),
                    market.getCreatedAt()
                ));
            } catch (Exception exc) {
                log.warn("Falha ao montar resumo do mercado {}: {}", market.getId(), exc.getMessage());
            }
        }

        // Risco primeiro: é a ordem em que o time comercial deve trabalhar.
        customers.sort(Comparator.comparingInt(CustomerSummary::healthScore));
        return customers;
    }

    private int resolvePrice(Market market, NetworkContract contract) {
        if (contract != null && contract.getMonthlyPriceCents() != null) {
            return contract.getMonthlyPriceCents();
        }
        if (market.getCustomPriceCents() != null && market.getCustomPriceCents() > 0) {
            return market.getCustomPriceCents();
        }
        PlanType plan = market.getPlanType() != null ? market.getPlanType() : PlanType.FREE;
        Integer catalogPrice = planCatalogService.entryFor(plan).getMonthlyPriceCents();
        return catalogPrice != null && catalogPrice > 0 ? catalogPrice : 0;
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record HealthAssessment(int score, String band, List<String> reasons) {}

    public record CustomerSummary(
        UUID marketId, String name, String cnpj, String contactEmail,
        String planCode, String planName, String billingStatus, boolean active,
        int monthlyPriceCents,
        int invoicesUsed, int usagePercent,
        int branchCount, int pdvCount,
        long overdueCents,
        int healthScore, String healthBand,
        String accountOwnerEmail,
        LocalDateTime createdAt
    ) {}

    public record CustomerProfile(
        UUID marketId, String name, String cnpj,
        String contactName, String contactEmail, String contactPhone,
        String city, String state,
        String planCode, String planName, String billingStatus, boolean active,
        int monthlyPriceCents,
        long openCents, long overdueCents, long lifetimeCents,
        long customerDays,
        String accountOwnerEmail,
        HealthAssessment health,
        PlanService.UsageSnapshot usage,
        NetworkContract contract,
        List<NetworkInvoice> invoices,
        List<CustomerActivity> timeline,
        List<CustomerTask> tasks,
        List<SubscriptionEvent> subscriptionEvents,
        LocalDateTime createdAt
    ) {}
}
