package com.pdv2cloud.security;

import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.tenancy.TenantContext;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Isolamento de tenant garantido por arquitetura (Fase 1 do plano multi-tenant).
 *
 * Após a autenticação, resolve o tenant do principal (usuário web ou agente) e:
 *  1. popula o {@link TenantContext}, consumido pelo TenantAwareDataSource para
 *     propagar o tenant ao PostgreSQL (Row-Level Security);
 *  2. valida automaticamente qualquer rota com {marketId} no path
 *     (/api/v1/markets/{marketId}/**), rejeitando com 403 divergências entre o
 *     marketId da URL e o tenant do usuário autenticado — sem depender de
 *     chamadas manuais a MarketAccessService em cada endpoint.
 *
 * ADMIN e SUPER_ADMIN mantêm escopo global (bypass), como já ocorria em
 * MarketAccessService.assertCanAccessMarket.
 */
@Component
@Profile("!jobs")
@Slf4j
public class TenantAccessFilter extends OncePerRequestFilter {

    private static final Pattern MARKET_PATH = Pattern.compile(
        "^/api/v1(?:/super-admin)?/markets/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:/.*)?$");

    /** Na conta só para consulta, estas áreas seguem liberadas: pagar, comprar créditos, conferir notas, ler avisos. */
    private static final Pattern RESTRICTED_ALLOWED = Pattern.compile(
        "^/api/v1/markets/[^/]+/(billing|subscription|notifications|ai-credits|confere)(/.*)?$");

    @Autowired(required = false)
    private NamedParameterJdbcTemplate jdbc;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            TenantContext.clear();
            populateTenantContext();

            UUID pathMarketId = extractMarketId(request.getRequestURI());
            if (pathMarketId != null && !canAccess(pathMarketId)) {
                log.warn("Cross-tenant access blocked: path marketId={} uri={}", pathMarketId, request.getRequestURI());
                writeForbidden(response);
                return;
            }
            if (pathMarketId != null && blockedByRestriction(request, pathMarketId)) {
                writeRestricted(response);
                return;
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    private void populateTenantContext() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
            || !authentication.isAuthenticated()
            || authentication instanceof AnonymousAuthenticationToken) {
            return;
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof AgentPrincipal agentPrincipal) {
            TenantContext.set(new TenantContext.TenantInfo(agentPrincipal.getMarketId(), false));
        } else if (principal instanceof AppUserDetails userDetails) {
            boolean bypass = userDetails.getRole() == UserRole.ADMIN || userDetails.getRole() == UserRole.SUPER_ADMIN;
            TenantContext.set(new TenantContext.TenantInfo(userDetails.getMarketId(), bypass));
        }
    }

    private boolean canAccess(UUID pathMarketId) {
        TenantContext.TenantInfo info = TenantContext.get();
        if (info == null) {
            // Não autenticado: a autorização por rota (401) decide adiante.
            return true;
        }
        return info.bypassTenantIsolation() || pathMarketId.equals(info.marketId());
    }

    /**
     * Conta restrita (pagamento em aberto além da carência): o lojista consulta
     * tudo, mas não altera. O agente do PDV segue enviando as notas, para não
     * perder vendas; superadmin não é afetado.
     */
    private boolean blockedByRestriction(HttpServletRequest request, UUID marketId) {
        String method = request.getMethod();
        if (jdbc == null || "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            return false;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AppUserDetails user)
            || user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.SUPER_ADMIN) {
            return false;
        }
        if (RESTRICTED_ALLOWED.matcher(request.getRequestURI()).matches()) {
            return false;
        }
        try {
            return jdbc.queryForList("select billing_status from markets where id = :m",
                java.util.Map.of("m", marketId), String.class).contains("RESTRICTED");
        } catch (RuntimeException ex) {
            log.warn("Não consegui ler o estado da assinatura de {}: {}", marketId, ex.getMessage());
            return false;
        }
    }

    private void writeRestricted(HttpServletResponse response) throws IOException {
        response.setStatus(402);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"account_restricted\",\"state\":\"RESTRICTED\",\"userMessage\":"
            + "\"Sua conta está só para consulta porque há um pagamento em aberto. Regularize em Assinatura para voltar a alterar.\"}");
    }

    private UUID extractMarketId(String uri) {
        if (uri == null) {
            return null;
        }
        Matcher matcher = MARKET_PATH.matcher(uri);
        if (!matcher.matches()) {
            return null;
        }
        try {
            return UUID.fromString(matcher.group(1));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private void writeForbidden(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"Forbidden\",\"message\":\"Access to this market is not allowed\"}");
    }
}
