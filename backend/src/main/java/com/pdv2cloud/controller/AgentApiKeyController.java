package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.AgentApiKeyCreateRequest;
import com.pdv2cloud.model.dto.AgentApiKeyResponse;
import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.AgentApiKeyService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/agent-keys")
public class AgentApiKeyController {

    @Autowired
    private AgentApiKeyService apiKeyService;

    @Autowired
    private UserRepository userRepository;

    @PostMapping
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<AgentApiKeyResponse> create(@Valid @RequestBody AgentApiKeyCreateRequest request,
                                                      Authentication authentication) {
        UUID marketId = resolveMarketId(authentication, request.getMarketId());
        AgentApiKeyService.GeneratedKey generated = apiKeyService.createKey(marketId, request.getName());
        AgentApiKey entity = generated.entity();
        AgentApiKeyResponse response = AgentApiKeyResponse.builder()
            .id(entity.getId())
            .marketId(entity.getMarket().getId())
            .name(entity.getName())
            .keyPrefix(entity.getKeyPrefix())
            .createdAt(entity.getCreatedAt())
            .apiKey(generated.rawKey())
            .build();
        return ResponseEntity.ok(response);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<List<AgentApiKeyResponse>> list(@RequestParam(value = "marketId", required = false) UUID marketId,
                                                          Authentication authentication) {
        UUID resolvedMarketId = resolveMarketId(authentication, marketId);
        List<AgentApiKeyResponse> items = apiKeyService.listActive(resolvedMarketId).stream()
            .map(key -> AgentApiKeyResponse.builder()
                .id(key.getId())
                .marketId(key.getMarket().getId())
                .name(key.getName())
                .keyPrefix(key.getKeyPrefix())
                .createdAt(key.getCreatedAt())
                .build())
            .collect(Collectors.toList());
        return ResponseEntity.ok(items);
    }

    private UUID resolveMarketId(Authentication authentication, UUID requestedMarketId) {
        User user = userRepository.findByEmail(authentication.getName())
            .orElseThrow(() -> new IllegalArgumentException("User not found"));
        boolean isAdmin = user.getRole() == UserRole.ADMIN;
        if (isAdmin && requestedMarketId != null) {
            return requestedMarketId;
        }
        if (user.getMarket() == null) {
            throw new IllegalArgumentException("User is not linked to a market");
        }
        return user.getMarket().getId();
    }
}
