package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.WriterException;
import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.model.entity.AgentPairingSession;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.AgentPairingService;
import com.pdv2cloud.service.QRCodeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Pareamento automatizado do Agente Mercado Flow.
 *
 * Rotas publicas (usadas pelo agente antes de ter qualquer credencial):
 *   POST /api/v1/agent-pairing/start   — inicia e devolve QR + link
 *   POST /api/v1/agent-pairing/claim   — resgata a API key apos a aprovacao
 *   GET  /api/v1/agent-pairing/session/{userCode} — dados exibidos na pagina web
 *
 * Rota autenticada (usada pela pagina web onde o usuario faz login):
 *   POST /api/v1/agent-pairing/approve — cria o PDV e emite a chave
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/agent-pairing")
@RequiredArgsConstructor
@Slf4j
public class AgentPairingController {

    private final AgentPairingService pairingService;
    private final QRCodeService qrCodeService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> start(@RequestBody(required = false) StartRequest request) {
        String hostname = request != null ? request.getHostname() : null;
        // Escopo de sistema aqui, e não dentro do serviço: o TenantAwareDataSource
        // fixa as variáveis de tenant no checkout da conexão, e o @Transactional
        // do serviço obtém a conexão antes do corpo executar. Marcado lá dentro,
        // o is_admin chegaria tarde demais.
        AgentPairingService.StartedPairing started =
            TenantContext.runAsSystem(() -> pairingService.start(hostname));

        Map<String, Object> response = new HashMap<>();
        response.put("userCode", started.userCode());
        response.put("agentSecret", started.agentSecret());
        response.put("pairingUrl", started.pairingUrl());
        response.put("expiresAt", started.expiresAt());
        response.put("expiresInSeconds", started.expiresInSeconds());

        // O QR carrega apenas a URL de pareamento: e inutil sem que um usuario
        // autenticado aprove, e nao expoe credencial alguma se for fotografado.
        try {
            response.put("qrCode", "data:image/png;base64,"
                + qrCodeService.generateQRCodeBase64(started.pairingUrl(), 360, 360));
        } catch (WriterException | IOException e) {
            log.warn("Falha ao gerar QR Code de pareamento: {}", e.getMessage());
            response.put("qrCode", null);
        }

        return ResponseEntity.ok(response);
    }

    @GetMapping("/session/{userCode}")
    public ResponseEntity<Map<String, Object>> session(@PathVariable("userCode") String userCode) {
        try {
            AgentPairingSession session = pairingService.requirePendingByUserCode(userCode);
            return ResponseEntity.ok(Map.of(
                "userCode", session.getUserCode(),
                "hostname", session.getHostname() == null ? "" : session.getHostname(),
                "status", session.getStatus().name(),
                "expiresAt", session.getExpiresAt()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.GONE).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/approve")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<Map<String, Object>> approve(@Valid @RequestBody ApproveRequest request,
                                                       Authentication authentication) {
        User user = userRepository.findForAuthenticationByEmail(authentication.getName())
            .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado"));

        UUID marketId = resolveMarketId(user, request.getMarketId());

        try {
            AgentPairingService.ApprovedPairing approved = pairingService.approve(
                request.getUserCode(),
                marketId,
                request.getPdvName(),
                user.getId()
            );
            return ResponseEntity.ok(Map.of(
                "status", "APPROVED",
                "marketName", approved.marketName(),
                "pdvName", approved.pdvName(),
                "pdvId", approved.pdvId()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.GONE).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/claim")
    public ResponseEntity<Map<String, Object>> claim(@Valid @RequestBody ClaimRequest request) {
        try {
            AgentPairingService.ClaimResult result = TenantContext.runAsSystem(
                () -> pairingService.claim(request.getUserCode(), request.getAgentSecret()));

            Map<String, Object> response = new HashMap<>();
            response.put("status", result.status());
            if ("APPROVED".equals(result.status())) {
                response.put("apiKey", result.apiKey());
                response.put("marketId", result.marketId());
                response.put("marketName", result.marketName());
                response.put("pdvId", result.pdvId());
                response.put("pdvName", result.pdvName());
            }
            return ResponseEntity.ok(response);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/cancel")
    public ResponseEntity<Void> cancel(@Valid @RequestBody CancelRequest request) {
        TenantContext.runAsSystem(() -> pairingService.cancel(request.getUserCode()));
        return ResponseEntity.noContent().build();
    }

    private UUID resolveMarketId(User user, UUID requestedMarketId) {
        boolean isAdmin = user.getRole() == UserRole.ADMIN;
        if (isAdmin && requestedMarketId != null) {
            return requestedMarketId;
        }
        if (user.getMarket() == null) {
            throw new IllegalArgumentException("Usuário não está vinculado a um mercado");
        }
        return user.getMarket().getId();
    }

    @Data
    public static class StartRequest {
        private String hostname;
    }

    @Data
    public static class ApproveRequest {
        @NotBlank(message = "Informe o código de pareamento")
        private String userCode;

        @NotBlank(message = "Informe o nome do PDV")
        private String pdvName;

        /** Somente ADMIN pode escolher o mercado; demais usuários usam o próprio. */
        private UUID marketId;
    }

    @Data
    public static class ClaimRequest {
        @NotBlank
        private String userCode;

        @NotBlank
        private String agentSecret;
    }

    @Data
    public static class CancelRequest {
        @NotBlank
        private String userCode;
    }
}
