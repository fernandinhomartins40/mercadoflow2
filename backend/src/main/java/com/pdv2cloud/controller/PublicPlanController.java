package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanCatalogService;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Catálogo público de planos.
 *
 * Rota aberta porque a página de cadastro precisa mostrar os limites antes de o
 * usuário ter conta — a proposta do gratuito é justamente o que o convence a se
 * cadastrar. Não expõe dado algum de cliente.
 *
 * Lê do catálogo editável pelo painel, então um preço alterado ali aparece aqui
 * sem deploy.
 */
@RestController
@RequestMapping("/api/v1/plans")
public class PublicPlanController {

    private final PlanCatalogService planCatalogService;

    public PublicPlanController(PlanCatalogService planCatalogService) {
        this.planCatalogService = planCatalogService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listPlans() {
        List<Map<String, Object>> plans = new ArrayList<>();
        for (PlanCatalogEntry entry : planCatalogService.listActive()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", entry.getCode());
            item.put("name", entry.getDisplayName());
            item.put("description", entry.getDescription());
            item.put("monthlyPriceCents", entry.getMonthlyPriceCents());
            item.put("monthlyInvoices", entry.getMonthlyInvoiceLimit());
            item.put("branches", entry.getBranchLimit());
            item.put("pdvsPerBranch", entry.getPdvPerBranchLimit());
            item.put("pdvs", entry.getPdvLimit());
            item.put("seats", entry.getUserSeatLimit());
            item.put("historyDays", entry.getHistoryRetentionDays());
            item.put("fullInsights", entry.getFullInsights());
            item.put("free", PlanType.FREE.name().equals(entry.getCode()));
            item.put("custom", entry.getMonthlyPriceCents() == null || entry.getMonthlyPriceCents() < 0);
            item.put("purchasable", entry.getPurchasable());
            item.put("highlights", highlightsFor(entry));
            plans.add(item);
        }
        return ResponseEntity.ok(plans);
    }

    /**
     * Destaques derivados dos limites reais do catálogo.
     *
     * Gerados a partir dos números em vez de textos fixos: assim um limite
     * alterado no painel não deixa a página de preços mentindo.
     */
    private List<String> highlightsFor(PlanCatalogEntry entry) {
        List<String> items = new ArrayList<>();

        items.add(limitText(entry.getMonthlyInvoiceLimit(), "notas fiscais por mês", "Notas fiscais ilimitadas"));

        boolean singleBranch = entry.getBranchLimit() != null && entry.getBranchLimit() == 1;
        if (singleBranch) {
            items.add(entry.getPdvPerBranchLimit() != null && entry.getPdvPerBranchLimit() == 1
                ? "1 loja e 1 PDV"
                : "1 loja com até " + format(entry.getPdvPerBranchLimit()) + " PDVs");
        } else if (isUnlimited(entry.getBranchLimit())) {
            items.add("Lojas e PDVs conforme sua operação");
        } else {
            items.add(String.format(
                "Até %s lojas, %s PDVs por loja (%s no total)",
                format(entry.getBranchLimit()),
                format(entry.getPdvPerBranchLimit()),
                format(entry.getPdvLimit())
            ));
        }

        items.add(limitText(entry.getUserSeatLimit(), "usuários", "Usuários ilimitados"));

        Integer days = entry.getHistoryRetentionDays();
        if (isUnlimited(days)) {
            items.add("Histórico completo");
        } else if (days != null && days >= 365) {
            int years = days / 365;
            items.add(years == 1 ? "1 ano de histórico" : years + " anos de histórico");
        } else {
            items.add(format(days) + " dias de histórico");
        }

        items.add(Boolean.TRUE.equals(entry.getFullInsights())
            ? "Inteligência completa de capital de giro e promoções"
            : "Prévia da inteligência de capital e promoções");

        if (entry.getMonthlyPriceCents() != null && entry.getMonthlyPriceCents() == 0) {
            items.add("Sem cartão de crédito");
        }
        return items;
    }

    private static boolean isUnlimited(Integer value) {
        return value == null || value < 0;
    }

    private String limitText(Integer value, String suffix, String unlimitedText) {
        return isUnlimited(value) ? unlimitedText : format(value) + " " + suffix;
    }

    private String format(Integer value) {
        if (value == null) {
            return "—";
        }
        return NumberFormat.getIntegerInstance(Locale.of("pt", "BR")).format(value);
    }
}
