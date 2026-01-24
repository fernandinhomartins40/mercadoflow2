package com.pdv2cloud.security;

import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.repository.AgentApiKeyRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AgentApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER_API_KEY = "X-API-Key";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String KEY_PREFIX = "pdv2_";

    @Autowired
    private AgentApiKeyRepository apiKeyRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String apiKey = resolveApiKey(request);
        if (StringUtils.hasText(apiKey)) {
            String keyHash = sha256Hex(apiKey);
            apiKeyRepository.findByKeyHashAndIsActiveTrue(keyHash).ifPresent(record -> {
                record.setLastUsedAt(LocalDateTime.now());
                apiKeyRepository.save(record);
                AgentPrincipal principal = new AgentPrincipal(record.getId(), record.getMarket().getId(), apiKey, record.getName());
                AgentAuthenticationToken authentication = new AgentAuthenticationToken(principal);
                org.springframework.security.core.context.SecurityContextHolder.getContext()
                    .setAuthentication(authentication);
            });
        }
        filterChain.doFilter(request, response);
    }

    private String resolveApiKey(HttpServletRequest request) {
        String headerKey = request.getHeader(HEADER_API_KEY);
        if (StringUtils.hasText(headerKey) && headerKey.startsWith(KEY_PREFIX)) {
            return headerKey;
        }
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith(BEARER_PREFIX)) {
            String token = bearer.substring(BEARER_PREFIX.length());
            if (token.startsWith(KEY_PREFIX)) {
                return token;
            }
        }
        return null;
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash api key", ex);
        }
    }
}
