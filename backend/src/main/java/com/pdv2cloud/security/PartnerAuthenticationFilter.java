package com.pdv2cloud.security;

import com.pdv2cloud.service.partner.PartnerAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Autentica o ERP parceiro pelo token de acesso ("Bearer mfp_...") emitido em
 * /api/v1/partner/oauth/token. Só atua nas rotas da API de parceiros; a loja
 * do caminho é autorizada depois, no TenantAccessFilter (consentimento da loja).
 */
@Component
@Profile("!jobs")
public class PartnerAuthenticationFilter extends OncePerRequestFilter {

    public static final String TOKEN_PREFIX = "mfp_";

    private final PartnerAuthService auth;

    public PartnerAuthenticationFilter(PartnerAuthService auth) {
        this.auth = auth;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri == null || !uri.startsWith("/api/v1/partner/") || uri.equals("/api/v1/partner/oauth/token")
            || uri.equals("/api/v1/partner/openapi.yaml");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer " + TOKEN_PREFIX)) {
            PartnerPrincipal principal = auth.authenticate(header.substring(7));
            if (principal != null) {
                if (!auth.allowRequest(principal.partnerId())) {
                    response.setStatus(429);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"erro\":\"Limite de requisicoes por minuto atingido. Tente de novo em instantes.\"}");
                    return;
                }
                UsernamePasswordAuthenticationToken token = new UsernamePasswordAuthenticationToken(
                    principal, null, List.of(new SimpleGrantedAuthority("ROLE_PARTNER")));
                SecurityContextHolder.getContext().setAuthentication(token);
            }
        }
        chain.doFilter(request, response);
    }
}
