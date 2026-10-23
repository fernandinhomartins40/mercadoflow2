package com.pdv2cloud.security;

import java.io.IOException;
import java.util.regex.Pattern;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Registra as requisições da API que passam do limite (padrão 800 ms), com
 * método, rota, status e tempo. Sem dado pessoal: ids viram {id} e a query
 * string não entra. Serve para achar a tela lenta pela rota, sem precisar
 * entrar na conta do cliente (23/10/2026: Início e Comprar com mais de 30 s).
 */
@Slf4j
@Component
@Profile("!jobs")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SlowRequestLogFilter extends OncePerRequestFilter {

    private static final Pattern UUID_SEGMENT = Pattern.compile(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern NUMBER_SEGMENT = Pattern.compile("/\\d+(?=/|$)");

    @Value("${app.slow-request-ms:800}")
    private long thresholdMs;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri == null || !uri.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            if (ms >= thresholdMs) {
                log.warn("Requisição lenta: {} {} -> {} em {} ms",
                    request.getMethod(), route(request.getRequestURI()), response.getStatus(), ms);
            }
        }
    }

    static String route(String uri) {
        String r = UUID_SEGMENT.matcher(uri).replaceAll("{id}");
        return NUMBER_SEGMENT.matcher(r).replaceAll("/{n}");
    }
}
