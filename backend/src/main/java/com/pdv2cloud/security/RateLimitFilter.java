package com.pdv2cloud.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> cache = new ConcurrentHashMap<>();
    /** Buckets do pareamento, chaveados por IP (nao ha API key nessas rotas). */
    private final Map<String, Bucket> pairingCache = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Pareamento do agente: rotas publicas, sem API key para identificar o
        // chamador. Limitamos por IP e com folga bem menor, porque /claim e
        // /session expoem um codigo de 8 caracteres a tentativa de adivinhacao.
        if (path.startsWith("/api/v1/agent-pairing")) {
            Bucket pairingBucket = pairingCache.computeIfAbsent(clientIp(request), key -> createPairingBucket());
            if (pairingBucket.tryConsume(1)) {
                filterChain.doFilter(request, response);
            } else {
                writeRateLimited(response);
            }
            return;
        }

        // Only apply rate limiting to agent endpoints
        if (!path.startsWith("/api/v1/agent") && !path.startsWith("/api/v1/ingest")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Get API Key from request
        String apiKey = request.getHeader("X-API-Key");
        if (apiKey == null || apiKey.isEmpty()) {
            apiKey = extractBearerToken(request.getHeader("Authorization"));
        }

        if (apiKey == null || apiKey.isEmpty()) {
            filterChain.doFilter(request, response);
            return;
        }

        Bucket bucket = resolveBucket(apiKey);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            writeRateLimited(response);
        }
    }

    private void writeRateLimited(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Rate limit exceeded\",\"message\":\"Too many requests. Please try again later.\"}");
    }

    private Bucket createPairingBucket() {
        // 30 req/min por IP: comporta o long-poll do agente (1 a cada 3s) com folga,
        // e ainda assim torna inviavel varrer o espaco de codigos de pareamento.
        Bandwidth limit = Bandwidth.classic(30, Refill.intervally(30, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    private Bucket resolveBucket(String apiKey) {
        return cache.computeIfAbsent(apiKey, key -> createNewBucket());
    }

    private Bucket createNewBucket() {
        // 100 requests per minute per API key
        Bandwidth limit = Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1)));
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }

    private String extractBearerToken(String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }
}
