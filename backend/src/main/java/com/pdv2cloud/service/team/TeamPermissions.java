package com.pdv2cloud.service.team;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * O que cada papel pode fazer, por área do app. A rota pergunta "pode
 * comprar?" e não "é dono ou gerente?": papel novo não exige mexer em rota.
 *
 * <pre>
 *              ler    equipe  assinatura  confere  compras  operação
 * Dono          sim    sim     sim         sim      sim      sim
 * Gerente       sim    —       ver         sim      sim      sim
 * Comprador     sim    —       ver         sim      sim      Copiloto de compras
 * Conferente    só o Confere   ver         sim      —        —
 * Financeiro    sim    —       sim         —        —        —
 * Leitura       sim    —       ver         —        —        —
 * </pre>
 */
public final class TeamPermissions {

    public enum Area { TEAM, BILLING, CONFERE, PURCHASING, COPILOT_DECISION, OPERATION, READ_LIKE }

    public record Access(Area area, boolean write) {}

    private static final Pattern MARKET_PATH = Pattern.compile("^/api/v1/markets/[0-9a-fA-F-]{36}(/.*)?$");

    private TeamPermissions() {
    }

    /** Área da rota e se ela altera algo. Null quando não é rota de mercado. */
    public static Access classify(String method, String uri) {
        if (uri == null) {
            return null;
        }
        Matcher m = MARKET_PATH.matcher(uri);
        if (!m.matches()) {
            return null;
        }
        String rest = m.group(1) == null ? "" : m.group(1);
        boolean write = !("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method));
        return new Access(area(rest, write), write);
    }

    static Area area(String rest, boolean write) {
        if (rest.startsWith("/team")) {
            return Area.TEAM;
        }
        if (rest.startsWith("/billing") || rest.startsWith("/ai-credits/orders")
            || (rest.startsWith("/subscription") && !rest.startsWith("/subscription/overview") && write)) {
            return Area.BILLING;
        }
        if (rest.startsWith("/confere")) {
            return Area.CONFERE;
        }
        if (rest.startsWith("/supplier-orders") || rest.startsWith("/suppliers") || rest.startsWith("/shopping-list")
            || rest.startsWith("/purchase-history") || rest.matches("^/opportunities/recommendations/[^/]+/(order|decide|undo)$")) {
            return Area.PURCHASING;
        }
        if (rest.matches("^/copilot/decisions/[^/]+/(approve|refuse|undo)$")) {
            return Area.COPILOT_DECISION;
        }
        // Ações que só leem: perguntar ao Copiloto, pedir explicação, marcar aviso como lido.
        if (rest.equals("/ai/chat") || rest.matches("^/copilot/decisions/[^/]+/explain$") || rest.matches("^/opportunities/[^/]+/explain$")
            || rest.matches("^/notifications/[^/]+/read$") || rest.matches("^/alerts/.*read.*$") || rest.equals("/opportunities/seen")) {
            return Area.READ_LIKE;
        }
        return Area.OPERATION;
    }

    /**
     * O papel pode? Para {@link Area#COPILOT_DECISION}, {@code purchasingDecision}
     * diz se a decisão é de um agente de compras (Compras, Recebimento).
     */
    public static boolean allowed(TeamRole role, Access access, boolean purchasingDecision) {
        if (role == null || role == TeamRole.DONO) {
            return true;
        }
        Area area = access.area();
        if (area == Area.TEAM) {
            return false;
        }
        if (role == TeamRole.CONFERENTE) {
            // Só o Confere (a casca do app é liberada à parte: conferenteShellRead).
            return area == Area.CONFERE;
        }
        if (!access.write() || area == Area.READ_LIKE) {
            return true;
        }
        return switch (role) {
            case GERENTE -> area != Area.BILLING;
            case COMPRADOR -> area == Area.CONFERE || area == Area.PURCHASING || (area == Area.COPILOT_DECISION && purchasingDecision);
            case FINANCEIRO -> area == Area.BILLING;
            case LEITURA -> false;
            default -> true;
        };
    }

    /** Frase para o 403. */
    public static String message(TeamRole role) {
        return "Seu papel na equipe (" + role.label() + ") não permite esta ação. Fale com o dono da conta.";
    }

    /** O que o conferente usa fora do Confere: dados da loja, faixa da assinatura e avisos. */
    public static boolean conferenteShellRead(String method, String uri) {
        Matcher m = MARKET_PATH.matcher(uri == null ? "" : uri);
        if (!m.matches()) {
            return false;
        }
        String rest = m.group(1) == null ? "" : m.group(1);
        if ("GET".equals(method)) {
            return rest.isEmpty() || rest.equals("/subscription") || rest.equals("/notifications");
        }
        return "POST".equals(method) && rest.matches("^/notifications/[^/]+/read$");
    }
}
