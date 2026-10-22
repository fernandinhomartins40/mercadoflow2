package com.pdv2cloud.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
@Profile("!jobs")
public class RateLimitFilter extends OncePerRequestFilter {

    /*
     * Mapas em ordem de acesso (LinkedHashMap accessOrder), sempre usados dentro de
     * synchronized(mapa). Ao passar do teto saem os mais antigos, poupando os
     * buckets travados (sem fichas) -- antes um clear() zerava a trava de todos.
     */
    private final Map<String, Bucket> cache = new LinkedHashMap<>(16, 0.75f, true);
    /** Buckets do pareamento, chaveados por IP (nao ha API key nessas rotas). */
    private final Map<String, Bucket> pairingCache = new LinkedHashMap<>(16, 0.75f, true);
    /** Buckets de login e cadastro, chaveados por "tipo:ip" e "tipo:email". */
    private final Map<String, Bucket> authCache = new LinkedHashMap<>(16, 0.75f, true);

    /** Teto de chaves por mapa: sem ele uma varredura de IPs/e-mails cresce a memoria sem limite. */
    static final int MAX_KEYS = 50_000;
    /** Ao passar do teto, a limpeza desce até aqui (evita varrer o mapa a cada requisição). */
    private static final int TRIM_TO = MAX_KEYS * 9 / 10;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Login e cadastro: sem limite, a senha podia ser testada a vontade e
        // contas criadas em massa. Login conta por IP e por e-mail — o segundo
        // segura a forca bruta distribuida em muitos IPs contra uma conta so.
        if ("POST".equalsIgnoreCase(request.getMethod())) {
            if ("/api/v1/auth/login".equals(path) || "/api/v1/auth/login/2fa".equals(path) || "/api/v1/super-admin/auth/login".equals(path)
                || "/api/v1/super-admin/auth/login/2fa".equals(path)
                // Desistir da exclusão de conta confere a senha: mesmo limite do login (LGPD-03).
                || "/api/v1/auth/account-deletion/cancel".equals(path)) {
                String kind = path.startsWith("/api/v1/super-admin") ? "sa-login" : "login";
                CachedBodyHttpServletRequest cached = new CachedBodyHttpServletRequest(request);
                boolean allowed = consume(authCache, kind + ":ip:" + clientIp(request), this::createLoginIpBucket);
                String email = loginEmail(cached);
                if (allowed && email != null) {
                    allowed = consume(authCache, kind + ":email:" + email, this::createLoginEmailBucket);
                }
                if (allowed) {
                    filterChain.doFilter(cached, response);
                } else {
                    writeAuthRateLimited(response);
                }
                return;
            }
            // Nova senha: mesmo teto do cadastro, por IP (evita disparo de e-mails e chute de link).
            if ("/api/v1/auth/forgot-password".equals(path) || "/api/v1/auth/reset-password".equals(path)) {
                if (consume(authCache, "pwreset:ip:" + clientIp(request), this::createPasswordResetBucket)) {
                    filterChain.doFilter(request, response);
                } else {
                    writeAuthRateLimited(response);
                }
                return;
            }
            // Token OAuth do parceiro: o segredo é a credencial, então limitamos o chute por IP.
            if ("/api/v1/partner/oauth/token".equals(path)) {
                if (consume(authCache, "partner-token:ip:" + clientIp(request), this::createPartnerTokenBucket)) {
                    filterChain.doFilter(request, response);
                } else {
                    writeAuthRateLimited(response);
                }
                return;
            }
            if ("/api/v1/auth/register".equals(path)) {
                if (consume(authCache, "register:ip:" + clientIp(request), this::createRegisterBucket)) {
                    filterChain.doFilter(request, response);
                } else {
                    writeAuthRateLimited(response);
                }
                return;
            }
        }

        // Convite da equipe (ver e aceitar): rota pública com token na URL, limitada por IP.
        if (path.startsWith("/api/v1/public/invites/")) {
            if (consume(authCache, "invite:ip:" + clientIp(request), this::createInviteBucket)) {
                filterChain.doFilter(request, response);
            } else {
                writeAuthRateLimited(response);
            }
            return;
        }

