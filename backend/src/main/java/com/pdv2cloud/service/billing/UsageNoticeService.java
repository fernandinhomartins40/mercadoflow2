package com.pdv2cloud.service.billing;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Aviso de limite: 80% e 100% das notas da semana, uma vez por semana cada.
 * Roda com o ciclo diário das assinaturas.
 */
@Service
public class UsageNoticeService {

    private static final Logger log = LoggerFactory.getLogger(UsageNoticeService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final PlanService plans;
    private final NotificationService notifications;

    public UsageNoticeService(NamedParameterJdbcTemplate jdbc, PlanService plans, NotificationService notifications) {
        this.jdbc = jdbc;
        this.plans = plans;
        this.notifications = notifications;
    }

    /** Devolve quantos avisos novos saíram. */
    public int run() {
        int sent = 0;
        List<UUID> roots = jdbc.queryForList("select id from markets where parent_market_id is null and coalesce(is_active, true)",
            Map.of(), UUID.class);
        for (UUID root : roots) {
            try {
                PlanService.UsageSnapshot u = plans.usageFor(root);
                int limit = u.limits().monthlyInvoices();
                if (PlanType.isUnlimited(limit) || limit <= 0) {
                    continue;
                }
                int pct = u.usagePercent();
                String plan = u.limits().plan().getDisplayName();
                if (pct >= 100) {
                    sent += notifications.notify(root, "LIMIT_REACHED", "limit-100:" + u.cycleStart(), NotificationService.Severity.WARNING,
                        "Limite semanal de notas atingido", "As notas que passarem do limite entram na segunda-feira.",
                        "Ver planos", "/app/planos", true, Map.of("plano", plan, "dias", String.valueOf(pct))) ? 1 : 0;
                } else if (pct >= 80) {
                    sent += notifications.notify(root, "LIMIT_NEAR", "limit-80:" + u.cycleStart(), NotificationService.Severity.INFO,
                        "Você já usou " + pct + "% das notas desta semana", "O plano está perto do limite semanal de notas.",
                        "Ver planos", "/app/planos", true, Map.of("plano", plan, "dias", String.valueOf(pct))) ? 1 : 0;
                }
            } catch (RuntimeException e) {
                log.warn("Aviso de limite falhou para {}: {}", root, e.getMessage());
            }
        }
        return sent;
    }
}
