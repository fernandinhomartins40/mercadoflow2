package com.pdv2cloud.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Credencial de serviço dos coletores de catálogo (SEG-08).
 *
 * Os coletores entravam com e-mail e senha do superadmin; com a verificação em
 * duas etapas no superadmin, passam a mandar "Authorization: Bearer
 * &lt;CATALOG_SERVICE_TOKEN&gt;". O token só é aceito nas rotas que eles usam
 * (lista fechada abaixo) e autentica um principal com o papel CATALOG_SERVICE,
 * sem SUPER_ADMIN. Em qualquer outra rota o token é ignorado (401 adiante).
 */
@Component
@Profile("!jobs")
public class CatalogServiceTokenFilter extends OncePerRequestFilter {

    public static final String ROLE = "CATALOG_SERVICE";

    private static final Logger log = LoggerFactory.getLogger(CatalogServiceTokenFilter.class);

    /** Token curto demais não vale: evita ligar a credencial com um valor fraco. */
    static final int MIN_TOKEN_LENGTH = 32;

    private record Route(String method, Pattern path) {}

    private static final String UUID_RE = "[0-9a-fA-F-]{36}";
    private static final String SA = "/api/v1/super-admin/catalog";

    /** O que market_catalog_dispatcher.py e product_image_lookup_service.py chamam. */
    private static final List<Route> SUPER_ADMIN_ROUTES = List.of(
        new Route("GET", Pattern.compile(SA + "/crawler/config")),
        new Route("POST", Pattern.compile(SA + "/crawler/runs/start")),
        new Route("POST", Pattern.compile(SA + "/crawler/runs/claim")),
        new Route("POST", Pattern.compile(SA + "/crawler/runs/" + UUID_RE + "/finish")),
        new Route("GET", Pattern.compile(SA + "/crawler/runs/" + UUID_RE)),
        new Route("GET", Pattern.compile(SA + "/crawler/checkpoints")),
        new Route("POST", Pattern.compile(SA + "/crawler/checkpoints/batch")),
        new Route("POST", Pattern.compile(SA + "/crawler/catalog-image-status")),
        new Route("GET", Pattern.compile(SA + "/image-lookups/pending")),
        new Route("POST", Pattern.compile(SA + "/image-lookups/not-found")),
        new Route("GET", Pattern.compile(SA + "/image-lookups/generic/pending")),
        new Route("POST", Pattern.compile(SA + "/image-lookups/generic/assign")),
        new Route("POST", Pattern.compile(SA + "/image-lookups/generic/not-found")),
        new Route("POST", Pattern.compile(SA + "/generic-images/import"))
    );

    /** Gravação dos produtos coletados (ImportOptions.import_endpoint). Fica em /admin. */
    private static final List<Route> ADMIN_ROUTES = List.of(
        new Route("POST", Pattern.compile("/api/v1/admin/catalog/import/records"))
    );

    private final byte[] expectedDigest;

    public CatalogServiceTokenFilter(@Value("${app.catalog.service-token:}") String token) {
        String t = token == null ? "" : token.trim();
        if (!t.isEmpty() && t.length() < MIN_TOKEN_LENGTH) {
            log.warn("CATALOG_SERVICE_TOKEN com menos de {} caracteres: credencial de serviço desligada", MIN_TOKEN_LENGTH);
            t = "";
        }
        this.expectedDigest = t.isEmpty() ? null : sha256(t);
    }

    /** Rotas de super-admin que o token de serviço pode chamar. */
    public static boolean isSuperAdminCatalogRoute(HttpServletRequest request) {
        return matches(SUPER_ADMIN_ROUTES, request);
    }

    /** Rotas de /admin que o token de serviço pode chamar. */
    public static boolean isAdminCatalogRoute(HttpServletRequest request) {
        return matches(ADMIN_ROUTES, request);
    }

    public static boolean isCatalogServiceRoute(HttpServletRequest request) {
        return isSuperAdminCatalogRoute(request) || isAdminCatalogRoute(request);
    }

    private static boolean matches(List<Route> routes, HttpServletRequest request) {
        String uri = request.getRequestURI();
        String method = request.getMethod();
        if (uri == null || method == null) {
            return false;
        }
        for (Route r : routes) {
            if (r.method().equalsIgnoreCase(method) && r.path().matcher(uri).matches()) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return expectedDigest == null || !isCatalogServiceRoute(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (SecurityContextHolder.getContext().getAuthentication() == null
            && header != null && header.startsWith("Bearer ")
            && matchesToken(header.substring(7).trim())) {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                CatalogServicePrincipal.COLLECTOR, null, List.of(new SimpleGrantedAuthority("ROLE_" + ROLE)));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        // Token diferente: segue para o JWT (login antigo dos coletores, na transição).
        chain.doFilter(request, response);
    }

    /** Comparação em tempo constante (resumos de mesmo tamanho, sem vazar o comprimento). */
    boolean matchesToken(String presented) {
        if (expectedDigest == null || presented == null || presented.isEmpty()) {
            return false;
        }
        return MessageDigest.isEqual(expectedDigest, sha256(presented));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
