package com.pdv2cloud.service.ai.agents;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Guarda do nível 3 (proposta, seção 6.3): o agente só age sozinho se tudo
 * isto valer ao mesmo tempo, senão a decisão fica esperando o sim como no
 * nível 2:
 * <ol>
 *   <li>autonomia liberada pela plataforma e não pausada pelo lojista;</li>
 *   <li>aceite explícito do lojista para este agente;</li>
 *   <li>valor da ação dentro do teto por ação e, somado ao que já foi feito
 *       sozinho hoje, dentro do teto do dia;</li>
 *   <li>todos os itens com fornecedor habitual na lista de permitidos.</li>
 * </ol>
 */
@Component
public class AutonomyGuard {

    private final NamedParameterJdbcTemplate jdbc;
    private final CopilotSettingsService settings;

    public AutonomyGuard(NamedParameterJdbcTemplate jdbc, CopilotSettingsService settings) {
        this.jdbc = jdbc;
        this.settings = settings;
    }

    /** Motivo para NÃO agir sozinho, ou null quando pode. */
    @SuppressWarnings("unchecked")
    public String blockReason(UUID marketId, AgentSignal s, CopilotSettingsService.AgentSettings cfg) {
        CopilotSettingsService.Autonomy a = cfg.autonomy();
        if (cfg.level() < 3 || !CopilotSettingsService.AUTONOMOUS.contains(s.agent()) || !s.actionable()) {
            return "nivel";
        }
        if (!settings.autonomyConfig().enabled()) {
            return "autonomia não liberada pela plataforma";
        }
        if (settings.autonomyPaused(marketId)) {
            return "pausado pelo lojista";
        }
        if (a.acceptedAt() == null) {
            return "sem aceite do lojista";
        }
        BigDecimal value = ComprasAgent.decimal(s.numbers().get("valorEstimado"));
        if (value.signum() <= 0) {
            return "sem valor estimado";
        }
        if (a.cap() == null || value.compareTo(a.cap()) > 0) {
            return "acima do teto por pedido";
        }
        BigDecimal today = jdbc.queryForObject("select coalesce(sum(cast(numbers->>'valorEstimado' as numeric)), 0) from ai_decisions "
                + "where market_id = :m and auto_executed and undone_at is null and decided_at >= date_trunc('day', now())",
            Map.of("m", marketId), BigDecimal.class);
        if (a.dailyCap() == null || (today == null ? BigDecimal.ZERO : today).add(value).compareTo(a.dailyCap()) > 0) {
            return "acima do teto do dia";
        }
        List<String> ids = (List<String>) s.payload().getOrDefault("recommendationIds", List.of());
        if (ids.isEmpty()) {
            return "sem itens";
        }
        // Fornecedor habitual de cada item: o do pedido mais recente daquele produto.
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select distinct on (r.id) r.id, o.supplier_id from recommendations r "
                + "join opportunities op on op.id = r.opportunity_id "
                + "left join supplier_order_items i on i.product_id = coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) "
                + "left join supplier_orders o on o.id = i.supplier_order_id and o.market_id = r.market_id "
                + "where r.market_id = :m and r.id in (:ids) order by r.id, o.created_at desc nulls last",
            new MapSqlParameterSource().addValue("m", marketId).addValue("ids", ids.stream().map(UUID::fromString).toList()));
        for (Map<String, Object> r : rows) {
            Object supplier = r.get("supplier_id");
            if (supplier == null || !a.allowedSuppliers().contains(String.valueOf(supplier))) {
                return "fornecedor fora da lista";
            }
        }
        return rows.size() == ids.size() ? null : "itens mudaram";
    }
}
