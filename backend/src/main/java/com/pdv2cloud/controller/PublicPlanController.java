package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.PlanType;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Catálogo público de planos.
 *
 * Rota aberta porque a página de cadastro precisa mostrar os limites antes de o
 * usuário ter conta — a proposta do gratuito ("1.000 notas/mês, sem cartão") é
 * justamente o que o convence a se cadastrar. Não expõe dado algum de cliente.
 */
@RestController
@RequestMapping("/api/v1/plans")
public class PublicPlanController {

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listPlans() {
        List<Map<String, Object>> plans = new ArrayList<>();
        for (PlanType plan : PlanType.values()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", plan.name());
            item.put("name", plan.getDisplayName());
            item.put("monthlyPriceCents", plan.getMonthlyPriceCents());
            item.put("monthlyInvoices", plan.getMonthlyInvoiceLimit());
            item.put("branches", plan.getBranchLimit());
            item.put("pdvsPerBranch", plan.getPdvPerBranchLimit());
            item.put("pdvs", plan.getPdvLimit());
            item.put("seats", plan.getUserSeatLimit());
            item.put("historyDays", plan.getHistoryRetentionDays());
            item.put("fullInsights", plan.hasFullInsights());
            item.put("free", plan.isFree());
            item.put("custom", plan.isCustom());
            item.put("highlights", highlightsFor(plan));
            plans.add(item);
        }
        return ResponseEntity.ok(plans);
    }

    private List<String> highlightsFor(PlanType plan) {
        return switch (plan) {
            case FREE -> List.of(
                "1.000 notas fiscais por mês",
                "1 loja e 1 PDV",
                "2 usuários",
                "90 dias de histórico",
                "Prévia da inteligência de capital e promoções",
                "Sem cartão de crédito"
            );
            case ESSENCIAL -> List.of(
                "15.000 notas fiscais por mês",
                "1 loja com até 3 PDVs",
                "5 usuários",
                "1 ano de histórico",
                "Inteligência completa de capital de giro",
                "Plano de compra por orçamento",
                "Efeito de tração e recomendação de promoções"
            );
            case PROFISSIONAL -> List.of(
                "50.000 notas fiscais por mês",
                "Até 3 lojas, 4 PDVs por loja (10 no total)",
                "15 usuários",
                "2 anos de histórico",
                "Tudo do Essencial",
                "Visão consolidada da rede"
            );
            case REDE -> List.of(
                "Volume sob medida",
                "Lojas e PDVs conforme sua operação",
                "Usuários sob medida",
                "Histórico completo",
                "Inteligência completa",
                "Suporte prioritário"
            );
        };
    }
}
