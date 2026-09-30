package com.pdv2cloud.service.ai.platform;

import com.pdv2cloud.tenancy.TenantContext;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Portão da IA da plataforma: decide se uma tarefa de um mercado pode usar a
 * chave da plataforma agora, e cobra depois do uso.
 *
 * Ordem das checagens (a primeira que falha decide):
 * <ol>
 *   <li>tarefa roteada e ligada; camada TEXTO PRONTO não usa modelo;</li>
 *   <li>interruptor geral ligado;</li>
 *   <li>modo piloto: só mercados da lista de teste;</li>
 *   <li>chave do provedor cadastrada e ligada;</li>
 *   <li>teto de gasto diário global da plataforma;</li>
 *   <li>créditos do mercado e teto mensal dele.</li>
 * </ol>
 * Quando a plataforma não atende, o orquestrador segue o caminho antigo (chave
 * própria do mercado, se houver) e, por fim, o texto do sistema: sem crédito,
 * nada quebra.
 */
@Service
public class AiGate {

    public enum Reason { OK, TEMPLATE, DISABLED_TASK, PLATFORM_OFF, NOT_PILOT, NO_KEY, DAILY_BUDGET, NO_CREDITS }

    public record Decision(Reason reason, AiPlatformConfig.Route route, AiPlatformConfig.Key key) {
        public boolean allowed() {
            return reason == Reason.OK;
        }

        public String model() {
            return route.model() != null && !route.model().isBlank() ? route.model() : key.defaultModel();
        }

        /** Frase para a tela quando a plataforma não atende. */
        public String message() {
            return switch (reason) {
                case NO_CREDITS -> "Seus créditos de IA acabaram (ou atingiram o teto do mês). Compre um pacote em Configurações.";
                case NOT_PILOT, PLATFORM_OFF -> "A IA do MercadoFlow ainda não está liberada para o seu mercado.";
                case DAILY_BUDGET -> "A IA está em pausa por hoje. Tente novamente amanhã.";
                default -> "A IA não está disponível para esta tarefa agora.";
            };
        }
    }

    private final AiPlatformConfig config;
    private final AiWalletService wallets;
    private final NamedParameterJdbcTemplate jdbc;

    /** Gasto do dia em cache curto: a soma é global e roda a cada chamada. */
    private volatile double spentCache = -1;
    private volatile long spentAt = 0;

    public AiGate(AiPlatformConfig config, AiWalletService wallets, NamedParameterJdbcTemplate jdbc) {
        this.config = config;
        this.wallets = wallets;
        this.jdbc = jdbc;
    }

    public Decision decide(UUID marketId, String task) {
        Optional<AiPlatformConfig.Route> maybe = config.route(task);
        if (maybe.isEmpty() || !maybe.get().enabled()) {
            return new Decision(Reason.DISABLED_TASK, maybe.orElse(null), null);
        }
        AiPlatformConfig.Route route = maybe.get();
        if ("TEMPLATE".equals(route.layer())) {
            return new Decision(Reason.TEMPLATE, route, null);
        }
        AiPlatformConfig.Settings s = config.settings();
        if (!s.enabled()) {
            return new Decision(Reason.PLATFORM_OFF, route, null);
        }
        if (s.pilotOnly() && !config.isPilot(marketId)) {
            return new Decision(Reason.NOT_PILOT, route, null);
        }
        Optional<AiPlatformConfig.Key> key = config.key(route.provider());
        if (key.isEmpty()) {
            return new Decision(Reason.NO_KEY, route, null);
        }
        if (spentTodayUsd() >= s.dailyBudgetUsd().doubleValue()) {
            return new Decision(Reason.DAILY_BUDGET, route, key.get());
        }
        if (!wallets.canSpend(marketId, route.creditsPerUse())) {
            return new Decision(Reason.NO_CREDITS, route, key.get());
        }
        return new Decision(Reason.OK, route, key.get());
    }

    /** Custo em dólar de uma chamada, pelos preços de referência da rota. */
    public static double costUsd(AiPlatformConfig.Route route, Integer inputTokens, Integer outputTokens) {
        double in = inputTokens == null ? 0 : inputTokens;
        double out = outputTokens == null ? 0 : outputTokens;
        return (in * route.inputPriceUsdM().doubleValue() + out * route.outputPriceUsdM().doubleValue()) / 1_000_000d;
    }

    /** Console de teste do superadmin: roda a tarefa de verdade sem debitar o mercado. */
    private static final ThreadLocal<Boolean> NO_CHARGE = new ThreadLocal<>();

    public static <T> T withoutCharge(java.util.function.Supplier<T> work) {
        NO_CHARGE.set(true);
        try {
            return work.get();
        } finally {
            NO_CHARGE.remove();
        }
    }

    /** Debita os créditos da tarefa depois de um uso bem-sucedido. */
    public int charge(UUID marketId, AiPlatformConfig.Route route, String reference) {
        spentCache = -1;
        if (Boolean.TRUE.equals(NO_CHARGE.get())) {
            return 0;
        }
        return wallets.debit(marketId, route.creditsPerUse(), route.task(), reference) ? route.creditsPerUse() : 0;
    }

    /** Soma do custo da plataforma hoje, em todos os mercados. */
    public double spentTodayUsd() {
        long now = System.currentTimeMillis();
        if (spentCache >= 0 && now - spentAt < 60_000) {
            return spentCache;
        }
        BigDecimal v = TenantContext.runAsSystem(() -> jdbc.queryForObject(
            "select coalesce(sum(cost_usd), 0) from ai_usage_log where platform and created_at >= current_date",
            Map.of(), BigDecimal.class));
        spentCache = v == null ? 0 : v.doubleValue();
        spentAt = now;
        return spentCache;
    }
}
