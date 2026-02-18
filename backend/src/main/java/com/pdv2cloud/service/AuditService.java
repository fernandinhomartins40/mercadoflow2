package com.pdv2cloud.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AuditLog;
import com.pdv2cloud.repository.AuditLogRepository;
import com.pdv2cloud.security.AgentPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAction(String entityType, UUID entityId, String action, boolean success, Map<String, Object> details) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            HttpServletRequest request = getCurrentRequest();

            AuditLog.AuditLogBuilder builder = AuditLog.builder()
                    .entityType(entityType)
                    .entityId(entityId)
                    .action(action)
                    .success(success);

            // Determine actor
            if (auth != null && auth.isAuthenticated()) {
                if (auth.getPrincipal() instanceof AgentPrincipal agentPrincipal) {
                    builder.actorType("AGENT")
                            .agentKeyId(agentPrincipal.getAgentKeyId())
                            .marketId(agentPrincipal.getMarketId());
                } else if (auth.getPrincipal() instanceof org.springframework.security.core.userdetails.UserDetails userDetails) {
                    builder.actorType("USER")
                            .userId(extractUserId(userDetails));
                } else {
                    builder.actorType("SYSTEM");
                }
            } else {
                builder.actorType("SYSTEM");
            }

            // Request metadata
            if (request != null) {
                builder.ipAddress(getClientIp(request))
                        .userAgent(request.getHeader("User-Agent"));
            }

            // Details as JSON
            if (details != null && !details.isEmpty()) {
                try {
                    builder.details(objectMapper.writeValueAsString(details));
                } catch (JsonProcessingException e) {
                    log.warn("Failed to serialize audit details", e);
                }
            }

            auditLogRepository.save(builder.build());
        } catch (Exception e) {
            log.error("Failed to create audit log", e);
        }
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logFailure(String entityType, UUID entityId, String action, String errorMessage, Map<String, Object> details) {
        try {
            AuditLog.AuditLogBuilder builder = AuditLog.builder()
                    .entityType(entityType)
                    .entityId(entityId)
                    .action(action)
                    .success(false)
                    .errorMessage(errorMessage);

            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            HttpServletRequest request = getCurrentRequest();

            if (auth != null && auth.isAuthenticated()) {
                if (auth.getPrincipal() instanceof AgentPrincipal agentPrincipal) {
                    builder.actorType("AGENT")
                            .agentKeyId(agentPrincipal.getAgentKeyId())
                            .marketId(agentPrincipal.getMarketId());
                } else {
                    builder.actorType("USER");
                }
            } else {
                builder.actorType("SYSTEM");
            }

            if (request != null) {
                builder.ipAddress(getClientIp(request))
                        .userAgent(request.getHeader("User-Agent"));
            }

            if (details != null && !details.isEmpty()) {
                try {
                    builder.details(objectMapper.writeValueAsString(details));
                } catch (JsonProcessingException e) {
                    log.warn("Failed to serialize audit details", e);
                }
            }

            auditLogRepository.save(builder.build());
        } catch (Exception e) {
            log.error("Failed to create audit failure log", e);
        }
    }

    private UUID extractUserId(org.springframework.security.core.userdetails.UserDetails userDetails) {
        // Extract user ID from UserDetails (implementation depends on your UserDetails structure)
        // Placeholder implementation
        return null;
    }

    private HttpServletRequest getCurrentRequest() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            return attributes != null ? attributes.getRequest() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // If X-Forwarded-For contains multiple IPs, take the first one
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