        // Pareamento do agente: rotas publicas, sem API key para identificar o
        // chamador. Limitamos por IP e com folga bem menor, porque /claim e
        // /session expoem um codigo de 8 caracteres a tentativa de adivinhacao.
        if (path.startsWith("/api/v1/agent-pairing")) {
            if (consume(pairingCache, clientIp(request), this::createPairingBucket)) {
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

        if (consume(cache, apiKey, this::createNewBucket)) {
            filterChain.doFilter(request, response);
        } else {
            writeRateLimited(response);
        }
    }

    private boolean consume(Map<String, Bucket> buckets, String key, java.util.function.Supplier<Bucket> factory) {
        Bucket bucket;
        synchronized (buckets) {
            bucket = buckets.computeIfAbsent(key, k -> factory.get());
            if (buckets.size() > MAX_KEYS) {
                trim(buckets, key);
            }
        }
        return bucket.tryConsume(1);
    }

    /**
     * Remove os buckets acessados há mais tempo até {@link #TRIM_TO}. Primeiro passa
     * só pelos que ainda têm fichas (a trava de quem estourou o limite fica); se não
     * bastar, remove os mais antigos mesmo travados. A chave atual nunca sai.
     */
    private static void trim(Map<String, Bucket> buckets, String keep) {
        for (int pass = 0; pass < 2 && buckets.size() > TRIM_TO; pass++) {
            Iterator<Map.Entry<String, Bucket>> it = buckets.entrySet().iterator();
            while (it.hasNext() && buckets.size() > TRIM_TO) {
                Map.Entry<String, Bucket> e = it.next();
                if (e.getKey().equals(keep)) {
                    continue;
                }
                if (pass == 1 || e.getValue().getAvailableTokens() > 0) {
                    it.remove();
                }
            }
        }
    }

    private String loginEmail(CachedBodyHttpServletRequest request) {
        try {
            JsonNode email = JSON.readTree(request.getCachedBody()).get("email");
            if (email == null || !email.isTextual() || email.asText().isBlank()) {
                return null;
            }
            return email.asText().trim().toLowerCase(Locale.ROOT);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private void writeAuthRateLimited(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"Rate limit exceeded\",\"message\":\"Muitas tentativas. Aguarde alguns minutos e tente de novo.\"}");
    }

    private Bucket createLoginIpBucket() {
        // 20/min por IP: folga para varias pessoas atras do mesmo NAT da loja.
        return Bucket.builder().addLimit(Bandwidth.classic(20, Refill.intervally(20, Duration.ofMinutes(1)))).build();
    }

    private Bucket createLoginEmailBucket() {
        // 10 tentativas a cada 15 min por conta.
        return Bucket.builder().addLimit(Bandwidth.classic(10, Refill.intervally(10, Duration.ofMinutes(15)))).build();
    }

    private Bucket createPasswordResetBucket() {
        // 10 a cada 15 min por IP: cabe a loja inteira atrás do mesmo NAT, não cabe disparo de e-mails.
        return Bucket.builder().addLimit(Bandwidth.classic(10, Refill.intervally(10, Duration.ofMinutes(15)))).build();
    }

    private Bucket createPartnerTokenBucket() {
        // 20/min por IP: o parceiro renova o token de hora em hora; não cabe chute de segredo.
        return Bucket.builder().addLimit(Bandwidth.classic(20, Refill.intervally(20, Duration.ofMinutes(1)))).build();
    }

    private Bucket createInviteBucket() {
        // 30 a cada 15 min por IP: abrir o convite e aceitar cabem com folga; varrer tokens, não.
        return Bucket.builder().addLimit(Bandwidth.classic(30, Refill.intervally(30, Duration.ofMinutes(15)))).build();
    }

    private Bucket createRegisterBucket() {
        return Bucket.builder().addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofHours(1)))).build();
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

    /**
     * IP real do cliente. O X-Real-IP e reescrito pelo proxy da stack a partir
     * do endereco que o proxy do host informou (modulo realip, que so confia em
     * redes privadas), entao o cliente nao consegue forja-lo. O primeiro valor
     * do X-Forwarded-For, usado antes, vinha do proprio cliente.
     */
    private String clientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
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
