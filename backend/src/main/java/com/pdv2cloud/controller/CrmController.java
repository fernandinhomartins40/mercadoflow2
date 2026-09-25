package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.entity.CustomerActivity;
import com.pdv2cloud.model.entity.CustomerTask;
import com.pdv2cloud.model.entity.DunningLog;
import com.pdv2cloud.model.entity.DunningRule;
import com.pdv2cloud.service.CrmService;
import com.pdv2cloud.service.CsvExportService;
import com.pdv2cloud.service.DunningService;
import jakarta.validation.constraints.NotBlank;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * CRM comercial do super admin.
 *
 * Separado de SubscriptionAdminController, que trata do estado da assinatura;
 * aqui fica o trabalho sobre a conta — ficha do cliente, histórico do
 * relacionamento, follow-ups, régua de cobrança e exportações.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/crm")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class CrmController {

    private final CrmService crmService;
    private final DunningService dunningService;
    private final CsvExportService csvExportService;

    public CrmController(
        CrmService crmService,
        DunningService dunningService,
        CsvExportService csvExportService
    ) {
        this.crmService = crmService;
        this.dunningService = dunningService;
        this.csvExportService = csvExportService;
    }

    // ── Clientes ─────────────────────────────────────────────────────────────

    /** Lista de contas ordenada por risco — a fila de trabalho comercial. */
    @GetMapping("/customers")
    public ResponseEntity<List<CrmService.CustomerSummary>> customers() {
        return ResponseEntity.ok(crmService.listCustomers());
    }

    /** Ficha 360: assinatura, consumo, faturas, histórico e tarefas. */
    @GetMapping("/customers/{marketId}")
    public ResponseEntity<CrmService.CustomerProfile> customer(
        @PathVariable("marketId") UUID marketId
    ) {
        return ResponseEntity.ok(crmService.profileOf(marketId));
    }

    @PatchMapping("/customers/{marketId}/owner")
    public ResponseEntity<Map<String, Object>> assignOwner(
        @PathVariable("marketId") UUID marketId,
        @RequestBody AssignOwnerRequest request
    ) {
        crmService.assignOwner(marketId, request.getOwnerEmail());
        return ResponseEntity.ok(Map.of("assigned", true));
    }

    /** Recalcula a saúde de todas as contas sob demanda. */
    @PostMapping("/health/refresh")
    public ResponseEntity<Map<String, Object>> refreshHealth() {
        return ResponseEntity.ok(Map.of("updated", crmService.refreshAllHealthScores()));
    }

    // ── Atividades ───────────────────────────────────────────────────────────

    @PostMapping("/customers/{marketId}/activities")
    public ResponseEntity<CustomerActivity> addActivity(
        @PathVariable("marketId") UUID marketId,
        @RequestBody ActivityRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(crmService.addActivity(
            marketId,
            request.getActivityType() != null ? request.getActivityType() : CustomerActivity.Type.NOTE,
            request.getTitle(),
            request.getBody(),
            authentication.getName()
        ));
    }

    // ── Tarefas ──────────────────────────────────────────────────────────────

    /** Follow-ups abertos de todas as contas, mais urgentes primeiro. */
    @GetMapping("/tasks")
    public ResponseEntity<List<CustomerTask>> tasks() {
        return ResponseEntity.ok(crmService.openTasks());
    }

    @PostMapping("/customers/{marketId}/tasks")
    public ResponseEntity<CustomerTask> createTask(
        @PathVariable("marketId") UUID marketId,
        @RequestBody TaskRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(crmService.createTask(
            marketId,
            request.getTitle(),
            request.getDescription(),
            request.getDueDate(),
            request.getPriority(),
            request.getAssigneeEmail(),
            authentication.getName()
        ));
    }

    @PostMapping("/tasks/{taskId}/complete")
    public ResponseEntity<CustomerTask> completeTask(
        @PathVariable("taskId") UUID taskId,
        Authentication authentication
    ) {
        return ResponseEntity.ok(crmService.completeTask(taskId, authentication.getName()));
    }

    @DeleteMapping("/tasks/{taskId}")
    public ResponseEntity<Void> cancelTask(@PathVariable("taskId") UUID taskId) {
        crmService.cancelTask(taskId);
        return ResponseEntity.noContent().build();
    }

    // ── Régua de cobrança ────────────────────────────────────────────────────

    @GetMapping("/dunning/rules")
    public ResponseEntity<List<DunningRule>> dunningRules() {
        return ResponseEntity.ok(dunningService.listRules());
    }

    @PostMapping("/dunning/rules")
    public ResponseEntity<DunningRule> saveRule(@RequestBody DunningRule rule) {
        return ResponseEntity.ok(dunningService.saveRule(rule));
    }

    @DeleteMapping("/dunning/rules/{ruleId}")
    public ResponseEntity<Void> deleteRule(@PathVariable("ruleId") UUID ruleId) {
        dunningService.deleteRule(ruleId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/dunning/logs")
    public ResponseEntity<List<DunningLog>> dunningLogs() {
        return ResponseEntity.ok(dunningService.recentLogs());
    }

    /** Dispara a régua na hora, sem esperar o job diário. */
    @PostMapping("/dunning/run")
    public ResponseEntity<DunningService.DunningRunResult> runDunning() {
        return ResponseEntity.ok(dunningService.run());
    }

    // ── Exportações ──────────────────────────────────────────────────────────

    @GetMapping(value = "/export/customers", produces = "text/csv")
    public ResponseEntity<byte[]> exportCustomers() {
        return csvResponse(csvExportService.customersCsv(), "clientes.csv");
    }

    @GetMapping(value = "/export/invoices", produces = "text/csv")
    public ResponseEntity<byte[]> exportInvoices() {
        return csvResponse(csvExportService.invoicesCsv(), "faturas.csv");
    }

    @GetMapping(value = "/export/overdue", produces = "text/csv")
    public ResponseEntity<byte[]> exportOverdue() {
        return csvResponse(csvExportService.overdueCsv(), "inadimplencia.csv");
    }

    private ResponseEntity<byte[]> csvResponse(String content, String filename) {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        headers.setContentDispositionFormData("attachment", filename);
        return new ResponseEntity<>(bytes, headers, org.springframework.http.HttpStatus.OK);
    }

    // ── Requests ─────────────────────────────────────────────────────────────

    @Data
    public static class AssignOwnerRequest {
        private String ownerEmail;
    }

    @Data
    public static class ActivityRequest {
        private CustomerActivity.Type activityType;
        @NotBlank(message = "Informe o título")
        private String title;
        private String body;
    }

    @Data
    public static class TaskRequest {
        @NotBlank(message = "Informe o título")
        private String title;
        private String description;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        private LocalDate dueDate;
        private CustomerTask.Priority priority;
        private String assigneeEmail;
    }
}
