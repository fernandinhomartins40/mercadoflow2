package com.pdv2cloud.security;

import com.pdv2cloud.exception.CustomExceptions;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Validates X-Signature HMAC-SHA256 for agent ingest requests.
 *
 * Contract:
 * - Agent sends the raw request JSON body (UTF-8) and computes signature over those bytes.
 * - Secret used is the agent API key (pdv2_...).
 */
@Component
@Profile("!jobs")
public class HmacSignatureFilter extends OncePerRequestFilter {

    private static final String HEADER_SIGNATURE = "X-Signature";
    private static final String HEADER_TIMESTAMP = "X-Request-Timestamp";
    private static final long MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return true;
        }
        // Only protect ingest endpoints.
        if (!path.startsWith("/api/v1/ingest/")) {
            return true;
        }
        // Only validate signature on writes.
        return !"POST".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {

        CachedBodyHttpServletRequest wrapped = new CachedBodyHttpServletRequest(request);

        String signature = wrapped.getHeader(HEADER_SIGNATURE);
        if (!StringUtils.hasText(signature)) {
            throw new CustomExceptions.InvalidSignature("Missing X-Signature header");
        }

        // Validate timestamp to prevent replay attacks
        String timestampHeader = wrapped.getHeader(HEADER_TIMESTAMP);
        if (!StringUtils.hasText(timestampHeader)) {
            throw new CustomExceptions.InvalidSignature("Missing X-Request-Timestamp header");
        }

        try {
            long requestTimestamp = Long.parseLong(timestampHeader);
            long currentTimestamp = System.currentTimeMillis() / 1000; // Unix timestamp in seconds
            long diff = Math.abs(currentTimestamp - requestTimestamp);

            if (diff > MAX_CLOCK_SKEW_SECONDS) {
                throw new CustomExceptions.InvalidSignature(
                    "Request timestamp too old or in future (diff: " + diff + "s). Possible replay attack."
                );
            }
        } catch (NumberFormatException e) {
            throw new CustomExceptions.InvalidSignature("Invalid X-Request-Timestamp format");
        }

        String secret = resolveSecret();
        if (!StringUtils.hasText(secret)) {
            throw new CustomExceptions.InvalidSignature("Missing agent secret");
        }

        String expected = hmacSha256Hex(wrapped.getCachedBody(), secret);
        if (!MessageDigest.isEqual(expected.toLowerCase().getBytes(StandardCharsets.UTF_8),
            signature.trim().toLowerCase().getBytes(StandardCharsets.UTF_8))) {
            throw new CustomExceptions.InvalidSignature("Invalid signature");
        }

        filterChain.doFilter(wrapped, response);
    }

    private String resolveSecret() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof AgentAuthenticationToken) {
            AgentPrincipal principal = (AgentPrincipal) auth.getPrincipal();
            return principal.getApiKey();
        }
        return null;
    }

    private String hmacSha256Hex(byte[] body, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(body);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new CustomExceptions.InvalidSignature("Signature validation error");
        }
    }
}

